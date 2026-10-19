package escalonador;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.Semaphore;

/**
 * TP3 (rascunho isolado): a seção crítica do chat, sem e com semáforo.
 *
 * Cada mensagem primeiro é digitada num rascunho local (1 palavra = 1 tick). Isso
 * não toca em nada compartilhado, então fica fora da seção crítica e o Round Robin
 * alterna as threads livremente, com ou sem semáforo. Só a publicação mexe em
 * memória compartilhada:
 *
 *   int id = canal.proximoId;          // 1. lê o próximo número livre
 *   historico[id] = palavra por palavra // 2. escreve (1 palavra = 1 tick)
 *   canal.proximoId = id + 1;          // 3. grava o próximo número
 *
 * Cada mensagem é uma thread real, e o despachante concede um passo por vez. Com
 * Round Robin ele pode tirar a CPU no meio desses passos, como faz o sistema
 * operacional, e aparece a condição de corrida mesmo com uma CPU só. Com controle,
 * os passos ficam entre P() e V() de um semáforo de Dijkstra (contador + fila
 * de bloqueados) simulado pelo despachante, para que dê para ver por dentro.
 *
 * Terminal: java -cp escalonamento/out escalonador.SecaoCritica
 */
public final class SecaoCritica {

    enum Passo { DIGITAR, P, LER, ESCREVER, GRAVAR, V, FIM }

    private SecaoCritica() {}

    /** A memória compartilhada do canal. Nada aqui é protegido por si só. */
    static final class Canal {
        int proximoId;
        final Map<Integer, List<String[]>> historico = new TreeMap<>();

        void escrever(int id, int posicao, String palavra, String autor) {
            List<String[]> slot = historico.computeIfAbsent(id, chave -> new ArrayList<>());
            while (slot.size() <= posicao) slot.add(null);
            slot.set(posicao, new String[]{palavra, autor});
        }
    }

    /**
     * A thread de uma mensagem. Antes de cada passo ela anuncia qual é e espera o
     * despachante conceder ({@code vez}); depois de executar, anuncia o próximo
     * ({@code pronto}). Assim o despachante sabe se o passo é P, V ou trabalho.
     */
    static final class Operador implements Runnable {
        final Mensagem mensagem;
        final List<String> palavras;
        private final Canal canal;
        private final boolean controle;
        private final Semaphore vez = new Semaphore(0);
        private final Semaphore pronto = new Semaphore(0);

        Passo proximo;
        String detalhe = "";
        int idLido = -1;
        boolean temPermissao;
        int inicio = -1;
        int termino = -1;
        int ticksCpu;
        int ticksBloqueada;

        Operador(Mensagem mensagem, Canal canal, boolean controle) {
            this.mensagem = mensagem;
            this.palavras = mensagem.palavras();
            this.canal = canal;
            this.controle = controle;
        }

        @Override
        public void run() {
            try {
                // Fora da seção crítica: só mexe no rascunho local da própria thread.
                List<String> rascunho = new ArrayList<>();
                for (String palavra : palavras) {
                    anunciar(Passo.DIGITAR);
                    rascunho.add(palavra);
                    detalhe = "digita \"" + palavra + "\" no rascunho (fora da seção crítica)";
                }
                if (controle) anunciar(Passo.P);
                // ===================== SEÇÃO CRÍTICA =====================
                anunciar(Passo.LER);
                int id = canal.proximoId;
                idLido = id;
                detalhe = "lê proximoId = " + id;
                for (int posicao = 0; posicao < rascunho.size(); posicao++) {
                    anunciar(Passo.ESCREVER);
                    canal.escrever(id, posicao, rascunho.get(posicao), mensagem.usuario());
                    detalhe = "escreve \"" + rascunho.get(posicao) + "\" em #" + id + "[" + posicao + "]";
                }
                anunciar(Passo.GRAVAR);
                canal.proximoId = id + 1;
                detalhe = "grava proximoId = " + (id + 1);
                // =========================================================
                if (controle) anunciar(Passo.V);
                proximo = Passo.FIM;
                pronto.release();
            } catch (InterruptedException erro) {
                Thread.currentThread().interrupt();
            }
        }

        private void anunciar(Passo passo) throws InterruptedException {
            proximo = passo;
            pronto.release();
            vez.acquire();
        }

        /** Despachante: espera a thread anunciar o primeiro passo. */
        void aguardarAnuncio() throws InterruptedException { pronto.acquire(); }

