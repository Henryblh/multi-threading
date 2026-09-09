"""Mini projeto de terminal: palavras em ordem, chegadas imprevisíveis.

Uso:
    python threads_palavras.py
    python threads_palavras.py "uma frase para testar"
    python threads_palavras.py --perguntar
"""

from __future__ import annotations

import sys

from threads_core import Configuracao, TEXTO_EXEMPLO, executar


NUM_THREADS = 4


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "--perguntar":
        texto = input("Digite uma frase grande: ").strip() or TEXTO_EXEMPLO
    elif len(sys.argv) > 1:
        texto = " ".join(sys.argv[1:])
    else:
        texto = TEXTO_EXEMPLO

    palavras = texto.split()
    eventos = []
    resultado = executar(
        Configuracao(texto, NUM_THREADS, 5, 120),
        ao_evento=eventos.append,
    )

    print(f"Texto com {len(palavras)} palavras, entregue EM ORDEM para {NUM_THREADS} threads:")
    for thread_id, bloco in enumerate(resultado["blocks"]):
        if bloco:
            print(f"  T{thread_id} -> palavras {bloco[0] + 1}..{bloco[-1] + 1}")
        else:
            print(f"  T{thread_id} -> (nada)")
    print("\\n--- as threads começaram juntas ---\\n")
    for evento in eventos:
        print(
            f"[T{evento.thread_id}] devolvi a palavra "
            f"#{evento.indice_original + 1:>3}: {evento.palavra}"
        )

    print("\\n--- todas terminaram ---\\n")
    print(f"Tempo total: {resultado['duration_ms'] / 1000:.2f}s\\n")
    print("FRASE ORIGINAL (a que a gente entregou, em ordem):")
    print("  " + texto + "\\n")
    print("FRASE FINAL (na ordem em que as threads devolveram as palavras):")
    print("  " + resultado["final_text"] + "\\n")
    print("O lock protegeu a lista de saída; ele não escolhe a ordem de chegada.")


if __name__ == "__main__":
    main()
