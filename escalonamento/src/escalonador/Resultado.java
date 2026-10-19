package escalonador;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** Tudo o que uma execução produziu: a linha do tempo e as métricas. */
public record Resultado(
        String algoritmo,
        String nome,
        List<Fatia> fatias,
        List<Troca> trocas,
        List<Metrica> tarefas,
        Resumo resumo) {

    /** Um trecho em que uma mensagem esteve na CPU, de {@code inicio} até {@code fim} (exclusivo). */
    public record Fatia(int tarefa, String usuario, int inicio, int fim, List<String> palavras, String thread) {}

    /** Uma troca de contexto entre duas mensagens diferentes. */
    public record Troca(int inicio, int fim, int de, int para) {}

    /**
     * Métricas clássicas de uma mensagem:
     * resposta = início - chegada (quanto demorou para a primeira palavra aparecer);
     * retorno  = término - chegada (turnaround);
     * espera   = retorno - burst  (tempo parado na fila).
     */
    public record Metrica(int tarefa, String usuario, int chegada, int burst, int inicio, int termino,
                          int resposta, int retorno, int espera) {}

    /**
     * respostaPorPessoa: média, entre os usuários, da resposta média de cada um. Mede justiça
     * entre pessoas: quem manda 5 mensagens conta uma vez, igual a quem mandou 1.
     */
    public record Resumo(double respostaMedia, double respostaPorPessoa, double esperaMedia, double retornoMedio,
                         int piorResposta, int piorEspera, int trocas, int tempoTotal) {}

    static Resultado de(Politica politica, List<Tarefa> tarefas, List<Fatia> fatias, List<Troca> trocas, int fim) {
        List<Metrica> metricas = tarefas.stream()
                .map(tarefa -> {
                    int retorno = tarefa.termino - tarefa.chegada();
                    return new Metrica(tarefa.id(), tarefa.usuario(), tarefa.chegada(), tarefa.burst(),
                            tarefa.inicio, tarefa.termino, tarefa.inicio - tarefa.chegada(), retorno,
                            retorno - tarefa.burst());
                })
                .toList();
        Resumo resumo = new Resumo(
                metricas.stream().mapToInt(Metrica::resposta).average().orElse(0),
                metricas.stream()
                        .collect(Collectors.groupingBy(Metrica::usuario, Collectors.averagingInt(Metrica::resposta)))
                        .values().stream().mapToDouble(Double::doubleValue).average().orElse(0),
                metricas.stream().mapToInt(Metrica::espera).average().orElse(0),
                metricas.stream().mapToInt(Metrica::retorno).average().orElse(0),
                metricas.stream().mapToInt(Metrica::resposta).max().orElse(0),
                metricas.stream().mapToInt(Metrica::espera).max().orElse(0),
                trocas.size(),
                fim);
        return new Resultado(politica.codigo(), politica.nome(), fatias, trocas, metricas, resumo);
    }

    public Map<String, Object> comoMapa() {
        return Map.of(
                "algoritmo", algoritmo,
                "nome", nome,
                "fatias", fatias.stream().map(f -> Map.of(
                        "tarefa", f.tarefa(), "usuario", f.usuario(), "inicio", f.inicio(),
                        "fim", f.fim(), "palavras", f.palavras(), "thread", f.thread())).toList(),
                "trocas", trocas.stream().map(t -> Map.of(
                        "inicio", t.inicio(), "fim", t.fim(), "de", t.de(), "para", t.para())).toList(),
                "tarefas", tarefas.stream().map(m -> Map.of(
                        "tarefa", m.tarefa(), "usuario", m.usuario(), "chegada", m.chegada(),
                        "burst", m.burst(), "inicio", m.inicio(), "termino", m.termino(),
                        "resposta", m.resposta(), "retorno", m.retorno(), "espera", m.espera())).toList(),
                "resumo", Map.of(
                        "resposta_media", resumo.respostaMedia(), "resposta_por_pessoa", resumo.respostaPorPessoa(),
                        "espera_media", resumo.esperaMedia(),
                        "retorno_medio", resumo.retornoMedio(), "pior_resposta", resumo.piorResposta(),
                        "pior_espera", resumo.piorEspera(), "trocas", resumo.trocas(),
                        "tempo_total", resumo.tempoTotal()));
    }
}
