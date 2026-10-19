package escalonador;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Cenários prontos do canal. Cada um foi pensado para expor o ponto forte ou o
 * ponto fraco de um algoritmo — inclusive o caso em que o Round Robin perde.
 */
public final class Cenarios {

    public record Cenario(String id, String nome, String descricao, String destaque, List<Mensagem> mensagens) {
        public Map<String, Object> comoMapa() {
            Map<String, Object> mapa = new LinkedHashMap<>();
            mapa.put("id", id);
            mapa.put("nome", nome);
            mapa.put("descricao", descricao);
            mapa.put("destaque", destaque);
            mapa.put("mensagens", mensagens.stream().map(m -> Map.of(
                    "usuario", m.usuario(), "chegada", m.chegada(), "texto", m.texto())).toList());
            return mapa;
        }
    }

    private Cenarios() {}

    public static List<Cenario> todos() {
        return List.of(spammer(), filaQueNaoPara(), insistente(), todosIguais());
    }

    public static Cenario porId(String id) {
        return todos().stream()
                .filter(cenario -> cenario.id().equals(id))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Cenário desconhecido: " + id));
    }

    /** Efeito comboio: no FCFS, uma mensagem gigante trava todas as curtas que chegam atrás dela. */
    static Cenario spammer() {
        return new Cenario("spammer", "O textão",
                "Bruno cola um texto enorme no canal e logo depois chegam mensagens curtas.",
                "Efeito comboio no FCFS: todo mundo espera o textão acabar.",
                construir(
                        "Bruno", 0, "Pessoal segue o regulamento completo do campeonato que eu copiei do site "
                                + "oficial para ninguem dizer que nao sabia das regras de inscricao horario das "
                                + "partidas pontuacao criterios de desempate e punicoes para quem faltar sem avisar",
                        "Ana", 1, "oi gente",
                        "Carla", 2, "alguem viu o jogo ontem?",
                        "Pingu", 3, "noot noot",
                        "Ana", 5, "kkkkkk"));
    }

    /** Starvation: no SJF, a mensagem longa nunca é a menor da fila enquanto chegam curtas. */
    static Cenario filaQueNaoPara() {
        return new Cenario("fila", "A fila que não para",
                "Uma mensagem média chega cedo, mas o canal não para de receber mensagens curtas.",
                "Starvation no SJF: a mensagem do Bruno sempre perde para uma mais curta.",
                construir(
                        "Ana", 0, "opa tudo certo",
                        "Bruno", 1, "alguem consegue me ajudar com a configuracao do servidor que caiu de novo hoje cedo",
                        "Carla", 2, "bora jogar",
                        "Pingu", 4, "noot noot",
                        "Eva", 6, "eu tambem",
                        "Ana", 8, "que horas?",
                        "Carla", 10, "agora mesmo",
                        "Pingu", 12, "noot noot",
                        "Eva", 14, "criando sala",
                        "Ana", 16, "link aqui",
                        "Carla", 18, "entrei ja",
                        "Pingu", 20, "noot noot"));
    }

    /** Justiça entre pessoas: no RR comum, quem manda várias mensagens ganha várias vezes. */
    static Cenario insistente() {
        return new Cenario("insistente", "O usuário insistente",
                "Bruno dispara cinco mensagens de uma vez; Ana e Carla mandam uma cada.",
                "RR por mensagem dá 5× mais CPU ao Bruno; RR por usuário divide por pessoa.",
                construir(
                        "Bruno", 0, "alguem ai pode me responder",
                        "Bruno", 0, "to precisando de ajuda urgente",
                        "Bruno", 0, "e serio o servidor caiu",
                        "Bruno", 0, "ninguem vai responder nao",
                        "Bruno", 0, "vou mandar de novo entao",
                        "Ana", 1, "calma bruno ja estou vendo",
                        "Carla", 2, "reiniciei o servidor agora pouco"));
    }

    /** O caso honesto: com tarefas iguais chegando juntas, o FCFS termina cada uma mais cedo. */
    static Cenario todosIguais() {
        return new Cenario("iguais", "Todos iguais",
                "Quatro mensagens do mesmo tamanho chegam no mesmo instante.",
                "Onde o Round Robin perde: alterna sem necessidade e todos terminam no fim.",
                construir(
                        "Ana", 0, "esta e uma mensagem com exatamente oito palavras",
                        "Bruno", 0, "esta outra mensagem tem exatamente oito palavras tambem",
                        "Carla", 0, "e mais uma mensagem com exatamente oito palavras",
                        "Pingu", 0, "noot noot noot noot noot noot noot noot"));
    }

    /** Recebe triplas (usuário, chegada, texto) e numera as mensagens na ordem dada. */
    private static List<Mensagem> construir(Object... dados) {
        List<Mensagem> mensagens = new ArrayList<>();
        for (int i = 0; i < dados.length; i += 3) {
            mensagens.add(new Mensagem(mensagens.size() + 1, (String) dados[i], (String) dados[i + 2],
                    (Integer) dados[i + 1]));
        }
        return mensagens;
    }
}
