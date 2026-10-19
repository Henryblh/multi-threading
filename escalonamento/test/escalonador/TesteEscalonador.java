package escalonador;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Testes sem dependências externas: cada método estático começando com "testa"
 * é executado; uma falha é qualquer exceção.
 *
 *   javac -encoding UTF-8 -d escalonamento/out escalonamento/src/escalonador/*.java escalonamento/test/escalonador/*.java
 *   java -cp escalonamento/out escalonador.TesteEscalonador
 */
public final class TesteEscalonador {

    public static void main(String[] argumentos) throws Exception {
        int falhas = 0;
        int total = 0;
        for (Method metodo : TesteEscalonador.class.getDeclaredMethods()) {
            if (!metodo.getName().startsWith("testa") || !Modifier.isStatic(metodo.getModifiers())) {
                continue;
            }
            total++;
            try {
                metodo.invoke(null);
                System.out.println("ok    " + metodo.getName());
            } catch (Exception erro) {
                falhas++;
                Throwable causa = erro.getCause() != null ? erro.getCause() : erro;
                System.out.println("FALHA " + metodo.getName() + ": " + causa);
            }
        }
        System.out.println("\n" + (total - falhas) + "/" + total + " testes passaram.");
        if (falhas > 0) {
            System.exit(1);
        }
    }

    // ---- utilitários ----

    private static Resultado rodar(String algoritmo, List<Mensagem> mensagens, int quantum, int custo) throws Exception {
        return Despachante.executar(mensagens, Politica.criar(algoritmo, quantum), custo);
    }

    private static Resultado.Metrica tarefa(Resultado resultado, int id) {
        return resultado.tarefas().stream().filter(m -> m.tarefa() == id).findFirst().orElseThrow();
    }

    private static void confirmar(boolean condicao, String mensagem) {
        if (!condicao) throw new AssertionError(mensagem);
    }

    private static void iguais(Object esperado, Object obtido, String mensagem) {
        if (!esperado.equals(obtido)) {
            throw new AssertionError(mensagem + " (esperado " + esperado + ", obtido " + obtido + ")");
        }
    }

    private static List<Mensagem> mensagens(Object... dados) {
        List<Mensagem> lista = new ArrayList<>();
        for (int i = 0; i < dados.length; i += 3) {
            lista.add(new Mensagem(lista.size() + 1, (String) dados[i], (String) dados[i + 2], (Integer) dados[i + 1]));
        }
        return lista;
    }

    // ---- testes ----

    static void testaFcfsRodaNaOrdemDeChegadaAteOFim() throws Exception {
        Resultado r = rodar("fcfs", mensagens("A", 0, "a b c d e", "B", 1, "x", "C", 2, "y z"), 2, 0);
        iguais(List.of(1, 2, 3), r.fatias().stream().map(Resultado.Fatia::tarefa).toList(), "ordem das fatias");
        iguais(5, tarefa(r, 2).inicio(), "B só começa quando A termina");
        iguais(4, tarefa(r, 2).resposta(), "resposta de B");
    }

    static void testaSjfEscolheAMenorMensagemPronta() throws Exception {
        Resultado r = rodar("sjf", mensagens("A", 0, "a", "B", 1, "b b b b", "C", 1, "c", "D", 1, "d d"), 4, 0);
        iguais(List.of(1, 3, 4, 2), r.fatias().stream().map(Resultado.Fatia::tarefa).toList(), "menor primeiro");
    }

    static void testaRoundRobinRespeitaOQuantum() throws Exception {
        Resultado r = rodar("rr", Cenarios.spammer().mensagens(), 3, 1);
        confirmar(r.fatias().stream().allMatch(f -> f.fim() - f.inicio() <= 3), "nenhuma fatia passa do quantum");
        // Bruno é interrompido em t=3; quem chegou durante a fatia entra na fila antes dele voltar.
        iguais(List.of(1, 2, 3, 4, 1, 5),
                r.fatias().subList(0, 6).stream().map(Resultado.Fatia::tarefa).toList(), "rodízio");
    }

    static void testaRoundRobinComQuantumEnormeViraFcfs() throws Exception {
        for (Cenarios.Cenario cenario : Cenarios.todos()) {
            Resultado rr = rodar("rr", cenario.mensagens(), 50, 1);
            Resultado fcfs = rodar("fcfs", cenario.mensagens(), 50, 1);
            iguais(fcfs.resumo(), rr.resumo(), "RR com quantum enorme = FCFS em " + cenario.id());
        }
    }

    static void testaCadaPalavraEhProcessadaUmaVezENaOrdem() throws Exception {
        for (String algoritmo : Servidor.ALGORITMOS) {
            for (Cenarios.Cenario cenario : Cenarios.todos()) {
                Resultado r = rodar(algoritmo, cenario.mensagens(), 3, 1);
                for (Mensagem mensagem : cenario.mensagens()) {
                    List<String> processadas = r.fatias().stream()
                            .filter(f -> f.tarefa() == mensagem.id())
                            .flatMap(f -> f.palavras().stream())
                            .toList();
                    iguais(mensagem.palavras(), processadas, algoritmo + "/" + cenario.id() + " mensagem " + mensagem.id());
                }
            }
        }
    }

