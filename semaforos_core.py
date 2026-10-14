"""Seção crítica com e sem semáforo: um canal de rádio compartilhado.

Mesma ideia de java/CanalDeRadio.java, usada pelo playground web.

- Recurso compartilhado: o canal (uma ou mais frequências de rádio).
- Seção crítica: transmitir a mensagem inteira, palavra por palavra.
- Semáforo: a permissão para falar no canal.

Sem controle, todos falam ao mesmo tempo e o receptor ouve as mensagens
misturadas; o contador compartilhado de palavras também perde atualizações.
Com controle, cada thread faz acquire() antes de falar e release() depois.
"""

from __future__ import annotations

from dataclasses import dataclass
import random
import threading
import time
from typing import Callable

from threads_core import ConfiguracaoInvalida


NOMES = ("Alfa", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot")
MENSAGENS_EXEMPLO = (
    "Base chamando Alfa, responda, câmbio.",
    "Bravo solicita pouso na pista três, câmbio.",
    "Charlie na escuta, aguardando ordens, câmbio.",
    "Delta informa céu limpo no setor norte, câmbio.",
)
MAX_FREQUENCIAS = 3


@dataclass(frozen=True)
class ConfiguracaoCanal:
    mensagens: tuple[str, ...]
    com_controle: bool
    frequencias: int = 1
    atraso_min_ms: int = 30
    atraso_max_ms: int = 90
    # Tempo entre ler e gravar o contador: alarga a janela da condição de
    # corrida. Em Python o GIL deixa "x += 1" quase atômico, então sem essa
    # pausa a perda de atualizações quase nunca apareceria.
    pausa_contador_ms: int = 10


def canal_de_dict(dados: dict) -> ConfiguracaoCanal:
    """Converte e valida o formato de entrada aceito pelo servidor."""
    if not isinstance(dados, dict):
        raise ConfiguracaoInvalida("O corpo precisa ser um objeto JSON.")
    mensagens = dados.get("messages", list(MENSAGENS_EXEMPLO))
    if (
        not isinstance(mensagens, list)
        or not 2 <= len(mensagens) <= len(NOMES)
        or any(not isinstance(item, str) or not 1 <= len(item.split()) <= 20 for item in mensagens)
    ):
        raise ConfiguracaoInvalida(f"Use de 2 a {len(NOMES)} mensagens, cada uma com 1 a 20 palavras.")
    modo = dados.get("mode", "com")
    if modo not in ("sem", "com"):
        raise ConfiguracaoInvalida("O modo deve ser 'sem' ou 'com' controle.")

    def inteiro(nome: str, padrao: int, minimo: int, maximo: int) -> int:
        valor = dados.get(nome, padrao)
        if isinstance(valor, bool) or not isinstance(valor, int) or not minimo <= valor <= maximo:
            raise ConfiguracaoInvalida(f"{nome} deve ser um inteiro entre {minimo} e {maximo}.")
        return valor

    frequencias = inteiro("frequencies", 1, 1, MAX_FREQUENCIAS)
    minimo = inteiro("delay_min_ms", 30, 0, 500)
    maximo = inteiro("delay_max_ms", 90, 0, 500)
    if minimo > maximo:
        raise ConfiguracaoInvalida("O atraso mínimo não pode passar do máximo.")
    return ConfiguracaoCanal(tuple(item.strip() for item in mensagens), modo == "com", frequencias, minimo, maximo)


def interrupcoes_por_thread(ouvido: list[list[dict]], quantidade_threads: int) -> list[int]:
    """Quantas palavras de outras threads caíram no meio de cada mensagem."""
    cortes = [0] * quantidade_threads
    for frequencia in ouvido:
        for thread_id in range(quantidade_threads):
            posicoes = [i for i, item in enumerate(frequencia) if item["thread_id"] == thread_id]
            if posicoes:
                cortes[thread_id] += sum(
                    1 for item in frequencia[posicoes[0]:posicoes[-1] + 1] if item["thread_id"] != thread_id
                )
    return cortes


def executar_canal(
    configuracao: ConfiguracaoCanal,
    *,
    ao_evento: Callable[[dict], None] | None = None,
    cancelar: threading.Event | None = None,
    gerador_aleatorio: random.Random | None = None,
    relogio: Callable[[], float] = time.perf_counter,
) -> dict:
    """Coloca uma thread por mensagem para disputar o canal e confere o que chegou."""
    palavras = [mensagem.split() for mensagem in configuracao.mensagens]
    total_threads = len(palavras)
    cancelar = cancelar or threading.Event()
    sorteio = gerador_aleatorio or random.Random()
    sementes = [sorteio.randrange(2**63) for _ in palavras]

    semaforo_canal = threading.Semaphore(configuracao.frequencias)
    mutex_contador = threading.Semaphore(1)
    trava_registro = threading.Lock()  # só para registrar eventos; é o instrumento de medida
    largada = threading.Event()

    frequencias_livres = list(range(configuracao.frequencias))
    ouvido: list[list[dict]] = [[] for _ in range(configuracao.frequencias)]
    eventos: list[dict] = []
    contador = [0]  # contador compartilhado de palavras transmitidas
    inicio = [relogio()]

    def agora_ms() -> float:
        return (relogio() - inicio[0]) * 1000

    def registrar(tipo: str, thread_id: int, **extra) -> dict:
        with trava_registro:
            evento = {"kind": tipo, "thread_id": thread_id, "tempo_ms": agora_ms(), **extra}
            eventos.append(evento)
        if ao_evento:
            ao_evento(evento)
        return evento

    def contar_palavra() -> None:
        if configuracao.com_controle:
            mutex_contador.acquire()
        try:
            atual = contador[0]  # ler
            time.sleep(configuracao.pausa_contador_ms / 1000)  # processar
            contador[0] = atual + 1  # gravar: se alguém gravou no meio, aquela atualização some
        finally:
            if configuracao.com_controle:
                mutex_contador.release()

    def entrar(thread_id: int) -> int | None:
        if not configuracao.com_controle:
            # Sem controle ninguém pergunta se o canal está livre: vai falando.
            frequencia = thread_id % configuracao.frequencias
            registrar("enter", thread_id, frequencia=frequencia, livres=None)
            return frequencia
        registrar("wait", thread_id)
        while not semaforo_canal.acquire(timeout=0.05):  # P(): espera uma permissão livre
            if cancelar.is_set():
                return None
        with trava_registro:
            frequencia = frequencias_livres.pop(0)
            livres = len(frequencias_livres)
        registrar("enter", thread_id, frequencia=frequencia, livres=livres)
        return frequencia

    def sair(thread_id: int, frequencia: int) -> None:
        if not configuracao.com_controle:
            registrar("leave", thread_id, frequencia=frequencia, livres=None)
            return
        with trava_registro:
            frequencias_livres.append(frequencia)
            livres = len(frequencias_livres)
        registrar("leave", thread_id, frequencia=frequencia, livres=livres)
        semaforo_canal.release()  # V(): devolve a permissão e acorda quem espera

    def operador(thread_id: int) -> None:
        sorteio_local = random.Random(sementes[thread_id])
        largada.wait()
        frequencia = entrar(thread_id)
        if frequencia is None:
            return
        try:
            # ===================== SEÇÃO CRÍTICA =====================
            for posicao, palavra in enumerate(palavras[thread_id]):
                atraso_s = sorteio_local.uniform(configuracao.atraso_min_ms / 1000, configuracao.atraso_max_ms / 1000)
                if cancelar.wait(atraso_s):
                    return
                with trava_registro:
                    ouvido[frequencia].append({"thread_id": thread_id, "posicao": posicao, "palavra": palavra})
                registrar("word", thread_id, frequencia=frequencia, posicao=posicao, palavra=palavra)
                contar_palavra()
            # =========================================================
        finally:
            sair(thread_id, frequencia)

    workers = [threading.Thread(target=operador, args=(tid,), name=f"T{tid}") for tid in range(total_threads)]
    for worker in workers:
        worker.start()
    inicio[0] = relogio()
    largada.set()  # todas começam juntas, disputando o canal
    for worker in workers:
        worker.join()

    cortes = interrupcoes_por_thread(ouvido, total_threads)
    esperas = []
    for thread_id in range(total_threads):
        pediu = next((e["tempo_ms"] for e in eventos if e["kind"] == "wait" and e["thread_id"] == thread_id), None)
        entrou = next((e["tempo_ms"] for e in eventos if e["kind"] == "enter" and e["thread_id"] == thread_id), None)
        esperas.append(entrou - pediu if pediu is not None and entrou is not None else 0.0)
    mensagens = [
        {
            "thread_id": thread_id,
            "name": NOMES[thread_id],
            "text": configuracao.mensagens[thread_id],
            "words": len(palavras[thread_id]),
            "interruptions": cortes[thread_id],
            "intact": cortes[thread_id] == 0 and not cancelar.is_set(),
            "wait_ms": esperas[thread_id],
        }
        for thread_id in range(total_threads)
    ]
    esperado = sum(len(item) for item in palavras)
    return {
        "mode": "com" if configuracao.com_controle else "sem",
        "frequencies": configuracao.frequencias,
        "events": eventos,
        "heard": ouvido,
        "messages": mensagens,
        "intact": sum(1 for item in mensagens if item["intact"]),
        "counter": contador[0],
        "expected_counter": esperado,
        "lost_updates": esperado - contador[0],
        "mean_wait_ms": sum(esperas) / len(esperas) if esperas else 0.0,
        "duration_ms": agora_ms(),
        "cancelled": cancelar.is_set(),
    }
