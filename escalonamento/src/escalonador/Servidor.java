package escalonador;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;

/**
 * Servidor local do Laboratório do Despachante (só JDK, sem dependências).
 *
 * Uso, a partir da raiz do projeto:
 *   java -cp escalonamento/out escalonador.Servidor              (playground web)
 *   java -cp escalonamento/out escalonador.Servidor --port 8080
 *   java -cp escalonamento/out escalonador.Servidor --terminal spammer
 */
public final class Servidor {

    static final List<String> ALGORITMOS = List.of("fcfs", "sjf", "rr", "rr-usuario");
    private static final int LIMITE_CORPO = 100_000;

    private final Path raiz;

    private Servidor(Path raiz) {
        this.raiz = raiz;
    }

    public static void main(String[] argumentos) throws Exception {
        int porta = 8001;
        String terminal = null;
        for (int i = 0; i < argumentos.length; i++) {
            switch (argumentos[i]) {
                case "--port" -> porta = Integer.parseInt(argumentos[++i]);
                case "--terminal" -> terminal = i + 1 < argumentos.length ? argumentos[++i] : "spammer";
                default -> throw new IllegalArgumentException("Argumento desconhecido: " + argumentos[i]);
            }
        }
        if (terminal != null) {
            Terminal.imprimir(Cenarios.porId(terminal), 4, 1);
            return;
        }

        Servidor servidor = new Servidor(encontrarRaiz());
        HttpServer http = HttpServer.create(new InetSocketAddress("127.0.0.1", porta), 0);
        http.createContext("/", servidor::atender);
        http.setExecutor(Executors.newCachedThreadPool());
        http.start();
        System.out.println("Laboratório do Despachante em http://127.0.0.1:" + porta);
        System.out.println("Pressione Ctrl+C para encerrar.");
    }

    /** Aceita rodar tanto da raiz do projeto quanto de dentro da pasta escalonamento. */
    private static Path encontrarRaiz() {
        for (Path candidata : List.of(Path.of("."), Path.of(".."))) {
            if (Files.isRegularFile(candidata.resolve("escalonamento/web/index.html"))) {
                return candidata.toAbsolutePath().normalize();
            }
        }
        throw new IllegalStateException("Execute a partir da raiz do projeto (pasta com escalonamento/ e web/).");
    }

    private void atender(HttpExchange troca) throws IOException {
        try (troca) {
            String caminho = troca.getRequestURI().getPath();
            String metodo = troca.getRequestMethod();
            try {
                if (metodo.equals("GET")) {
                    servirGet(troca, caminho);
                } else if (metodo.equals("POST") && caminho.equals("/api/escalonar")) {
                    responderJson(troca, 200, escalonar(lerCorpo(troca)));
                } else {
                    responderJson(troca, 404, Map.of("error", "Rota não encontrada."));
                }
            } catch (IllegalArgumentException erro) {
                responderJson(troca, 400, Map.of("error", erro.getMessage()));
            } catch (InterruptedException erro) {
                Thread.currentThread().interrupt();
                responderJson(troca, 500, Map.of("error", "Execução interrompida."));
            }
        }
    }

    private void servirGet(HttpExchange troca, String caminho) throws IOException {
        if (caminho.equals("/api/cenarios")) {
            responderJson(troca, 200, Map.of(
                    "cenarios", Cenarios.todos().stream().map(Cenarios.Cenario::comoMapa).toList()));
            return;
        }
        Map<String, Object[]> arquivos = Map.of(
                "/", new Object[]{"escalonamento/web/index.html", "text/html; charset=utf-8"},
                // A folha de estilo do laboratório da parte 1 é compartilhada para manter a mesma estética.
                "/static/styles.css", new Object[]{"web/styles.css", "text/css; charset=utf-8"},
                "/static/escalonamento.css", new Object[]{"escalonamento/web/escalonamento.css", "text/css; charset=utf-8"},
                "/static/escalonamento.js", new Object[]{"escalonamento/web/escalonamento.js", "application/javascript; charset=utf-8"});
        Object[] arquivo = arquivos.get(caminho);
        Path alvo = arquivo == null ? null : raiz.resolve((String) arquivo[0]);
        if (alvo == null || !Files.isRegularFile(alvo)) {
            responderJson(troca, 404, Map.of("error", "Rota não encontrada."));
            return;
        }
        troca.getResponseHeaders().set("Content-Type", (String) arquivo[1]);
        troca.getResponseHeaders().set("Cache-Control", "no-store");
        enviar(troca, 200, Files.readAllBytes(alvo));
    }

