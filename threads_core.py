"""Núcleo reutilizável para os experimentos de threads."""

from __future__ import annotations

from collections import deque
from dataclasses import asdict, dataclass
import random
import threading
import time
from typing import Callable


TEXTO_EXEMPLO = "Cada palavra vai para a proxima thread em rodizio e no fim o escalonador tenta remontar a frase na ordem certa."

# "livre" deixa o sistema operacional decidir (todas as threads trabalham ao
# mesmo tempo). "fcfs" e "rr" colocam um escalonador nosso na frente: só uma
# thread por vez recebe a CPU simulada, como em um processador de um núcleo.
ESCALONADORES = ("livre", "fcfs", "rr")
QUANTUM_MAXIMO = 20


class ConfiguracaoInvalida(ValueError):
    """Erro de entrada que pode ser mostrado pela API."""


@dataclass(frozen=True)
class Configuracao:
    texto: str
    threads: int
    atraso_min_ms: int = 25
    atraso_max_ms: int = 100
    escalonador: str = "livre"
    quantum: int = 1

    @property
    def palavras(self) -> list[str]:
        return self.texto.split()


@dataclass(frozen=True)
class Evento:
    sequencia: int
    thread_id: int
    indice_original: int
    palavra: str
    tempo_ms: float

    def como_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class Fatia:
    """Intervalo em que uma thread ficou com a CPU (uma barra do diagrama de Gantt)."""

    thread_id: int
    inicio_ms: float
    fim_ms: float
    palavras: int

    def como_dict(self) -> dict:
        return asdict(self)


def dividir_indices(total: int, quantidade_threads: int) -> list[list[int]]:
    """Distribui os índices em rodízio (round-robin) pelas threads.

    T0 fica com a 1ª palavra, T1 com a 2ª, ... e ao chegar na última thread
    volta para a T0. Com 3 threads a divisão das palavras fica 1-2-3-1-2-3...,
    de modo que, se cada thread respeitar o próprio ritmo, a frase tende a sair
    montada na ordem certa em vez de embaralhada. Blocos vazios continuam
    possíveis quando há mais threads do que palavras.
    """
    return [
        list(range(t, total, quantidade_threads))
        for t in range(quantidade_threads)
    ]


def pares_fora_de_ordem(ordem: list[int]) -> int:
    return sum(
        1
        for a in range(len(ordem))
        for b in range(a + 1, len(ordem))
        if ordem[a] > ordem[b]
    )


def desordem_kendall(ordem: list[int]) -> float:
    if len(ordem) < 2:
        return 0.0
    return pares_fora_de_ordem(ordem) / (len(ordem) * (len(ordem) - 1) / 2)


def reconstruir_marcadas(tokens: list[str]) -> dict[str, str]:
    """Remonta frases a partir de tokens no formato id{X}/palavra{N}/texto.

    A ordem de chegada não importa: cada token carrega o próprio endereço
    (qual frase e qual posição), então o receptor agrupa por id e ordena
    pela posição — exatamente o que o TCP faz com número de sequência.
    """
    grupos: dict[str, list[tuple[int, str]]] = {}
    for token in tokens:
        partes = token.split("/", 2)
        if len(partes) != 3:
            continue
        identificador, posicao, palavra = partes
        digitos = "".join(caractere for caractere in posicao if caractere.isdigit())
        grupos.setdefault(identificador, []).append((int(digitos or 0), palavra))
    return {
        identificador: " ".join(palavra for _, palavra in sorted(pares))
        for identificador, pares in sorted(grupos.items())
    }


def gerar_texto(quantidade_palavras: int, palavras_base: list[str] | None = None) -> str:
    """Gera um texto com o número de palavras pedido, repetindo o vocabulário base.

    Usado pela comparação em grade (threads x comprimento), onde precisamos de
    textos de tamanhos diferentes sem depender do que a pessoa digitou.
    """
    base = palavras_base or TEXTO_EXEMPLO.split()
    if quantidade_palavras <= 0:
        return ""
    repeticoes = quantidade_palavras // len(base) + 1
    return " ".join((base * repeticoes)[:quantidade_palavras])


def grade_de_dict(dados: dict) -> tuple[list[int], list[int], int]:
    """Valida a entrada do endpoint que cruza quantidade de threads e comprimento do texto."""
    if not isinstance(dados, dict):
        raise ConfiguracaoInvalida("O corpo precisa ser um objeto JSON.")

    def lista_inteiros(nome: str, minimo: int, maximo: int, limite_itens: int) -> list[int]:
        valores = dados.get(nome)
        if (
            not isinstance(valores, list)
            or not valores
            or len(valores) > limite_itens
            or any(
                isinstance(valor, bool) or not isinstance(valor, int) or not minimo <= valor <= maximo
                for valor in valores
            )
        ):
            raise ConfiguracaoInvalida(
                f"Escolha de 1 a {limite_itens} valores de {nome} entre {minimo} e {maximo}."
            )
        if len(set(valores)) != len(valores):
            raise ConfiguracaoInvalida(f"Os valores de {nome} devem ser únicos.")
        return sorted(valores)

    threads = lista_inteiros("threads", 1, 64, 12)
    comprimentos = lista_inteiros("lengths", 1, 2000, 12)

    repeticoes = dados.get("repetitions", 3)
    if isinstance(repeticoes, bool) or not isinstance(repeticoes, int) or not 1 <= repeticoes <= 10:
        raise ConfiguracaoInvalida("Escolha entre 1 e 10 repetições.")

    return threads, comprimentos, repeticoes


