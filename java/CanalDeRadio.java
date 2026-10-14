import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.List;
import java.util.Random;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Semaphore;

/**
 * TP3 - Semáforos: um canal de rádio compartilhado.
 *
 * Cada thread é um operador de rádio com uma mensagem própria. O canal só
 * entende uma voz por vez (como um walkie-talkie: fala um, os outros escutam).
 *
 *   Recurso compartilhado .... o canal (frequência de rádio)
 *   Seção crítica ............ transmitir a mensagem inteira, palavra por palavra
 *   Semáforo ................. a permissão para falar no canal
 *
 * SEM controle: todos falam ao mesmo tempo e o receptor ouve as mensagens
 * misturadas; o contador compartilhado de palavras também perde atualizações.
 * COM controle: Semaphore.acquire() antes de falar e release() depois. Cada
 * mensagem chega inteira e o contador fecha certo.
 *
 * Como rodar (Java 11+), a partir da raiz do projeto:
 *   java java/CanalDeRadio.java              -> roda SEM e depois COM controle
 *   java java/CanalDeRadio.java sem          -> só sem controle
 *   java java/CanalDeRadio.java com          -> só com controle
 *   java java/CanalDeRadio.java com 2        -> com controle e 2 frequências (Semaphore(2))
 *   acrescente --sem-cor se o terminal não mostrar cores
 */
public class CanalDeRadio {

    static final String[] NOMES = {"Alfa", "Bravo", "Charlie", "Delta"};
    static final String[] MENSAGENS = {
        "Base chamando Alfa, responda, câmbio.",
        "Bravo solicita pouso na pista três, câmbio.",
        "Charlie na escuta, aguardando ordens, câmbio.",
        "Delta informa céu limpo no setor norte, câmbio.",
    };

    public static void main(String[] args) throws InterruptedException {
        String modo = "ambos";
        int frequencias = 1;
        for (String arg : args) {
            if (arg.equals("--sem-cor")) Console.cores = false;
            else if (arg.matches("\\d+")) frequencias = Math.max(1, Math.min(3, Integer.parseInt(arg)));
            else modo = arg.toLowerCase();
        }
        if (!modo.equals("sem") && !modo.equals("com") && !modo.equals("ambos")) {
            System.out.println("Uso: java java/CanalDeRadio.java [sem|com|ambos] [frequencias 1-3] [--sem-cor]");
            return;
        }

        Resultado sem = null, com = null;
        if (!modo.equals("com")) sem = rodar(false, frequencias);
        if (!modo.equals("sem")) com = rodar(true, frequencias);
        if (sem != null && com != null) Console.comparar(sem, com);
    }

    static Resultado rodar(boolean comControle, int frequencias) throws InterruptedException {
        Canal canal = new Canal(comControle, frequencias);
        CountDownLatch largada = new CountDownLatch(1);
        List<Operador> operadores = new ArrayList<>();
        Random sorteio = new Random();
        for (int i = 0; i < MENSAGENS.length; i++) {
            operadores.add(new Operador(i, NOMES[i], MENSAGENS[i], canal, largada, sorteio.nextLong()));
        }

        Console.cabecalho(comControle, frequencias);
        for (Operador operador : operadores) operador.start();
        Console.iniciarRelogio();
        largada.countDown();                 // todos começam juntos, disputando o canal
        for (Operador operador : operadores) operador.join();

        Resultado resultado = new Resultado(comControle, canal, operadores, Console.agoraMs());
        Console.resumo(resultado);
        return resultado;
    }
}

/** O operador de rádio: uma thread com a sua própria mensagem. */
class Operador extends Thread {
    final int id;
    final String nome;
    final String[] palavras;
    private final Canal canal;
    private final CountDownLatch largada;
    private final Random sorteio;

    Operador(int id, String nome, String mensagem, Canal canal, CountDownLatch largada, long semente) {
        super("T" + id);
        this.id = id;
        this.nome = nome;
        this.palavras = mensagem.split(" ");
        this.canal = canal;
        this.largada = largada;
        this.sorteio = new Random(semente);
    }

