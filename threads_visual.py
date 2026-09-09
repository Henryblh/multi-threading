"""
threads_visual.py -- da pra VER a desordem que as threads criam.

So biblioteca padrao (nada de instalar). Tudo em ASCII pra dar pra
tirar print e colocar na apresentacao.

Modos:
    python threads_visual.py            # 4 threads: timeline + metricas
    python threads_visual.py 8          # escolhe quantas threads
    python threads_visual.py --comparar # roda 1,2,3,4,6,8,12,16,24,32,50
                                        # threads e compara a desordem media

O que cada visual mostra:
  1. "QUEM FALOU EM CADA PASSO": uma faixa por thread. O '#' marca o
     instante (passo global) em que aquela thread devolveu uma palavra.
     Da pra ver a vez pulando de uma thread pra outra, sem padrao.
  2. "DE ONDE VEIO CADA PALAVRA": a frase final vira uma sequencia de
     numeros = a posicao ORIGINAL de cada palavra. Se estivesse em ordem
     seria 1 2 3 4 ... Na pratica vem embaralhado.
  3. DESORDEM (Kendall): % de pares de palavras que sairam fora de ordem.
        0%  = saiu exatamente na ordem pedida
       ~50% = praticamente uma permutacao aleatoria
       100% = ordem invertida
"""

import sys
import time
import random
import threading

TEXTO = (
    "According to all known laws of aviation, there is no way a bee should be "
    "able to fly. Its wings are too small to get its fat little body off the "
    "ground. The bee, of course, flies anyway because bees don't care what "
    "humans think is impossible. Yellow, black. Yellow,"
)

trava = threading.Lock()


def rodar(num_threads, palavras, atraso=(0.003, 0.05)):
    """Divide as palavras em num_threads blocos CONTIGUOS (em ordem) e roda tudo junto.

    Devolve (eventos, blocos), onde cada evento e:
        (ordem_global, id_thread, indice_original, palavra)
    """
    total = len(palavras)
    passo = total / num_threads
    blocos = []
    for t in range(num_threads):
        ini, fim = round(t * passo), round((t + 1) * passo)
        blocos.append(list(range(ini, fim)))

    eventos = []

    def trabalhador(tid, indices):
        for i in indices:
            time.sleep(random.uniform(*atraso))   # "trabalho" de duracao imprevisivel
            with trava:
                eventos.append((len(eventos), tid, i, palavras[i]))

    threads = [
        threading.Thread(target=trabalhador, args=(t, blocos[t]))
        for t in range(num_threads)
    ]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    return eventos, blocos


def pares_fora_de_ordem(ordem):
    """Conta pares (a antes de b) com valor original de a > b. O(n^2), ok pra n pequeno."""
    n = len(ordem)
    return sum(1 for a in range(n) for b in range(a + 1, n) if ordem[a] > ordem[b])


def desordem_kendall(ordem):
    """pares_fora_de_ordem normalizado: 0.0 ordenado ... ~0.5 aleatorio ... 1.0 invertido."""
    n = len(ordem)
    if n < 2:
        return 0.0
    return pares_fora_de_ordem(ordem) / (n * (n - 1) / 2)


def barra(frac, largura=44):
    cheio = round(frac * largura)
    return "#" * cheio + "." * (largura - cheio)


def visual_uma_rodada(num_threads):
    palavras = TEXTO.split()
    total = len(palavras)
    eventos, blocos = rodar(num_threads, palavras)
    ordem_final = [i for _, _, i, _ in eventos]   # posicoes originais, na ordem de saida

    print(f"\nTEXTO: {total} palavras   |   THREADS: {num_threads}")
    for t, bl in enumerate(blocos):
        if bl:
            print(f"  T{t:<2} recebeu, em ordem, as palavras {bl[0] + 1}..{bl[-1] + 1}  ({len(bl)})")
        else:
            print(f"  T{t:<2} recebeu (nada)")

    print("\nQUEM FALOU EM CADA PASSO  (esquerda -> direita = tempo):")
    faixa = {t: [" "] * total for t in range(num_threads)}
    for ordem_global, tid, _, _ in eventos:
        faixa[tid][ordem_global] = "#"
    for t in range(num_threads):
        print(f"  T{t:<2} |{''.join(faixa[t])}|")

    print("\nDE ONDE VEIO CADA PALAVRA DA FRASE FINAL  (numero = posicao original):")
    nums = [f"{i + 1:>3}" for i in ordem_final]
    for k in range(0, len(nums), 20):
        print("  " + " ".join(nums[k:k + 20]))

    kt = desordem_kendall(ordem_final)
    print(f"\n  Pares fora de ordem : {pares_fora_de_ordem(ordem_final)} de {total * (total - 1) // 2}")
    print(f"  DESORDEM (Kendall)  : {kt * 100:5.1f}%   [{barra(kt)}]")
    print(f"                        0% = na ordem   ~50% = aleatorio   100% = invertido")

    print("\nFRASE ORIGINAL:")
    print("  " + TEXTO)
    print("FRASE FINAL (ordem em que as threads devolveram as palavras):")
    print("  " + " ".join(w for _, _, _, w in eventos))


def comparar():
    palavras = TEXTO.split()
    total = len(palavras)
    contagens = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 50]
    tentativas = 8

    print(f"\nDESORDEM MEDIA por numero de threads")
    print(f"texto de {total} palavras, {tentativas} rodadas por configuracao\n")
    print(f"  {'threads':>7} | {'desordem':>8} | grafico (0% ....... 100%)")
    print("  " + "-" * 66)
    for n in contagens:
        if n == 1:
            media = 0.0   # 1 thread = 1 laco sequencial, sem sorteio: sempre 0
        else:
            vals = []
            for _ in range(tentativas):
                # atraso >> custo de criar a thread, senao as primeiras threads
                # terminam antes das ultimas nascerem e a coisa RE-serializa
                eventos, _ = rodar(n, palavras, atraso=(0.002, 0.02))
                vals.append(desordem_kendall([i for _, _, i, _ in eventos]))
            media = sum(vals) / len(vals)
        print(f"  {n:>7} | {media * 100:>7.1f}% | {barra(media)}")

    print("""
O QUE ISSO MOSTRA:
  - COM MENOS threads:
      1 thread  -> 0%. Sem concorrencia, sai exatamente na ordem pedida.
      2 threads -> desordem baixa: e so um "baralhar" de 2 metades ja ordenadas.
  - COM MAIS threads:
      a desordem SOBE conforme mais threads disputam a CPU ao mesmo tempo...
      ...e SATURA perto de ~50% (permutacao quase aleatoria). Passar de
      ~1 palavra por thread nao embaralha mais - so custa mais troca de
      contexto (overhead) e memoria.

  CUIDADO (efeito de borda): se a tarefa de cada thread fica MENOR que o
  custo de criar/agendar a thread, as primeiras terminam antes das ultimas
  nascerem e a saida VOLTA a ficar mais ordenada. Ou seja: nem sempre "mais
  thread" = "mais bagunca"; depende do tamanho do trabalho de cada uma.
""")


def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else ""
    if arg in ("--comparar", "--compare", "-c"):
        comparar()
    elif arg.isdigit() and int(arg) >= 1:
        visual_uma_rodada(int(arg))
    else:
        visual_uma_rodada(4)


if __name__ == "__main__":
    main()