        /** Despachante: deixa a thread executar o passo anunciado e espera o próximo anúncio. */
        void conceder() throws InterruptedException {
            vez.release();
            pronto.acquire();
        }

        int id() { return mensagem.id(); }
        String usuario() { return mensagem.usuario(); }
    }

    /** O semáforo da definição de Dijkstra: um contador e uma fila de bloqueados. */
    static final class SemaforoDijkstra {
        int valor = 1;
        final Deque<Operador> bloqueados = new ArrayDeque<>();
    }

    public static Map<String, Object> executar(List<Mensagem> mensagens, String algoritmo, int quantum,
                                               boolean controle, int idInicial) throws InterruptedException {
        int fatia = switch (algoritmo) {
            case "fcfs" -> Integer.MAX_VALUE;
            case "rr" -> quantum;
            default -> throw new IllegalArgumentException("Use fcfs ou rr.");
        };
        Canal canal = new Canal();
        canal.proximoId = idInicial;
        SemaforoDijkstra semaforo = new SemaforoDijkstra();

        List<Operador> operadores = new ArrayList<>();
        List<Thread> threads = new ArrayList<>();
        for (Mensagem mensagem : mensagens) {
            Operador operador = new Operador(mensagem, canal, controle);
            operadores.add(operador);
            threads.add(new Thread(operador, "msg-" + mensagem.id() + "-" + mensagem.usuario()));
        }
        List<Operador> pendentes = new ArrayList<>(operadores);
        pendentes.sort(Comparator.comparingInt((Operador o) -> o.mensagem.chegada()).thenComparingInt(Operador::id));

        Deque<Operador> prontos = new ArrayDeque<>();
        List<Operador> concluidos = new ArrayList<>();
        List<Map<String, Object>> instantes = new ArrayList<>();
        int relogio = 0, admitidos = 0, usado = 0, trocas = 0, bloqueios = 0;
        Operador atual = null, anterior = null;

        for (Thread thread : threads) thread.start();
        try {
            for (Operador operador : operadores) operador.aguardarAnuncio();

            while (true) {
                List<String> eventos = new ArrayList<>();
                while (admitidos < pendentes.size() && pendentes.get(admitidos).mensagem.chegada() <= relogio) {
                    Operador chegou = pendentes.get(admitidos++);
                    prontos.addLast(chegou);
                    eventos.add(chegou.usuario() + " #" + chegou.id() + " chegou");
                }

                // Resolve tudo o que não gasta tick (P, V, fim, preempção) até sobrar um passo de trabalho.
                while (true) {
                    if (atual == null) {
                        atual = prontos.pollFirst();
                        usado = 0;
                        if (atual == null) break;
                    }
                    Passo passo = atual.proximo;
                    if (passo == Passo.FIM) {
                        atual.termino = relogio;
                        concluidos.add(atual);
                        eventos.add(atual.usuario() + " #" + atual.id() + " terminou");
                        atual = null;
                    } else if (usado >= fatia) {
                        prontos.addLast(atual);
                        eventos.add("quantum acabou: " + atual.usuario() + " #" + atual.id() + " volta para a fila"
                                + (atual.idLido >= 0 && passo != Passo.V ? " no meio da seção crítica" : ""));
                        atual = null;
                    } else if (passo == Passo.P) {
                        if (atual.temPermissao) {
                            atual.temPermissao = false;
                            eventos.add(atual.usuario() + " #" + atual.id() + " foi acordada e entra na seção crítica");
                            atual.conceder();
                        } else if (semaforo.valor > 0) {
                            semaforo.valor--;
                            eventos.add("P() de " + atual.usuario() + " #" + atual.id() + ": semáforo 1 → 0, entra");
                            atual.conceder();
                        } else {
                            semaforo.bloqueados.addLast(atual);
                            bloqueios++;
                            eventos.add("P() de " + atual.usuario() + " #" + atual.id() + ": semáforo = 0, bloqueada");
                            atual = null;
                        }
                    } else if (passo == Passo.V) {
                        Operador acordado = semaforo.bloqueados.pollFirst();
                        if (acordado != null) {
                            acordado.temPermissao = true;
                            prontos.addLast(acordado);
                            eventos.add("V() de " + atual.usuario() + " #" + atual.id() + ": acorda "
                                    + acordado.usuario() + " #" + acordado.id() + " (volta para a fila de prontos)");
                        } else {
                            semaforo.valor++;
                            eventos.add("V() de " + atual.usuario() + " #" + atual.id() + ": semáforo 0 → 1");
                        }
                        atual.conceder();
                    } else {
                        break;
                    }
                }

                if (concluidos.size() == operadores.size()) {
                    instantes.add(instante(relogio, null, eventos, operadores, prontos, semaforo, concluidos, canal, admitidos, pendentes));
                    break;
                }
                if (atual == null) {
                    if (admitidos >= pendentes.size()) {
                        throw new IllegalStateException("Impasse: todas as threads restantes estão bloqueadas.");
                    }
                    instantes.add(instante(relogio, null, eventos, operadores, prontos, semaforo, concluidos, canal, admitidos, pendentes));
                    relogio = pendentes.get(admitidos).mensagem.chegada();
                    anterior = null;
                    continue;
                }

                if (anterior != null && anterior != atual) trocas++;
                if (atual.inicio < 0) atual.inicio = relogio;
                Passo passo = atual.proximo;
                atual.conceder();
                Map<String, Object> agora = instante(relogio, atual, eventos, operadores, prontos, semaforo,
                        concluidos, canal, admitidos, pendentes);
                agora.put("passo", passo.name());
                agora.put("detalhe", atual.detalhe);
                instantes.add(agora);
                atual.ticksCpu++;
                semaforo.bloqueados.forEach(bloqueada -> bloqueada.ticksBloqueada++);
                anterior = atual;
                usado++;
                relogio++;
            }
        } finally {
            threads.forEach(Thread::interrupt);
            for (Thread thread : threads) thread.join();
        }

        Map<String, Object> resposta = new LinkedHashMap<>();
        resposta.put("algoritmo", algoritmo);
        resposta.put("quantum", quantum);
        resposta.put("controle", controle);
        resposta.put("id_inicial", idInicial);
        resposta.put("instantes", instantes);
        resposta.put("verificacao", verificar(operadores, canal, idInicial));
        resposta.put("tarefas", operadores.stream().map(o -> {
            Map<String, Object> tarefa = new LinkedHashMap<>();
            int retorno = o.termino - o.mensagem.chegada();
            tarefa.put("tarefa", o.id());
            tarefa.put("usuario", o.usuario());
            tarefa.put("chegada", o.mensagem.chegada());
            tarefa.put("inicio", o.inicio);
            tarefa.put("termino", o.termino);
            tarefa.put("resposta", o.inicio - o.mensagem.chegada());
            tarefa.put("retorno", retorno);
            tarefa.put("espera", retorno - o.ticksCpu);
            tarefa.put("bloqueada", o.ticksBloqueada);
            return tarefa;
        }).toList());
        Map<String, Object> resumo = new LinkedHashMap<>();
        resumo.put("tempo_total", relogio);
        resumo.put("trocas", trocas);
        resumo.put("bloqueios", bloqueios);
        resumo.put("tempo_bloqueado", operadores.stream().mapToInt(o -> o.ticksBloqueada).sum());
        resumo.put("resposta_media", operadores.stream().mapToInt(o -> o.inicio - o.mensagem.chegada()).average().orElse(0));
        resumo.put("espera_media", operadores.stream()
                .mapToInt(o -> o.termino - o.mensagem.chegada() - o.ticksCpu).average().orElse(0));
        resumo.put("retorno_medio", operadores.stream().mapToInt(o -> o.termino - o.mensagem.chegada()).average().orElse(0));
        resposta.put("resumo", resumo);
        return resposta;
    }

