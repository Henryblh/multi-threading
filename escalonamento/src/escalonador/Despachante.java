package escalonador;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.Semaphore;

/**
 * O despachante: decide quem usa a CPU, por quanto tempo, e mede o resultado.
 *
 * Cada mensagem é uma thread real; o sistema operacional continua escalonando
 * essas threads, mas como cada uma só trabalha com a permissão do seu semáforo,
 * só existe uma processando por vez e quem decide a ordem é a {@link Politica}.
 *
 * O tempo é um relógio lógico em ticks (1 palavra = 1 tick), o que deixa os
 * resultados reproduzíveis: a mesma entrada sempre gera a mesma linha do tempo.
 */
public final class Despachante {

    private Despachante() {}

    public static Resultado executar(List<Mensagem> mensagens, Politica politica, int custoTroca)
            throws InterruptedException {
        Semaphore cpuLivre = new Semaphore(0);
        List<Tarefa> tarefas = new ArrayList<>();
        List<Thread> threads = new ArrayList<>();
        for (Mensagem mensagem : mensagens) {
            if (mensagem.burst() == 0) {
                continue;
            }
            Tarefa tarefa = new Tarefa(mensagem, cpuLivre);
            tarefas.add(tarefa);
            threads.add(new Thread(tarefa, "msg-" + mensagem.id() + "-" + mensagem.usuario()));
        }
        List<Tarefa> pendentes = new ArrayList<>(tarefas);
        pendentes.sort(Comparator.comparingInt(Tarefa::chegada).thenComparingInt(Tarefa::id));

        threads.forEach(Thread::start);

        List<Resultado.Fatia> fatias = new ArrayList<>();
        List<Resultado.Troca> trocas = new ArrayList<>();
        int relogio = 0;
        int admitidas = 0;
        int concluidas = 0;
        Tarefa anterior = null;

        try {
            while (concluidas < tarefas.size()) {
                admitidas = admitir(pendentes, admitidas, relogio, politica);
                if (politica.vazia()) {
                    // CPU ociosa: avança até a próxima chegada.
                    relogio = pendentes.get(admitidas).chegada();
                    anterior = null;
                    continue;
                }

                Tarefa atual = politica.proxima();
                if (anterior != null && anterior != atual) {
                    trocas.add(new Resultado.Troca(relogio, relogio + custoTroca, anterior.id(), atual.id()));
                    relogio += custoTroca;
                }
                if (atual.inicio < 0) {
                    atual.inicio = relogio;
                }

                int cota = Math.min(politica.fatia(atual), atual.restante());
                atual.executarFatia(cota);
                fatias.add(new Resultado.Fatia(atual.id(), atual.usuario(), relogio, relogio + cota,
                        atual.ultimaFatia(), atual.nomeThread()));
                relogio += cota;

                // Quem chegou durante a fatia entra na fila antes de a tarefa interrompida voltar.
                admitidas = admitir(pendentes, admitidas, relogio, politica);
                if (atual.terminou()) {
                    atual.termino = relogio;
                    concluidas++;
                    politica.terminou(atual);
                } else {
                    politica.devolver(atual);
                }
                anterior = atual;
            }
        } finally {
            threads.forEach(Thread::interrupt);
            for (Thread thread : threads) {
                thread.join();
            }
        }

        return Resultado.de(politica, tarefas, fatias, trocas, relogio);
    }

    private static int admitir(List<Tarefa> pendentes, int admitidas, int relogio, Politica politica) {
        while (admitidas < pendentes.size() && pendentes.get(admitidas).chegada() <= relogio) {
            politica.adicionar(pendentes.get(admitidas));
            admitidas++;
        }
        return admitidas;
    }
}