    @Override
    public void run() {
        try {
            largada.await();
            int frequencia = canal.entrar(this);           // COM controle: semaforo.acquire()
            try {
                // ===================== SEÇÃO CRÍTICA =====================
                // Transmitir a mensagem inteira no canal compartilhado.
                for (int posicao = 0; posicao < palavras.length; posicao++) {
                    Thread.sleep(30 + sorteio.nextInt(60)); // tempo para "falar" a palavra
                    canal.transmitir(frequencia, this, posicao);
                    canal.contarPalavra();
                }
                // =========================================================
            } finally {
                canal.sair(this, frequencia);              // COM controle: semaforo.release()
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}

/** O recurso compartilhado: o canal de rádio e o contador de palavras. */
class Canal {
    final boolean comControle;
    final int frequencias;

    // Quantas threads podem falar ao mesmo tempo (1 = semáforo binário / mutex).
    private final Semaphore semaforoCanal;
    // Protege o contador. Com 2+ frequências, mais de uma thread fica dentro
    // do canal ao mesmo tempo, então o contador precisa do próprio mutex.
    private final Semaphore mutexContador = new Semaphore(1);
    private final Deque<Integer> frequenciasLivres = new ArrayDeque<>();

    // O que o receptor ouve em cada frequência, na ordem em que chega.
    // A lista é sincronizada porque o receptor é só o instrumento de medida.
    final List<List<int[]>> ouvido = new ArrayList<>();
    int palavrasContadas = 0;                     // contador compartilhado

    Canal(boolean comControle, int frequencias) {
        this.comControle = comControle;
        this.frequencias = frequencias;
        this.semaforoCanal = new Semaphore(frequencias, true); // true = fila justa (FIFO)
        for (int f = 0; f < frequencias; f++) {
            ouvido.add(Collections.synchronizedList(new ArrayList<>()));
            frequenciasLivres.add(f);
        }
    }

    int entrar(Operador operador) throws InterruptedException {
        if (!comControle) {
            // Sem controle ninguém pergunta se o canal está livre: vai falando.
            return operador.id % frequencias;
        }
        Console.evento(operador, "aguarda canal");
        semaforoCanal.acquire();                  // P(): bloqueia se não há permissão livre
        int frequencia;
        synchronized (frequenciasLivres) {
            frequencia = frequenciasLivres.poll();
        }
        Console.evento(operador, "ENTROU f" + (frequencia + 1) + " (livres " + semaforoCanal.availablePermits() + ")");
        return frequencia;
    }

    void transmitir(int frequencia, Operador operador, int posicao) {
        ouvido.get(frequencia).add(new int[] {operador.id, posicao});
        Console.evento(operador, operador.palavras[posicao]);
    }

    void contarPalavra() throws InterruptedException {
        if (comControle) mutexContador.acquire();
        try {
            // "contador++" em três passos: ler, processar, gravar. Se outra
            // thread gravar no meio, a atualização dela é perdida. A pausa
            // alarga essa janela para a disputa aparecer numa demonstração curta.
            int atual = palavrasContadas;
            Thread.sleep(10);
            palavrasContadas = atual + 1;
        } finally {
            if (comControle) mutexContador.release();
        }
    }

    void sair(Operador operador, int frequencia) {
        if (!comControle) {
            Console.evento(operador, "terminou");
            return;
        }
        Console.evento(operador, "SAIU, libera canal");
        synchronized (frequenciasLivres) {
            frequenciasLivres.add(frequencia);
        }
        semaforoCanal.release();                  // V(): devolve a permissão e acorda o próximo
    }
}

/** Confere o que o receptor ouviu. */
class Resultado {
    final boolean comControle;
    final Canal canal;
    final List<Operador> operadores;
    final long duracaoMs;
    final int totalPalavras;
    final int[] interrupcoes;

    Resultado(boolean comControle, Canal canal, List<Operador> operadores, long duracaoMs) {
        this.comControle = comControle;
        this.canal = canal;
        this.operadores = operadores;
        this.duracaoMs = duracaoMs;
        this.totalPalavras = operadores.stream().mapToInt(o -> o.palavras.length).sum();
        this.interrupcoes = new int[operadores.size()];
        for (List<int[]> frequencia : canal.ouvido) {
            for (Operador operador : operadores) {
                int primeira = -1, ultima = -1;
                for (int i = 0; i < frequencia.size(); i++) {
                    if (frequencia.get(i)[0] == operador.id) {
                        if (primeira < 0) primeira = i;
                        ultima = i;
                    }
                }
                for (int i = primeira + 1; primeira >= 0 && i < ultima; i++) {
                    if (frequencia.get(i)[0] != operador.id) interrupcoes[operador.id]++;
                }
            }
        }
    }

    int integras() {
        int total = 0;
        for (int quantidade : interrupcoes) if (quantidade == 0) total++;
        return total;
    }
}

/** Saída no terminal: uma coluna por thread, para enxergar quem fala quando. */
class Console {
    static boolean cores = System.console() != null && System.getenv("NO_COLOR") == null;
    static final String[] COR = {"\u001B[36m", "\u001B[31m", "\u001B[35m", "\u001B[32m"};
    static final String RESET = "\u001B[0m", NEGRITO = "\u001B[1m";
    static final int LARGURA = 22;
    private static long inicio;

    static void iniciarRelogio() { inicio = System.nanoTime(); }
    static long agoraMs() { return (System.nanoTime() - inicio) / 1_000_000; }

    static String pintar(int id, String texto) {
        return cores ? COR[id % COR.length] + texto + RESET : texto;
    }

    static void cabecalho(boolean comControle, int frequencias) {
        String titulo = comControle
            ? "COM CONTROLE: new Semaphore(" + frequencias + ") - " + frequencias + " frequência(s)"
            : "SEM CONTROLE: todos falam quando querem - " + frequencias + " frequência(s)";
        System.out.println();
        System.out.println("=".repeat(8 + LARGURA * CanalDeRadio.NOMES.length));
        System.out.println(cores ? NEGRITO + titulo + RESET : titulo);
        System.out.println("=".repeat(8 + LARGURA * CanalDeRadio.NOMES.length));
        StringBuilder linha = new StringBuilder("  tempo ");
        for (int i = 0; i < CanalDeRadio.NOMES.length; i++) {
            linha.append(pintar(i, coluna("T" + i + " " + CanalDeRadio.NOMES[i])));
        }
        System.out.println(linha);
        System.out.println("-".repeat(8 + LARGURA * CanalDeRadio.NOMES.length));
    }

    // synchronized só para as linhas do terminal não se misturarem: é a
    // ferramenta de observação, não faz parte do experimento.
    static synchronized void evento(Operador operador, String texto) {
        StringBuilder linha = new StringBuilder(String.format("%5dms ", agoraMs()));
        for (int i = 0; i < CanalDeRadio.NOMES.length; i++) {
            linha.append(i == operador.id ? pintar(i, coluna(texto)) : coluna(""));
        }
        System.out.println(linha.toString().stripTrailing());
    }

    static String coluna(String texto) {
        if (texto.length() > LARGURA - 2) texto = texto.substring(0, LARGURA - 3) + "~";
        return String.format("%-" + LARGURA + "s", "| " + texto);
    }

    static void resumo(Resultado r) {
        System.out.println();
        for (int f = 0; f < r.canal.ouvido.size(); f++) {
            System.out.println("O que o receptor ouviu na frequência " + (f + 1) + ":");
            StringBuilder frase = new StringBuilder("  ");
            for (int[] item : r.canal.ouvido.get(f)) {
                frase.append(pintar(item[0], r.operadores.get(item[0]).palavras[item[1]])).append(' ');
            }
            System.out.println(frase);
        }
        System.out.println();
        for (Operador operador : r.operadores) {
            int cortes = r.interrupcoes[operador.id];
            String estado = cortes == 0 ? "OK, chegou inteira" : "QUEBRADA: interrompida por " + cortes + " palavra(s) de outros";
            System.out.println("  " + pintar(operador.id, String.format("T%d %-8s", operador.id, operador.nome)) + estado);
        }
        int perdidas = r.totalPalavras - r.canal.palavrasContadas;
        System.out.println();
        System.out.println("  Mensagens íntegras ....... " + r.integras() + " de " + r.operadores.size());
        System.out.println("  Contador de palavras ..... " + r.canal.palavrasContadas + " (esperado " + r.totalPalavras + ")"
            + (perdidas > 0 ? " -> " + perdidas + " atualização(ões) perdida(s)" : " -> correto"));
        System.out.println("  Tempo total .............. " + r.duracaoMs + " ms");
    }

    static void comparar(Resultado sem, Resultado com) {
        System.out.println();
        System.out.println("=".repeat(8 + LARGURA * CanalDeRadio.NOMES.length));
        System.out.println("COMPARAÇÃO");
        System.out.println(String.format("  %-24s %14s %14s", "", "SEM controle", "COM controle"));
        System.out.println(String.format("  %-24s %14s %14s", "mensagens íntegras",
            sem.integras() + "/" + sem.operadores.size(), com.integras() + "/" + com.operadores.size()));
        System.out.println(String.format("  %-24s %14s %14s", "contador de palavras",
            sem.canal.palavrasContadas + "/" + sem.totalPalavras, com.canal.palavrasContadas + "/" + com.totalPalavras));
        System.out.println(String.format("  %-24s %12dms %12dms", "tempo total", sem.duracaoMs, com.duracaoMs));
        System.out.println();
        System.out.println("  O semáforo garante a integridade, não a velocidade: com controle cada");
        System.out.println("  operador espera a sua vez, então a transmissão leva mais tempo.");
    }
}
