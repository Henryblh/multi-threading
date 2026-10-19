package escalonador;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Semaphore;

/**
 * A mensagem em execução: uma thread Java de verdade que só trabalha quando o
 * despachante libera a vez dela.
 *
 * O semáforo {@code vez} nasce com 0 permissões, então a thread fica bloqueada
 * até o despachante chamar {@code release()}. Ela processa no máximo {@code cota}
 * palavras, devolve a CPU liberando {@code cpuLivre} e volta a esperar. Os
 * semáforos também garantem a visibilidade dos campos entre as threads
 * (relação happens-before), por isso não precisam ser volatile.
 */
public final class Tarefa implements Runnable {

    private final Mensagem mensagem;
    private final List<String> palavras;
    private final Semaphore vez = new Semaphore(0);
    private final Semaphore cpuLivre;

    private int proxima;
    private int cota;
    private List<String> ultimaFatia = List.of();
    private String nomeThread = "";

    int inicio = -1;
    int termino = -1;

    Tarefa(Mensagem mensagem, Semaphore cpuLivre) {
        this.mensagem = mensagem;
        this.palavras = mensagem.palavras();
        this.cpuLivre = cpuLivre;
    }

    @Override
    public void run() {
        try {
            while (proxima < palavras.size()) {
                vez.acquire();
                int fim = Math.min(palavras.size(), proxima + cota);
                List<String> feitas = new ArrayList<>();
                for (; proxima < fim; proxima++) {
                    feitas.add(palavras.get(proxima));
                }
                ultimaFatia = feitas;
                nomeThread = Thread.currentThread().getName();
                cpuLivre.release();
            }
        } catch (InterruptedException erro) {
            Thread.currentThread().interrupt();
        }
    }

    /** Chamado pelo despachante: libera a thread para processar até {@code palavras} palavras. */
    void executarFatia(int palavras) throws InterruptedException {
        cota = palavras;
        vez.release();
        cpuLivre.acquire();
    }

    public Mensagem mensagem() { return mensagem; }
    public int id() { return mensagem.id(); }
    public String usuario() { return mensagem.usuario(); }
    public int chegada() { return mensagem.chegada(); }
    public int burst() { return palavras.size(); }
    public int restante() { return palavras.size() - proxima; }
    public boolean terminou() { return proxima >= palavras.size(); }
    List<String> ultimaFatia() { return ultimaFatia; }
    String nomeThread() { return nomeThread; }
}
