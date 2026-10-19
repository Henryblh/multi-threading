package escalonador;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.List;
import java.util.Map;

/**
 * Testes do rascunho do TP3 (seção crítica), no mesmo formato de TesteEscalonador.
 *
 *   java -cp escalonamento/out escalonador.TesteSecaoCritica
 */
public final class TesteSecaoCritica {

    public static void main(String[] argumentos) throws Exception {
        int falhas = 0;
        int total = 0;
        for (Method metodo : TesteSecaoCritica.class.getDeclaredMethods()) {
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

    @SuppressWarnings("unchecked")
    private static Map<String, Object> verificacao(String algoritmo, int quantum, boolean controle) throws Exception {
        return (Map<String, Object>) SecaoCritica.executar(SecaoCritica.cenarioPadrao(), algoritmo, quantum, controle, 7)
                .get("verificacao");
    }

    private static void confirmar(boolean condicao, String mensagem) {
        if (!condicao) throw new AssertionError(mensagem);
    }

    static void testaRoundRobinSemSemaforoCorrompe() throws Exception {
        Map<String, Object> v = verificacao("rr", 2, false);
        confirmar(Boolean.FALSE.equals(v.get("ok")), "deveria corromper");
        confirmar(v.get("proximo_id_obtido").equals(8), "as três leram 7 e gravaram 8: " + v.get("proximo_id_obtido"));
        confirmar(!((List<?>) v.get("duplicados")).isEmpty(), "ids duplicados");
    }

    static void testaFcfsSemSemaforoPassaPorSorte() throws Exception {
        confirmar(Boolean.TRUE.equals(verificacao("fcfs", 2, false).get("ok")), "FCFS nunca interrompe a seção crítica");
    }

    static void testaComSemaforoSempreIntegro() throws Exception {
        for (String algoritmo : List.of("fcfs", "rr")) {
            for (int quantum = 1; quantum <= 8; quantum++) {
                Map<String, Object> v = verificacao(algoritmo, quantum, true);
                confirmar(Boolean.TRUE.equals(v.get("ok")), algoritmo + " q=" + quantum + " com semáforo");
                confirmar(v.get("proximo_id_obtido").equals(10), "contador fecha em 10");
            }
        }
    }

    static void testaQuantumQueCobreAThreadInteiraNaoCorrompe() throws Exception {
        // A maior thread tem 4 (digitar) + 1 (ler) + 4 (escrever) + 1 (gravar) = 10 passos.
        confirmar(Boolean.TRUE.equals(verificacao("rr", 10, false).get("ok")), "quantum cobre a thread inteira");
    }

    @SuppressWarnings("unchecked")
    static void testaRoundRobinComSemaforoContinuaSendoRoundRobin() throws Exception {
        // O semáforo só protege a publicação; a digitação continua alternando entre as threads.
        Map<String, Object> rr = SecaoCritica.executar(SecaoCritica.cenarioPadrao(), "rr", 2, true, 7);
        Map<String, Object> fcfs = SecaoCritica.executar(SecaoCritica.cenarioPadrao(), "fcfs", 2, true, 7);
        double respostaRr = (double) ((Map<String, Object>) rr.get("resumo")).get("resposta_media");
        double respostaFcfs = (double) ((Map<String, Object>) fcfs.get("resumo")).get("resposta_media");
        confirmar(respostaRr < respostaFcfs, "RR responde antes: " + respostaRr + " vs " + respostaFcfs);
        List<String> ordemRr = ((List<Map<String, Object>>) ((Map<String, Object>) rr.get("verificacao")).get("slots"))
                .stream().map(slot -> String.valueOf(slot.get("autores"))).toList();
        confirmar(!ordemRr.get(0).equals("[Bruno]"), "no RR a menor mensagem publica primeiro: " + ordemRr);
    }

    @SuppressWarnings("unchecked")
    static void testaRoundRobinComSemaforoBloqueiaEAcorda() throws Exception {
        Map<String, Object> r = SecaoCritica.executar(SecaoCritica.cenarioPadrao(), "rr", 2, true, 7);
        confirmar(((Map<String, Object>) r.get("resumo")).get("bloqueios").equals(2), "Ana e Carla bloqueiam");
        List<Map<String, Object>> instantes = (List<Map<String, Object>>) r.get("instantes");
        boolean viuBloqueada = instantes.stream().anyMatch(i ->
                ((Map<String, Map<String, Object>>) i.get("estados")).values().stream()
                        .anyMatch(e -> e.get("estado").equals("bloqueada")));
        confirmar(viuBloqueada, "aparece o estado bloqueada");
        String eventos = instantes.stream().flatMap(i -> ((List<String>) i.get("eventos")).stream()).toList().toString();
        confirmar(eventos.contains("acorda"), "o V() acorda alguém: " + eventos);
    }

    static void testaServidorValidaEntrada() throws Exception {
        try {
            Servidor.secaoCritica(Map.of("mensagens", List.of(Map.of("usuario", "A", "texto", "oi")), "algoritmo", "sjf",
                    "controle", true));
            throw new AssertionError("deveria rejeitar sjf");
        } catch (IllegalArgumentException esperado) {
            // ok
        }
    }
}