    private static Map<String, Object> instante(int t, Operador cpu, List<String> eventos, List<Operador> operadores,
                                                Deque<Operador> prontos, SemaforoDijkstra semaforo,
                                                List<Operador> concluidos, Canal canal, int admitidos,
                                                List<Operador> pendentes) {
        Map<String, Object> estados = new LinkedHashMap<>();
        for (Operador operador : operadores) {
            String estado;
            if (operador == cpu) estado = "cpu";
            else if (concluidos.contains(operador)) estado = "feita";
            else if (semaforo.bloqueados.contains(operador)) estado = "bloqueada";
            else if (pendentes.indexOf(operador) >= admitidos) estado = "ausente";
            else estado = "pronta";
            Map<String, Object> info = new LinkedHashMap<>();
            info.put("estado", estado);
            info.put("id_lido", operador.idLido);
            estados.put(String.valueOf(operador.id()), info);
        }
        Map<String, Object> mapa = new LinkedHashMap<>();
        mapa.put("t", t);
        mapa.put("tarefa", cpu == null ? null : cpu.id());
        mapa.put("eventos", eventos);
        mapa.put("estados", estados);
        mapa.put("fila_prontos", prontos.stream().map(Operador::id).toList());
        mapa.put("proximo_id", canal.proximoId);
        mapa.put("semaforo", Map.of("valor", semaforo.valor,
                "bloqueados", semaforo.bloqueados.stream().map(Operador::id).toList()));
        mapa.put("historico", historico(canal));
        return mapa;
    }

