package escalonador;

import java.util.Arrays;
import java.util.List;

/**
 * Uma mensagem enviada ao canal: é a "tarefa" que precisa de CPU.
 *
 * Cada palavra custa 1 tick de CPU, então o burst da mensagem é o número de
 * palavras. A chegada é o tick em que a mensagem entra no servidor.
 */
public record Mensagem(int id, String usuario, String texto, int chegada) {

    public List<String> palavras() {
        String limpo = texto.trim();
        return limpo.isEmpty() ? List.of() : Arrays.asList(limpo.split("\\s+"));
    }

    public int burst() {
        return palavras().size();
    }
}
