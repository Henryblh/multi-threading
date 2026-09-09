"""Núcleo reutilizável para os experimentos de threads."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import random
import threading
import time
from typing import Callable


TEXTO_EXEMPLO = "Threads começam com blocos ordenados, mas cada palavra termina em um instante diferente e a frase chega embaralhada."


class ConfiguracaoInvalida(ValueError):
    """Erro de entrada que pode ser mostrado pela API."""


@dataclass(frozen=True)
class Configuracao:
    texto: str
    threads: int
    atraso_min_ms: int = 25
    atraso_max_ms: int = 100

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


def dividir_indices(total: int, quantidade_threads: int) -> list[list[int]]:
    """Divide índices em blocos contíguos, inclusive quando há blocos vazios."""
    passo = total / quantidade_threads
    return [
        list(range(round(t * passo), round((t + 1) * passo)))
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
    return Configuracao(texto, threads, minimo, maximo)


def executar(
    configuracao: Configuracao,
    *,
    ao_iniciar: Callable[[list[list[int]]], None] | None = None,
    ao_evento: Callable[[Evento], None] | None = None,
    cancelar: threading.Event | None = None,
    gerador_aleatorio: random.Random | None = None,
    relogio: Callable[[], float] = time.perf_counter,
) -> dict:
    """Executa uma rodada e devolve fatos, sem assumir como serão visualizados."""
    palavras = configuracao.palavras
    blocos = dividir_indices(len(palavras), configuracao.threads)
    eventos: list[Evento] = []
    trava = threading.Lock()
    cancelar = cancelar or threading.Event()
    sorteio = gerador_aleatorio or random.Random()
    sementes = [sorteio.randrange(2**63) for _ in blocos]
    inicio = relogio()

    if ao_iniciar:
        ao_iniciar(blocos)

    def trabalhador(thread_id: int, indices: list[int]) -> None:
        sorteio_local = random.Random(sementes[thread_id])
        for indice in indices:
            atraso_s = sorteio_local.uniform(
                configuracao.atraso_min_ms / 1000,
                configuracao.atraso_max_ms / 1000,
            )
            if cancelar.wait(atraso_s):
                return
            with trava:
                evento = Evento(
                    sequencia=len(eventos),
                    thread_id=thread_id,
                    indice_original=indice,
                    palavra=palavras[indice],
                    tempo_ms=(relogio() - inicio) * 1000,
                )
                eventos.append(evento)
            if ao_evento:
                ao_evento(evento)

    workers = [
        threading.Thread(target=trabalhador, args=(tid, bloco), name=f"T{tid}")
        for tid, bloco in enumerate(blocos)
    ]
    for worker in workers:
        worker.start()
    for worker in workers:
        worker.join()

    ordem = [evento.indice_original for evento in eventos]
    inversoes = pares_fora_de_ordem(ordem)
    total_pares = len(ordem) * (len(ordem) - 1) // 2
    return {
        "duration_ms": (relogio() - inicio) * 1000,
        "events": [evento.como_dict() for evento in eventos],
        "order": ordem,
        "final_text": " ".join(evento.palavra for evento in eventos),
        "inversions": inversoes,
        "total_pairs": total_pares,
        "kendall": desordem_kendall(ordem),
        "cancelled": cancelar.is_set(),
        "blocks": blocos,
    }
