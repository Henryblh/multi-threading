"""Versão de terminal com timeline e métrica de desordem.

Uso:
    python threads_visual.py [quantidade]
    python threads_visual.py --comparar
"""

from __future__ import annotations

import sys

from threads_core import TEXTO_EXEMPLO, desordem_kendall, executar, Configuracao


def barra(fracao: float, largura: int = 44) -> str:
    cheio = round(fracao * largura)
    return "#" * cheio + "." * (largura - cheio)


def visual_uma_rodada(num_threads: int) -> None:
    palavras = TEXTO_EXEMPLO.split()
    eventos_recebidos = []

    resultado = executar(
        Configuracao(TEXTO_EXEMPLO, num_threads, 3, 50),
        ao_evento=eventos_recebidos.append,
    )
    blocos = resultado["blocks"]
    total = len(palavras)

    print(f"\\nTEXTO: {total} palavras   |   THREADS: {num_threads}")
    for thread_id, bloco in enumerate(blocos):
        if bloco:
            print(
                f"  T{thread_id:<2} recebeu, em ordem, as palavras "
                f"{bloco[0] + 1}..{bloco[-1] + 1}  ({len(bloco)})"
            )
        else:
            print(f"  T{thread_id:<2} recebeu (nada)")

    print("\\nQUEM FALOU EM CADA PASSO  (esquerda -> direita = tempo):")
    faixas = {tid: [" "] * total for tid in range(num_threads)}
    for evento in eventos_recebidos:
        faixas[evento.thread_id][evento.sequencia] = "#"
    for thread_id in range(num_threads):
        print(f"  T{thread_id:<2} |{''.join(faixas[thread_id])}|")

    ordem = resultado["order"]
    print("\\nDE ONDE VEIO CADA PALAVRA DA FRASE FINAL:")
    numeros = [f"{indice + 1:>3}" for indice in ordem]
    for inicio in range(0, len(numeros), 20):
        print("  " + " ".join(numeros[inicio : inicio + 20]))

    kendall = resultado["kendall"]
    print(f"\\n  Pares fora de ordem : {resultado['inversions']} de {resultado['total_pairs']}")
    print(f"  DESORDEM (Kendall)  : {kendall * 100:5.1f}%   [{barra(kendall)}]")
    print("\\nFRASE ORIGINAL:")
    print("  " + TEXTO_EXEMPLO)
    print("FRASE FINAL:")
    print("  " + resultado["final_text"])


def comparar() -> None:
    contagens = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 50]
    tentativas = 8
    print(f"\\nDESORDEM MÉDIA por número de threads ({tentativas} rodadas)")
    print(f"  {'threads':>7} | {'desordem':>8} | gráfico (0% ....... 100%)")
    print("  " + "-" * 66)
    for quantidade in contagens:
        valores = [
            executar(Configuracao(TEXTO_EXEMPLO, quantidade, 2, 20))["kendall"]
            for _ in range(tentativas)
        ]
        media = sum(valores) / len(valores)
        print(f"  {quantidade:>7} | {media * 100:>7.1f}% | {barra(media)}")

    print(
        "\\nCom uma thread, a sequência é preservada. Com mais threads, "
        "os blocos continuam ordenados internamente, mas disputam o instante "
        "em que entram na saída global."
    )


def main() -> None:
    argumento = sys.argv[1] if len(sys.argv) > 1 else ""
    if argumento in ("--comparar", "--compare", "-c"):
        comparar()
    elif argumento.isdigit() and int(argumento) >= 1:
        visual_uma_rodada(int(argumento))
    else:
        visual_uma_rodada(4)


if __name__ == "__main__":
    main()
