"""
Mini projeto: threads rodando em PARALELO, de forma meio ALEATORIA / ASSINCRONA.

A ideia:
  1. Pega uma string grande (a de exemplo, um argumento de linha de comando,
     ou algo digitado na hora).
  2. Divide as palavras em 4 blocos, em ORDEM:
        T0 -> palavras  1..N
        T1 -> palavras  N+1..
        T2 -> ...
        T3 -> ...
     Ou seja: a gente ENTREGA tudo certinho, na sequencia.
  3. Dispara as 4 threads AO MESMO TEMPO. Cada thread percorre o seu bloco
     em ordem e vai imprimindo / guardando cada palavra, com uma pausa
     aleatoria minuscula pra simular trabalho assincrono.
  4. Na teoria, se rodasse em sequencia (T0 inteira, depois T1...), a frase
     final sairia IDENTICA a original. Mas como as 4 rodam em paralelo e o
     sistema operacional decide quem executa a cada instante, a frase final
     sai EMBARALHADA -- e diferente a cada execucao.

Rodar:
    python threads_palavras.py
    python threads_palavras.py "qualquer frase que voce quiser testar aqui"
    python threads_palavras.py --perguntar
"""

import sys
import time
import random
import threading

NUM_THREADS = 4

# Primeiras 50 palavras do monologo de abertura do filme Bee Movie.
TEXTO_EXEMPLO = (
    "According to all known laws of aviation, there is no way a bee should be "
    "able to fly. Its wings are too small to get its fat little body off the "
    "ground. The bee, of course, flies anyway because bees don't care what "
    "humans think is impossible. Yellow, black. Yellow,"
)

# A frase final vai sendo montada aqui, na ORDEM EM QUE AS THREADS TERMINAM
# cada palavra (nao na ordem original). O lock so evita duas threads
# mexendo na lista no mesmo instante.
saida = []
trava = threading.Lock()


def trabalhador(id_thread, bloco):
    """Cada thread recebe uma lista de (indice_original, palavra) em ordem."""
    for indice, palavra in bloco:
        # pausa curta e aleatoria = trabalho assincrono, ritmo imprevisivel
        time.sleep(random.uniform(0.005, 0.12))

        print(f"[T{id_thread}] devolvi a palavra #{indice + 1:>3}: {palavra}")

        with trava:
            saida.append(palavra)


def dividir_em_blocos(palavras, n):
    """Divide a lista em n blocos CONTIGUOS, mantendo a ordem original."""
    tamanho = len(palavras) / n
    blocos = []
    for t in range(n):
        ini = round(t * tamanho)
        fim = round((t + 1) * tamanho)
        blocos.append([(i, palavras[i]) for i in range(ini, fim)])
    return blocos


def main():
    # --- 1. De onde vem o texto ------------------------------------------
    if len(sys.argv) > 1 and sys.argv[1] == "--perguntar":
        texto = input("Digite uma frase grande: ").strip() or TEXTO_EXEMPLO
    elif len(sys.argv) > 1:
        texto = " ".join(sys.argv[1:])
    else:
        texto = TEXTO_EXEMPLO

    palavras = texto.split()
    total = len(palavras)

    # --- 2. Divide em 4 blocos, em ordem -------------------------------
    blocos = dividir_em_blocos(palavras, NUM_THREADS)

    threads = []
    for t in range(NUM_THREADS):
        th = threading.Thread(target=trabalhador, args=(t, blocos[t]), name=f"T{t}")
        threads.append(th)

    print(f"Texto com {total} palavras, entregue EM ORDEM para {NUM_THREADS} threads:")
    for t in range(NUM_THREADS):
        nums = [i + 1 for i, _ in blocos[t]]
        print(f"  T{t} -> palavras {nums[0]}..{nums[-1]}")
    print("\n--- as 4 threads comecam juntas ---\n")

    inicio = time.perf_counter()

    for th in threads:      # start() = "va rodar em paralelo"
        th.start()

    for th in threads:      # join() = "espera todas terminarem"
        th.join()

    duracao = time.perf_counter() - inicio

    # --- 3. Resultado -------------------------------------------------
    print("\n--- todas terminaram ---\n")
    print(f"Tempo total: {duracao:.2f}s\n")
    print("FRASE ORIGINAL (a que a gente entregou, em ordem):")
    print("  " + texto + "\n")
    print("FRASE FINAL   (na ordem em que as threads devolveram as palavras):")
    print("  " + " ".join(saida) + "\n")
    print("Pedimos tudo em ordem... e mesmo assim saiu embaralhado, porque as")
    print("threads rodaram em paralelo e de forma assincrona. Rode de novo: muda.")


if __name__ == "__main__":
    main()
