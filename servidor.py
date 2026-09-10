"""Servidor local do Playground de Threads.

Execute python servidor.py e abra o endereço exibido no navegador.
"""

from __future__ import annotations

from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import argparse
import json
from pathlib import Path
from queue import Queue
import threading
from typing import Any
from urllib.parse import urlparse

from threads_core import (
    Configuracao,
    ConfiguracaoInvalida,
    configuracao_de_dict,
    executar,
    gerar_texto,
    grade_de_dict,
    reconstruir_marcadas,
)


RAIZ = Path(__file__).parent
WEB = RAIZ / "web"
LIMITE_CORPO = 100_000


class PlaygroundHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "PlaygroundThreads/1.0"

    def log_message(self, formato: str, *argumentos: Any) -> None:
        """Evita poluir a demonstração com logs de cada evento."""

    def handle(self) -> None:
        """O navegador pode fechar um stream ao cancelar uma rodada."""
        try:
            super().handle()
        except ConnectionResetError:
            pass

    def _json(self, status: int, corpo: dict) -> None:
        dados = json.dumps(corpo, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def _ler_json(self) -> dict:
        tamanho = self.headers.get("Content-Length")
        if tamanho is None:
            raise ConfiguracaoInvalida("Informe o tamanho do corpo da requisição.")
        try:
            tamanho_int = int(tamanho)
        except ValueError as erro:
            raise ConfiguracaoInvalida("Tamanho de corpo inválido.") from erro
        if not 0 <= tamanho_int <= LIMITE_CORPO:
            raise ConfiguracaoInvalida("A requisição é grande demais.")
        try:
            return json.loads(self.rfile.read(tamanho_int).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as erro:
            raise ConfiguracaoInvalida("Envie um JSON válido em UTF-8.") from erro

    def do_GET(self) -> None:
        caminho = urlparse(self.path).path
        arquivos = {
            "/": (WEB / "index.html", "text/html; charset=utf-8"),
            "/static/styles.css": (WEB / "styles.css", "text/css; charset=utf-8"),
            "/static/app.js": (WEB / "app.js", "application/javascript; charset=utf-8"),
        }
        if caminho == "/api/health":
            self._json(HTTPStatus.OK, {"status": "ok"})
            return
        arquivo = arquivos.get(caminho)
        if not arquivo or not arquivo[0].is_file():
            self._json(HTTPStatus.NOT_FOUND, {"error": "Rota não encontrada."})
            return
        dados = arquivo[0].read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", arquivo[1])
        self.send_header("Content-Length", str(len(dados)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(dados)

    def do_POST(self) -> None:
        caminho = urlparse(self.path).path
        try:
            dados = self._ler_json()
            if caminho == "/api/run":
                configuracao = configuracao_de_dict(dados)
                self._stream_rodada(configuracao)
            elif caminho == "/api/compare":
                configuracao = configuracao_de_dict(dados)
                self._stream_comparacao(configuracao, dados)
            elif caminho == "/api/compare-grid":
                self._stream_grade(dados)
            elif caminho == "/api/reconstruct":
                self._reconstruir(dados)
            else:
                self._json(HTTPStatus.NOT_FOUND, {"error": "Rota não encontrada."})
        except ConfiguracaoInvalida as erro:
            self._json(HTTPStatus.BAD_REQUEST, {"error": str(erro)})

    def _iniciar_ndjson(self) -> None:
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

    def _enviar_linha(self, registro: dict) -> None:
        self.wfile.write((json.dumps(registro, ensure_ascii=False) + "\n").encode("utf-8"))
        self.wfile.flush()

    def _stream_rodada(self, configuracao: Configuracao) -> None:
        fila: Queue[dict | None] = Queue()
        cancelar = threading.Event()

        def iniciar(blocos: list[list[int]]) -> None:
            fila.put({"type": "allocation", "blocks": blocos, "config": {
                "text": configuracao.texto, "threads": configuracao.threads,
                "delay_min_ms": configuracao.atraso_min_ms,
                "delay_max_ms": configuracao.atraso_max_ms,
            }})

        def evento(item: Any) -> None:
            fila.put({"type": "event", **item.como_dict()})

        def rodar() -> None:
            try:
                resultado = executar(configuracao, ao_iniciar=iniciar, ao_evento=evento, cancelar=cancelar)
                resultado.pop("events", None)
                fila.put({"type": "summary", **resultado})
            except Exception as erro:  # mantém o stream legível se algo inesperado falhar
                fila.put({"type": "error", "error": str(erro)})
            finally:
                fila.put(None)

        worker = threading.Thread(target=rodar, daemon=True, name="rodada-api")
        worker.start()
        self._iniciar_ndjson()
        try:
            while True:
                item = fila.get()
                if item is None:
                    break
                self._enviar_linha(item)
        except (BrokenPipeError, ConnectionResetError):
            cancelar.set()
        finally:
            cancelar.set()
            worker.join()

    def _stream_comparacao(self, base: Configuracao, dados: dict) -> None:
        contagens = dados.get("thread_counts", [1, 2, 4, 8, 16, 32])
        repeticoes = dados.get("repetitions", 3)
        if (
            not isinstance(contagens, list)
            or not contagens
            or len(contagens) > 12
            or any(isinstance(item, bool) or not isinstance(item, int) or not 1 <= item <= 64 for item in contagens)
        ):
            raise ConfiguracaoInvalida("Escolha de 1 a 12 contagens entre 1 e 64.")
        if len(set(contagens)) != len(contagens) or 1 not in contagens:
            raise ConfiguracaoInvalida("As contagens devem ser únicas e incluir 1 thread.")
        if isinstance(repeticoes, bool) or not isinstance(repeticoes, int) or not 1 <= repeticoes <= 10:
            raise ConfiguracaoInvalida("Escolha entre 1 e 10 repetições.")

        fila: Queue[dict | None] = Queue()
        cancelar = threading.Event()

        def rodar() -> None:
            resultados = []
            total = len(contagens) * repeticoes
            feito = 0
            try:
                for quantidade in contagens:
                    tentativas = []
                    for repeticao in range(repeticoes):
                        if cancelar.is_set():
                            return
                        item = executar(
                            Configuracao(base.texto, quantidade, base.atraso_min_ms, base.atraso_max_ms),
                            cancelar=cancelar,
                        )
                        feito += 1
                        tentativa = {
                            "duration_ms": item["duration_ms"],
                            "kendall": item["kendall"],
                            "inversions": item["inversions"],
                        }
                        tentativas.append(tentativa)
                        fila.put({"type": "progress", "done": feito, "total": total,
                                  "threads": quantidade, "repetition": repeticao + 1,
                                  "trial": tentativa})
                    tempos = [item["duration_ms"] for item in tentativas]
                    desordens = [item["kendall"] for item in tentativas]
                    resultados.append({
                        "threads": quantidade,
                        "trials": tentativas,
                        "mean_duration_ms": sum(tempos) / len(tempos),
                        "min_duration_ms": min(tempos),
                        "max_duration_ms": max(tempos),
                        "mean_kendall": sum(desordens) / len(desordens),
                    })
                base_um = next(item["mean_duration_ms"] for item in resultados if item["threads"] == 1)
                for item in resultados:
                    item["speedup"] = base_um / item["mean_duration_ms"] if item["mean_duration_ms"] else 0
                fila.put({"type": "comparison", "results": resultados, "repetitions": repeticoes})
            except Exception as erro:
                fila.put({"type": "error", "error": str(erro)})
            finally:
                fila.put(None)

        worker = threading.Thread(target=rodar, daemon=True, name="comparacao-api")
        worker.start()
        self._iniciar_ndjson()
        try:
            while True:
                item = fila.get()
                if item is None:
                    break
                self._enviar_linha(item)
        except (BrokenPipeError, ConnectionResetError):
            cancelar.set()
        finally:
            cancelar.set()
            worker.join()


    def _stream_grade(self, dados: dict) -> None:
        """Mede o tempo para cada combinação (comprimento do texto x quantidade de threads).

        Ao contrário de /api/compare, aqui o texto muda a cada rodada: é gerado
        sinteticamente a partir do vocabulário de exemplo para atingir o número de
        palavras pedido, já que o objetivo é isolar o efeito do comprimento.
        """
        threads_lista, comprimentos, repeticoes = grade_de_dict(dados)

        atraso_min = dados.get("delay_min_ms", 25)
        atraso_max = dados.get("delay_max_ms", 100)
        if (
            isinstance(atraso_min, bool)
            or isinstance(atraso_max, bool)
            or not isinstance(atraso_min, int)
            or not isinstance(atraso_max, int)
            or not 0 <= atraso_min <= 500
            or not 0 <= atraso_max <= 500
            or atraso_min > atraso_max
        ):
            raise ConfiguracaoInvalida("Os atrasos devem estar entre 0 e 500 ms.")

        fila: Queue[dict | None] = Queue()
        cancelar = threading.Event()

        def rodar() -> None:
            resultados = []
            total = len(threads_lista) * len(comprimentos) * repeticoes
            feito = 0
            try:
                for comprimento in comprimentos:
                    texto = gerar_texto(comprimento)
                    for quantidade in threads_lista:
                        if cancelar.is_set():
                            return
                        tentativas = []
                        for repeticao in range(repeticoes):
                            if cancelar.is_set():
                                return
                            item = executar(
                                Configuracao(texto, quantidade, atraso_min, atraso_max),
                                cancelar=cancelar,
                            )
                            feito += 1
                            tentativa = {"duration_ms": item["duration_ms"]}
                            tentativas.append(tentativa)
                            fila.put({
                                "type": "progress", "done": feito, "total": total,
                                "length": comprimento, "threads": quantidade,
                                "repetition": repeticao + 1, "trial": tentativa,
                            })
                        tempos = [item["duration_ms"] for item in tentativas]
                        resultados.append({
                            "length": comprimento,
                            "threads": quantidade,
                            "trials": tentativas,
                            "mean_duration_ms": sum(tempos) / len(tempos),
                        })
                fila.put({
                    "type": "grid",
                    "results": resultados,
                    "lengths": comprimentos,
                    "threads": threads_lista,
                    "repetitions": repeticoes,
                })
            except Exception as erro:
                fila.put({"type": "error", "error": str(erro)})
            finally:
                fila.put(None)

        worker = threading.Thread(target=rodar, daemon=True, name="grade-api")
        worker.start()
        self._iniciar_ndjson()
        try:
            while True:
                item = fila.get()
                if item is None:
                    break
                self._enviar_linha(item)
        except (BrokenPipeError, ConnectionResetError):
            cancelar.set()
        finally:
            cancelar.set()
            worker.join()


    def _reconstruir(self, dados: dict) -> None:
        """Envia o mesmo lote endereçado com 1 thread e com várias, remonta as
        frases pelas etiquetas id/posição e compara o tempo dos dois casos."""
        configuracao = configuracao_de_dict(dados)
        palavras = configuracao.palavras

        def rodar(quantidade_threads: int) -> dict:
            resultado = executar(Configuracao(
                configuracao.texto, quantidade_threads,
                configuracao.atraso_min_ms, configuracao.atraso_max_ms,
            ))
            chegada = [palavras[indice] for indice in resultado["order"]]
            return {
                "threads": quantidade_threads,
                "duration_ms": resultado["duration_ms"],
                "arrival": " ".join(chegada),
                "sentences": reconstruir_marcadas(chegada),
            }

        alvo = configuracao.threads if configuracao.threads > 1 else 4
        unico = rodar(1)
        multi = rodar(alvo)
        speedup = unico["duration_ms"] / multi["duration_ms"] if multi["duration_ms"] else 0
        self._json(HTTPStatus.OK, {
            "single": unico,
            "multi": multi,
            "speedup": speedup,
            "match": unico["sentences"] == multi["sentences"],
        })


def criar_servidor(host: str = "127.0.0.1", porta: int = 8000) -> ThreadingHTTPServer:
    servidor = ThreadingHTTPServer((host, porta), PlaygroundHandler)
    servidor.daemon_threads = True
    return servidor


def main() -> None:
    parser = argparse.ArgumentParser(description="Playground local de threads Python")
    parser.add_argument("--port", type=int, default=8000, help="porta local (padrão: 8000)")
    argumentos = parser.parse_args()
    servidor = criar_servidor(porta=argumentos.port)
    host, porta = servidor.server_address
    print(f"Playground disponível em http://{host}:{porta}")
    print("Pressione Ctrl+C para encerrar.")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\\nServidor encerrado.")
    finally:
        servidor.server_close()


if __name__ == "__main__":
    main()
