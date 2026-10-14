package escalonador;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * JSON mínimo para o servidor, sem dependências externas.
 *
 * Lê objetos como {@code Map<String, Object>}, listas como {@code List<Object>},
 * números como {@code Double}, além de String, Boolean e null.
 */
public final class Json {

    private final String texto;
    private int posicao;

    private Json(String texto) {
        this.texto = texto;
    }

    public static Object ler(String texto) {
        Json leitor = new Json(texto);
        leitor.pularEspacos();
        Object valor = leitor.valor();
        leitor.pularEspacos();
        if (leitor.posicao != texto.length()) {
            throw leitor.erro("conteúdo depois do fim do JSON");
        }
        return valor;
    }

    public static String escrever(Object valor) {
        StringBuilder saida = new StringBuilder();
        escrever(valor, saida);
        return saida.toString();
    }

    private static void escrever(Object valor, StringBuilder saida) {
        if (valor == null) {
            saida.append("null");
        } else if (valor instanceof String texto) {
            escreverTexto(texto, saida);
        } else if (valor instanceof Double || valor instanceof Float) {
            double numero = ((Number) valor).doubleValue();
            if (Double.isNaN(numero) || Double.isInfinite(numero)) {
                saida.append("null");
            } else if (numero == Math.rint(numero) && Math.abs(numero) < 1e15) {
                saida.append((long) numero);
            } else {
                saida.append(numero);
            }
        } else if (valor instanceof Number || valor instanceof Boolean) {
            saida.append(valor);
        } else if (valor instanceof Map<?, ?> mapa) {
            saida.append('{');
            boolean primeiro = true;
            for (Map.Entry<?, ?> item : mapa.entrySet()) {
                if (!primeiro) saida.append(',');
                primeiro = false;
                escreverTexto(String.valueOf(item.getKey()), saida);
                saida.append(':');
                escrever(item.getValue(), saida);
            }
            saida.append('}');
        } else if (valor instanceof Iterable<?> lista) {
            saida.append('[');
            boolean primeiro = true;
            for (Object item : lista) {
                if (!primeiro) saida.append(',');
                primeiro = false;
                escrever(item, saida);
            }
            saida.append(']');
        } else {
            escreverTexto(valor.toString(), saida);
        }
    }

    private static void escreverTexto(String texto, StringBuilder saida) {
        saida.append('"');
        for (int i = 0; i < texto.length(); i++) {
            char c = texto.charAt(i);
            switch (c) {
                case '"' -> saida.append("\\\"");
                case '\\' -> saida.append("\\\\");
                case '\n' -> saida.append("\\n");
                case '\r' -> saida.append("\\r");
                case '\t' -> saida.append("\\t");
                default -> {
                    if (c < 0x20 || c == '<' || c == '>') {
                        saida.append(String.format("\\u%04x", (int) c));
                    } else {
                        saida.append(c);
                    }
                }
            }
        }
        saida.append('"');
    }

    private Object valor() {
        if (posicao >= texto.length()) throw erro("fim inesperado");
        char c = texto.charAt(posicao);
        return switch (c) {
            case '{' -> objeto();
            case '[' -> lista();
            case '"' -> texto();
            case 't' -> literal("true", Boolean.TRUE);
            case 'f' -> literal("false", Boolean.FALSE);
            case 'n' -> literal("null", null);
            default -> numero();
        };
    }

    private Map<String, Object> objeto() {
        Map<String, Object> mapa = new LinkedHashMap<>();
        posicao++;
        pularEspacos();
        if (consumir('}')) return mapa;
        do {
            pularEspacos();
            if (posicao >= texto.length() || texto.charAt(posicao) != '"') throw erro("chave esperada");
            String chave = texto();
            pularEspacos();
            if (!consumir(':')) throw erro("':' esperado");
            pularEspacos();
            mapa.put(chave, valor());
            pularEspacos();
        } while (consumir(','));
        if (!consumir('}')) throw erro("'}' esperado");
        return mapa;
    }

    private List<Object> lista() {
        List<Object> lista = new ArrayList<>();
        posicao++;
        pularEspacos();
        if (consumir(']')) return lista;
        do {
            pularEspacos();
            lista.add(valor());
            pularEspacos();
        } while (consumir(','));
        if (!consumir(']')) throw erro("']' esperado");
        return lista;
    }

    private String texto() {
        StringBuilder saida = new StringBuilder();
        posicao++;
        while (posicao < texto.length()) {
            char c = texto.charAt(posicao++);
            if (c == '"') return saida.toString();
            if (c != '\\') {
                saida.append(c);
                continue;
            }
            if (posicao >= texto.length()) break;
            char escape = texto.charAt(posicao++);
            switch (escape) {
                case '"', '\\', '/' -> saida.append(escape);
                case 'b' -> saida.append('\b');
                case 'f' -> saida.append('\f');
                case 'n' -> saida.append('\n');
                case 'r' -> saida.append('\r');
                case 't' -> saida.append('\t');
                case 'u' -> {
                    if (posicao + 4 > texto.length()) throw erro("escape \\u incompleto");
                    try {
                        saida.append((char) Integer.parseInt(texto.substring(posicao, posicao + 4), 16));
                    } catch (NumberFormatException erro) {
                        throw erro("escape \\u inválido");
                    }
                    posicao += 4;
                }
                default -> throw erro("escape inválido");
            }
        }
        throw erro("texto sem aspas de fechamento");
    }

    private Object literal(String palavra, Object valor) {
        if (!texto.startsWith(palavra, posicao)) throw erro("valor inválido");
        posicao += palavra.length();
        return valor;
    }

    private Double numero() {
        int inicio = posicao;
        while (posicao < texto.length() && "+-0123456789.eE".indexOf(texto.charAt(posicao)) >= 0) {
            posicao++;
        }
        try {
            return Double.parseDouble(texto.substring(inicio, posicao));
        } catch (NumberFormatException erro) {
            throw erro("número inválido");
        }
    }

    private boolean consumir(char esperado) {
        if (posicao < texto.length() && texto.charAt(posicao) == esperado) {
            posicao++;
            return true;
        }
        return false;
    }

    private void pularEspacos() {
        while (posicao < texto.length() && Character.isWhitespace(texto.charAt(posicao))) {
            posicao++;
        }
    }

    private IllegalArgumentException erro(String motivo) {
        return new IllegalArgumentException("JSON inválido na posição " + posicao + ": " + motivo);
    }
}
