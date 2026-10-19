package escalonador;

import java.util.ArrayDeque;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.Map;
import java.util.PriorityQueue;

/**
 * A fila de prontos. O despachante é sempre o mesmo; trocar a política da fila
 * é o que troca o algoritmo de escalonamento.
 */
public interface Politica {

    String codigo();

    String nome();

    /** Uma mensagem nova chegou ao servidor. */
    void adicionar(Tarefa tarefa);

    /** A tarefa usou o quantum inteiro e ainda tem palavras: volta para a fila. */
    void devolver(Tarefa tarefa);

    /** A tarefa processou a última palavra. */
    default void terminou(Tarefa tarefa) {}

    /** Escolhe (e remove da fila) quem usa a CPU agora. */
    Tarefa proxima();

    boolean vazia();

    /** Máximo de palavras que a tarefa escolhida pode processar antes de devolver a CPU. */
    int fatia(Tarefa tarefa);

    static Politica criar(String codigo, int quantum) {
        return switch (codigo) {
            case "fcfs" -> new Fcfs();
            case "sjf" -> new Sjf();
            case "rr" -> new RoundRobin(quantum);
            case "rr-usuario" -> new RoundRobinPorUsuario(quantum);
            default -> throw new IllegalArgumentException("Algoritmo desconhecido: " + codigo);
        };
    }

    /** First Come, First Served: fila simples, cada mensagem roda até o fim. */
    final class Fcfs implements Politica {
        private final Deque<Tarefa> fila = new ArrayDeque<>();

        public String codigo() { return "fcfs"; }
        public String nome() { return "FCFS"; }
        public void adicionar(Tarefa tarefa) { fila.addLast(tarefa); }
        public void devolver(Tarefa tarefa) { fila.addFirst(tarefa); }
        public Tarefa proxima() { return fila.pollFirst(); }
        public boolean vazia() { return fila.isEmpty(); }
        public int fatia(Tarefa tarefa) { return Integer.MAX_VALUE; }
    }

    /**
     * Shortest Job First (não preemptivo): a menor mensagem pronta roda primeiro e
     * vai até o fim. Empate: quem chegou antes.
     */
    final class Sjf implements Politica {
        private final PriorityQueue<Tarefa> fila = new PriorityQueue<>(
                Comparator.comparingInt(Tarefa::restante)
                        .thenComparingInt(Tarefa::chegada)
                        .thenComparingInt(Tarefa::id));

        public String codigo() { return "sjf"; }
        public String nome() { return "SJF"; }
        public void adicionar(Tarefa tarefa) { fila.add(tarefa); }
        public void devolver(Tarefa tarefa) { fila.add(tarefa); }
        public Tarefa proxima() { return fila.poll(); }
        public boolean vazia() { return fila.isEmpty(); }
        public int fatia(Tarefa tarefa) { return Integer.MAX_VALUE; }
    }

    /** Round Robin: fila circular, cada mensagem processa no máximo {@code quantum} palavras por vez. */
    final class RoundRobin implements Politica {
        private final Deque<Tarefa> fila = new ArrayDeque<>();
        private final int quantum;

        RoundRobin(int quantum) { this.quantum = quantum; }

        public String codigo() { return "rr"; }
        public String nome() { return "Round Robin"; }
        public void adicionar(Tarefa tarefa) { fila.addLast(tarefa); }
        public void devolver(Tarefa tarefa) { fila.addLast(tarefa); }
        public Tarefa proxima() { return fila.pollFirst(); }
        public boolean vazia() { return fila.isEmpty(); }
        public int fatia(Tarefa tarefa) { return quantum; }
    }

    /**
     * Round Robin por usuário (fair queuing): o rodízio é entre pessoas, não entre
     * mensagens. Cada usuário tem a própria fila; quem manda 6 mensagens seguidas
     * continua recebendo uma vez por rodada, igual a quem mandou 1.
     */
    final class RoundRobinPorUsuario implements Politica {
        private final Map<String, Deque<Tarefa>> filas = new HashMap<>();
        private final Deque<String> rodizio = new ArrayDeque<>();
        private final int quantum;
        private String emExecucao;

        RoundRobinPorUsuario(int quantum) { this.quantum = quantum; }

        public String codigo() { return "rr-usuario"; }
        public String nome() { return "RR por usuário"; }

        public void adicionar(Tarefa tarefa) {
            String usuario = tarefa.usuario();
            filas.computeIfAbsent(usuario, chave -> new ArrayDeque<>()).addLast(tarefa);
            if (!usuario.equals(emExecucao) && !rodizio.contains(usuario)) {
                rodizio.addLast(usuario);
            }
        }

        public void devolver(Tarefa tarefa) {
            // A mensagem continua sendo a vez atual daquele usuário; ele vai para o fim do rodízio.
            filas.get(tarefa.usuario()).addFirst(tarefa);
            liberarUsuario(tarefa.usuario());
        }

        public void terminou(Tarefa tarefa) {
            liberarUsuario(tarefa.usuario());
        }

        private void liberarUsuario(String usuario) {
            emExecucao = null;
            if (!filas.get(usuario).isEmpty() && !rodizio.contains(usuario)) {
                rodizio.addLast(usuario);
            }
        }

        public Tarefa proxima() {
            String usuario = rodizio.pollFirst();
            if (usuario == null) {
                return null;
            }
            emExecucao = usuario;
            return filas.get(usuario).pollFirst();
        }

        public boolean vazia() { return rodizio.isEmpty(); }
        public int fatia(Tarefa tarefa) { return quantum; }
    }
}