    static void testaCadaFatiaRodaNaThreadDaPropriaMensagem() throws Exception {
        Resultado r = rodar("rr", Cenarios.insistente().mensagens(), 2, 0);
        confirmar(r.fatias().stream().allMatch(f -> f.thread().equals("msg-" + f.tarefa() + "-" + f.usuario())),
                "a palavra foi processada pela thread da mensagem");
    }

    static void testaCpuNuncaRodaDuasTarefasAoMesmoTempo() throws Exception {
        for (String algoritmo : Servidor.ALGORITMOS) {
            Resultado r = rodar(algoritmo, Cenarios.filaQueNaoPara().mensagens(), 2, 1);
            for (int i = 1; i < r.fatias().size(); i++) {
                confirmar(r.fatias().get(i).inicio() >= r.fatias().get(i - 1).fim(), algoritmo + ": fatias sobrepostas");
            }
        }
    }

    static void testaCustoDeTrocaEntraNoTempoTotal() throws Exception {
        List<Mensagem> canal = Cenarios.todosIguais().mensagens();
        Resultado semCusto = rodar("rr", canal, 2, 0);
        Resultado comCusto = rodar("rr", canal, 2, 2);
        iguais(32, semCusto.resumo().tempoTotal(), "4 mensagens × 8 palavras");
        iguais(32 + 2 * comCusto.resumo().trocas(), comCusto.resumo().tempoTotal(), "cada troca custa 2 ticks");
    }

    static void testaCpuOciosaEsperaAProximaChegada() throws Exception {
        Resultado r = rodar("rr", mensagens("A", 0, "a b", "B", 10, "c"), 4, 1);
        iguais(10, tarefa(r, 2).inicio(), "B começa quando chega");
        iguais(0, r.resumo().trocas(), "CPU ociosa não conta como troca");
    }

    static void testaRrPorUsuarioDivideAVezEntrePessoas() throws Exception {
        List<Mensagem> canal = Cenarios.insistente().mensagens();
        Resultado porMensagem = rodar("rr", canal, 4, 1);
        Resultado porUsuario = rodar("rr-usuario", canal, 4, 1);
        confirmar(tarefa(porUsuario, 6).resposta() < tarefa(porMensagem, 6).resposta(), "Ana responde antes");
        confirmar(tarefa(porUsuario, 7).termino() < tarefa(porMensagem, 7).termino(), "Carla termina antes");
        confirmar(porUsuario.resumo().respostaPorPessoa() < porMensagem.resumo().respostaPorPessoa(),
                "por pessoa, o RR por usuário responde melhor");
        // A cada rodada, no máximo uma mensagem do Bruno roda entre duas vezes de outra pessoa.
        String ordem = porUsuario.fatias().stream().map(Resultado.Fatia::usuario).collect(Collectors.joining(","));
        confirmar(ordem.startsWith("Bruno,Ana,Carla,Bruno,Ana,Carla"), "rodízio por pessoa: " + ordem);
    }

    static void testaCenariosMostramOQuePrometem() throws Exception {
        Resultado fcfs = rodar("fcfs", Cenarios.spammer().mensagens(), 4, 1);
        Resultado rr = rodar("rr", Cenarios.spammer().mensagens(), 4, 1);
        confirmar(rr.resumo().respostaMedia() < fcfs.resumo().respostaMedia() / 2, "textão: comboio no FCFS");

        List<Mensagem> fila = Cenarios.filaQueNaoPara().mensagens();
        confirmar(tarefa(rodar("sjf", fila, 4, 1), 2).resposta() > 5 * tarefa(rodar("rr", fila, 4, 1), 2).resposta(),
                "fila: Bruno fica sem começar no SJF");

        List<Mensagem> iguais = Cenarios.todosIguais().mensagens();
        confirmar(rodar("rr", iguais, 4, 1).resumo().retornoMedio() > rodar("fcfs", iguais, 4, 1).resumo().retornoMedio(),
                "iguais: o RR perde no retorno médio");
        confirmar(iguais.stream().allMatch(m -> m.burst() == 8), "todas com 8 palavras");
    }

    static void testaServidorValidaEntrada() throws Exception {
        for (Object invalido : List.of(Map.of(), Map.of("mensagens", List.of()),
                Map.of("mensagens", List.of(Map.of("usuario", "A", "texto", "oi")), "quantum", 0.0),
                Map.of("mensagens", List.of(Map.of("usuario", "A", "texto", "oi")), "algoritmos", List.of("lifo")))) {
            try {
                Servidor.escalonar(invalido);
                throw new AssertionError("deveria rejeitar " + invalido);
            } catch (IllegalArgumentException esperado) {
                // ok
            }
        }
        Map<String, Object> resposta = Servidor.escalonar(Json.ler(
                "{\"mensagens\":[{\"usuario\":\"Ana\",\"chegada\":0,\"texto\":\"oi gente\"}],\"quantum\":2}"));
        iguais(4, ((List<?>) resposta.get("resultados")).size(), "todos os algoritmos por padrão");
    }

    static void testaJsonIdaEVolta() {
        Object lido = Json.ler("{\"a\":[1,2.5,\"x\\\"y\\u00e9\"],\"b\":true,\"c\":null}");
        iguais("{\"a\":[1,2.5,\"x\\\"yé\"],\"b\":true,\"c\":null}", Json.escrever(lido), "ida e volta");
        iguais("\"\\u003cscript\\u003e\"", Json.escrever("<script>"), "escapa < e >");
    }
}
