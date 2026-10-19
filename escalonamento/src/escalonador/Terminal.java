package escalonador;

import java.util.List;

/** Versão de terminal: compara os algoritmos num cenário e desenha um Gantt em texto. */
final class Terminal {

    private Terminal() {}

    static void imprimir(Cenarios.Cenario cenario, int quantum, int custoTroca) throws InterruptedException {
        System.out.println("Cenário: " + cenario.nome() + " — " + cenario.descricao());
        System.out.println("quantum = " + quantum + " palavras | troca de contexto = " + custoTroca + " tick(s)");
        System.out.println("# = na CPU   . = esperando na fila\n");

        for (String codigo : Servidor.ALGORITMOS) {
            Resultado resultado = Despachante.executar(cenario.mensagens(), Politica.criar(codigo, quantum), custoTroca);
            System.out.println("== " + resultado.nome() + " ==");
            for (Resultado.Metrica tarefa : resultado.tarefas()) {
                System.out.printf("%-8s #%-2d %s%n", tarefa.usuario(), tarefa.tarefa(),
                        linha(resultado.fatias(), tarefa, resultado.resumo().tempoTotal()));
            }
            Resultado.Resumo resumo = resultado.resumo();
            System.out.printf("resposta média %.1f | por pessoa %.1f | espera média %.1f | retorno médio %.1f | "
                            + "pior espera %d | trocas %d | tempo total %d%n%n",
                    resumo.respostaMedia(), resumo.respostaPorPessoa(), resumo.esperaMedia(), resumo.retornoMedio(),
                    resumo.piorEspera(), resumo.trocas(), resumo.tempoTotal());
        }
    }

    private static String linha(List<Resultado.Fatia> fatias, Resultado.Metrica tarefa, int total) {
        char[] tempo = new char[total];
        for (int t = 0; t < total; t++) {
            tempo[t] = t >= tarefa.chegada() && t < tarefa.termino() ? '.' : ' ';
        }
        for (Resultado.Fatia fatia : fatias) {
            if (fatia.tarefa() == tarefa.tarefa()) {
                for (int t = fatia.inicio(); t < fatia.fim(); t++) {
                    tempo[t] = '#';
                }
            }
        }
        return new String(tempo);
    }
}