    private static Object lerCorpo(HttpExchange troca) throws IOException {
        try (InputStream entrada = troca.getRequestBody()) {
            byte[] dados = entrada.readNBytes(LIMITE_CORPO + 1);
            if (dados.length > LIMITE_CORPO) {
                throw new IllegalArgumentException("A requisição é grande demais.");
            }
            return Json.ler(new String(dados, StandardCharsets.UTF_8));
        }
    }

    /** Roda o mesmo canal com cada algoritmo pedido e devolve as linhas do tempo e métricas. */
    static Map<String, Object> escalonar(Object corpo) throws InterruptedException {
        if (!(corpo instanceof Map<?, ?> dados)) {
            throw new IllegalArgumentException("O corpo precisa ser um objeto JSON.");
        }
        List<Mensagem> mensagens = mensagensDe(dados.get("mensagens"));
        int quantum = inteiro(dados, "quantum", 4, 1, 50);
        int custoTroca = inteiro(dados, "custo_troca", 1, 0, 5);

        Object pedidos = dados.containsKey("algoritmos") ? dados.get("algoritmos") : ALGORITMOS;
        if (!(pedidos instanceof List<?> lista) || lista.isEmpty()
                || !lista.stream().allMatch(ALGORITMOS::contains)) {
            throw new IllegalArgumentException("Escolha algoritmos entre " + ALGORITMOS + ".");
        }

        List<Object> resultados = new ArrayList<>();
        for (Object codigo : lista.stream().distinct().toList()) {
            Politica politica = Politica.criar((String) codigo, quantum);
            resultados.add(Despachante.executar(mensagens, politica, custoTroca).comoMapa());
        }
        Map<String, Object> resposta = new LinkedHashMap<>();
        resposta.put("quantum", quantum);
        resposta.put("custo_troca", custoTroca);
        resposta.put("resultados", resultados);
        return resposta;
    }

    static List<Mensagem> mensagensDe(Object valor) {
        if (!(valor instanceof List<?> lista) || lista.isEmpty() || lista.size() > 30) {
            throw new IllegalArgumentException("Envie de 1 a 30 mensagens.");
        }
        List<Mensagem> mensagens = new ArrayList<>();
        for (Object item : lista) {
            if (!(item instanceof Map<?, ?> dados)
                    || !(dados.get("usuario") instanceof String usuario)
                    || !(dados.get("texto") instanceof String texto)) {
                throw new IllegalArgumentException("Cada mensagem precisa de usuario e texto.");
            }
            usuario = usuario.trim();
            if (usuario.isEmpty() || usuario.length() > 24) {
                throw new IllegalArgumentException("Use nomes de usuário com 1 a 24 caracteres.");
            }
            int chegada = inteiro(dados, "chegada", 0, 0, 1000);
            Mensagem mensagem = new Mensagem(mensagens.size() + 1, usuario, texto, chegada);
            if (mensagem.burst() < 1 || mensagem.burst() > 200) {
                throw new IllegalArgumentException("Cada mensagem precisa ter de 1 a 200 palavras.");
            }
            mensagens.add(mensagem);
        }
        return mensagens;
    }

    private static int inteiro(Map<?, ?> dados, String nome, int padrao, int minimo, int maximo) {
        Object valor = dados.containsKey(nome) ? dados.get(nome) : (double) padrao;
        if (!(valor instanceof Double numero) || numero != Math.rint(numero) || numero < minimo || numero > maximo) {
            throw new IllegalArgumentException(nome + " precisa ser um inteiro entre " + minimo + " e " + maximo + ".");
        }
        return numero.intValue();
    }

    private static void responderJson(HttpExchange troca, int status, Object corpo) throws IOException {
        troca.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        enviar(troca, status, Json.escrever(corpo).getBytes(StandardCharsets.UTF_8));
    }

    private static void enviar(HttpExchange troca, int status, byte[] dados) throws IOException {
        troca.sendResponseHeaders(status, dados.length);
        try (OutputStream saida = troca.getResponseBody()) {
            saida.write(dados);
        }
    }
}