def configuracao_de_dict(dados: dict) -> Configuracao:
    """Converte e valida o formato de entrada aceito pelo servidor."""
    if not isinstance(dados, dict):
        raise ConfiguracaoInvalida("O corpo precisa ser um objeto JSON.")
    texto = dados.get("text", dados.get("texto", ""))
    if not isinstance(texto, str):
        raise ConfiguracaoInvalida("O texto precisa ser uma string.")
    if not 1 <= len(texto.split()) <= 500:
        raise ConfiguracaoInvalida("Use um texto entre 1 e 500 palavras.")

    def inteiro(nome: str, padrao: int) -> int:
        valor = dados.get(nome, padrao)
        if isinstance(valor, bool) or not isinstance(valor, int):
            raise ConfiguracaoInvalida(f"{nome} precisa ser um número inteiro.")
        return valor

    threads = inteiro("threads", 4)
    minimo = inteiro("delay_min_ms", 25)
    maximo = inteiro("delay_max_ms", 100)
    if not 1 <= threads <= 64:
        raise ConfiguracaoInvalida("Escolha entre 1 e 64 threads.")
    if not 0 <= minimo <= 500 or not 0 <= maximo <= 500 or minimo > maximo:
        raise ConfiguracaoInvalida("Os atrasos devem estar entre 0 e 500 ms.")
    escalonador = dados.get("scheduler", "livre")
    if escalonador not in ESCALONADORES:
        raise ConfiguracaoInvalida("Escolha o escalonador livre, fcfs ou rr.")
    quantum = inteiro("quantum", 1)
    if not 1 <= quantum <= QUANTUM_MAXIMO:
        raise ConfiguracaoInvalida(f"O quantum deve ficar entre 1 e {QUANTUM_MAXIMO} palavras.")
    return Configuracao(texto, threads, minimo, maximo, escalonador, quantum)


def metricas_escalonamento(blocos: list[list[int]], fatias: list[Fatia]) -> dict:
    """Calcula as métricas clássicas de escalonamento a partir das fatias de CPU.

    Todas as threads chegam no instante 0, então:
    - resposta: quando a thread recebeu a CPU pela primeira vez;
    - retorno (turnaround): quando a thread terminou a última palavra;
    - espera: tempo pronta na fila, sem CPU (retorno - tempo executando).
    """
    por_thread = []
    for thread_id, bloco in enumerate(blocos):
        proprias = [fatia for fatia in fatias if fatia.thread_id == thread_id]
        if not bloco or not proprias:
            continue
        execucao = sum(fatia.fim_ms - fatia.inicio_ms for fatia in proprias)
        retorno = max(fatia.fim_ms for fatia in proprias)
        por_thread.append({
            "thread_id": thread_id,
            "words": len(bloco),
            "response_ms": min(fatia.inicio_ms for fatia in proprias),
            "burst_ms": execucao,
            "turnaround_ms": retorno,
            "wait_ms": max(0.0, retorno - execucao),
        })

    def media(chave: str) -> float:
        return sum(item[chave] for item in por_thread) / len(por_thread) if por_thread else 0.0

    trocas = sum(1 for a, b in zip(fatias, fatias[1:]) if a.thread_id != b.thread_id)
    return {
        "thread_stats": por_thread,
        "mean_wait_ms": media("wait_ms"),
        "mean_response_ms": media("response_ms"),
        "mean_turnaround_ms": media("turnaround_ms"),
        "context_switches": trocas,
    }