    private static List<Object> historico(Canal canal) {
        List<Object> slots = new ArrayList<>();
        canal.historico.forEach((id, palavras) -> slots.add(Map.of(
                "id", id,
                "palavras", palavras.stream().map(p -> p == null
                        ? Map.of("palavra", "", "autor", "")
                        : Map.of("palavra", p[0], "autor", p[1])).toList())));
        return slots;
    }

    /** Confere o resultado: contador certo, um id por mensagem, cada mensagem inteira no histórico. */
    static Map<String, Object> verificar(List<Operador> operadores, Canal canal, int idInicial) {
        int esperado = idInicial + operadores.size();
        Map<Integer, List<Integer>> leitores = new TreeMap<>();
        for (Operador operador : operadores) {
            leitores.computeIfAbsent(operador.idLido, chave -> new ArrayList<>()).add(operador.id());
        }
        List<Object> duplicados = new ArrayList<>();
        leitores.forEach((id, quem) -> {
            if (quem.size() > 1) duplicados.add(Map.of("id", id, "tarefas", quem));
        });

        List<Object> slots = new ArrayList<>();
        int corrompidos = 0;
        List<Integer> intactas = new ArrayList<>();
        for (Map.Entry<Integer, List<String[]>> slot : canal.historico.entrySet()) {
            List<String> autores = slot.getValue().stream().map(p -> p == null ? "" : p[1]).distinct().toList();
            String texto = String.join(" ", slot.getValue().stream().map(p -> p == null ? "?" : p[0]).toList());
            Operador dono = operadores.stream()
                    .filter(o -> o.idLido == slot.getKey() && autores.equals(List.of(o.usuario()))
                            && String.join(" ", o.palavras).equals(texto))
                    .findFirst().orElse(null);
            boolean integro = dono != null;
            if (integro) intactas.add(dono.id()); else corrompidos++;
            slots.add(Map.of("id", slot.getKey(), "texto", texto, "autores", autores, "integro", integro));
        }
        List<Integer> perdidas = operadores.stream().map(Operador::id).filter(id -> !intactas.contains(id)).toList();

        Map<String, Object> mapa = new LinkedHashMap<>();
        mapa.put("proximo_id_esperado", esperado);
        mapa.put("proximo_id_obtido", canal.proximoId);
        mapa.put("duplicados", duplicados);
        mapa.put("slots", slots);
        mapa.put("slots_corrompidos", corrompidos);
        mapa.put("mensagens_com_problema", perdidas);
        mapa.put("ok", perdidas.isEmpty() && esperado == canal.proximoId);
        return mapa;
    }

    /** Cenário padrão: três mensagens que chegam quase juntas, com proximoId começando em 7. */
    public static List<Mensagem> cenarioPadrao() {
        return List.of(
                new Mensagem(1, "Bruno", "alguem ai pode ajudar", 0),
                new Mensagem(2, "Ana", "calma bruno ja vou", 1),
                new Mensagem(3, "Carla", "servidor voltou agora", 2));
    }

    public static void main(String[] argumentos) throws InterruptedException {
        for (String algoritmo : List.of("fcfs", "rr")) {
            for (boolean controle : List.of(false, true)) {
                Map<String, Object> r = executar(cenarioPadrao(), algoritmo, 2, controle, 7);
                @SuppressWarnings("unchecked")
                Map<String, Object> v = (Map<String, Object>) r.get("verificacao");
                System.out.printf("%-4s %-14s proximoId %s (esperado %s) | slots %s | %s%n",
                        algoritmo.toUpperCase(), controle ? "COM semáforo" : "SEM semáforo",
                        v.get("proximo_id_obtido"), v.get("proximo_id_esperado"), v.get("slots"),
                        Boolean.TRUE.equals(v.get("ok")) ? "ÍNTEGRO" : "CORROMPIDO");
            }
        }
    }
}