def executar(
    configuracao: Configuracao,
    *,
    ao_iniciar: Callable[[list[list[int]]], None] | None = None,
    ao_evento: Callable[[Evento], None] | None = None,
    ao_despacho: Callable[[int, float], None] | None = None,
    ao_fatia: Callable[[Fatia], None] | None = None,
    cancelar: threading.Event | None = None,
    gerador_aleatorio: random.Random | None = None,
    relogio: Callable[[], float] = time.perf_counter,
) -> dict:
    """Executa uma rodada e devolve fatos, sem assumir como serão visualizados.

    Com o escalonador "livre" todas as threads correm ao mesmo tempo. Com
    "fcfs" ou "rr" um escalonador entrega a CPU simulada a uma thread por vez:
    ao_despacho avisa quem recebeu a CPU e ao_fatia, quando ela devolveu.
    """
    palavras = configuracao.palavras
    blocos = dividir_indices(len(palavras), configuracao.threads)
    eventos: list[Evento] = []
    fatias: list[Fatia] = []
    trava = threading.Lock()
    cancelar = cancelar or threading.Event()
    sorteio = gerador_aleatorio or random.Random()
    # Uma semente por thread: com o mesmo gerador, cada palavra recebe o mesmo
    # atraso em qualquer escalonador, o que torna a comparação justa.
    sementes = [sorteio.randrange(2**63) for _ in blocos]
    inicio = relogio()
    escalonado = configuracao.escalonador != "livre"

    def agora_ms() -> float:
        return (relogio() - inicio) * 1000

    # Estado compartilhado com o escalonador (só usado nos modos fcfs/rr).
    vez = [threading.Semaphore(0) for _ in blocos]
    devolveu = threading.Semaphore(0)
    liberadas = [0] * len(blocos)
    processadas = [0] * len(blocos)
    comeco_thread = [0.0] * len(blocos)

    if ao_iniciar:
        ao_iniciar(blocos)

    def processar(thread_id: int, indice: int, sorteio_local: random.Random) -> bool:
        atraso_s = sorteio_local.uniform(
            configuracao.atraso_min_ms / 1000,
            configuracao.atraso_max_ms / 1000,
        )
        if cancelar.wait(atraso_s):
            return False
        with trava:
            evento = Evento(
                sequencia=len(eventos),
                thread_id=thread_id,
                indice_original=indice,
                palavra=palavras[indice],
                tempo_ms=agora_ms(),
            )
            eventos.append(evento)
        if ao_evento:
            ao_evento(evento)
        return True

    def trabalhador(thread_id: int, indices: list[int]) -> None:
        sorteio_local = random.Random(sementes[thread_id])
        comeco_thread[thread_id] = agora_ms()
        for indice in indices:
            if not processar(thread_id, indice, sorteio_local):
                return

    def trabalhador_escalonado(thread_id: int, indices: list[int]) -> None:
        sorteio_local = random.Random(sementes[thread_id])
        while processadas[thread_id] < len(indices):
            vez[thread_id].acquire()  # espera o escalonador entregar a CPU
            try:
                if cancelar.is_set():
                    return
                for _ in range(liberadas[thread_id]):
                    if not processar(thread_id, indices[processadas[thread_id]], sorteio_local):
                        return
                    processadas[thread_id] += 1
            finally:
                devolveu.release()  # devolve a CPU ao escalonador

    workers = [
        threading.Thread(
            target=trabalhador_escalonado if escalonado else trabalhador,
            args=(tid, bloco),
            name=f"T{tid}",
        )
        for tid, bloco in enumerate(blocos)
    ]
    for worker in workers:
        worker.start()

    if escalonado:
        # Todas chegam no instante 0, em ordem de criação: T0, T1, T2...
        fila_prontos = deque(tid for tid, bloco in enumerate(blocos) if bloco)
        while fila_prontos and not cancelar.is_set():
            tid = fila_prontos.popleft()
            restantes = len(blocos[tid]) - processadas[tid]
            # FCFS: roda até o fim. RR: no máximo `quantum` palavras e volta para a fila.
            liberadas[tid] = restantes if configuracao.escalonador == "fcfs" else min(configuracao.quantum, restantes)
            antes = processadas[tid]
            comeco = agora_ms()
            if ao_despacho:
                ao_despacho(tid, comeco)
            vez[tid].release()
            devolveu.acquire()
            fatia = Fatia(tid, comeco, agora_ms(), processadas[tid] - antes)
            fatias.append(fatia)
            if ao_fatia:
                ao_fatia(fatia)
            if processadas[tid] < len(blocos[tid]):
                fila_prontos.append(tid)
        for semaforo in vez:  # acorda quem ainda espera, caso a rodada seja cancelada
            semaforo.release()

    for worker in workers:
        worker.join()

    if not escalonado:
        # Sem escalonador próprio, cada thread "segura a CPU" do início ao fim.
        for tid, bloco in enumerate(blocos):
            proprios = [evento for evento in eventos if evento.thread_id == tid]
            if bloco and proprios:
                fatias.append(Fatia(tid, comeco_thread[tid], proprios[-1].tempo_ms, len(proprios)))

    ordem = [evento.indice_original for evento in eventos]
    inversoes = pares_fora_de_ordem(ordem)
    total_pares = len(ordem) * (len(ordem) - 1) // 2
    metricas = metricas_escalonamento(blocos, fatias)
    if not escalonado:
        metricas["context_switches"] = None  # quem troca é o sistema operacional
    return {
        "duration_ms": agora_ms(),
        "events": [evento.como_dict() for evento in eventos],
        "order": ordem,
        "final_text": " ".join(evento.palavra for evento in eventos),
        "inversions": inversoes,
        "total_pairs": total_pares,
        "kendall": desordem_kendall(ordem),
        "cancelled": cancelar.is_set(),
        "blocks": blocos,
        "scheduler": configuracao.escalonador,
        "quantum": configuracao.quantum,
        "slices": [fatia.como_dict() for fatia in fatias],
        **metricas,
    }
