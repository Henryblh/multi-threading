from __future__ import annotations

import json
import random
import threading
import unittest
from urllib.request import Request, urlopen

from servidor import criar_servidor
from threads_core import Configuracao, ConfiguracaoInvalida, configuracao_de_dict, desordem_kendall, dividir_indices, executar


class NucleoTests(unittest.TestCase):
    def test_divisao_cobre_cada_indice_uma_vez(self) -> None:
        blocos = dividir_indices(17, 4)
        self.assertEqual([indice for bloco in blocos for indice in bloco], list(range(17)))

    def test_kendall_em_ordens_conhecidas(self) -> None:
        self.assertEqual(desordem_kendall([0, 1, 2, 3]), 0)
        self.assertEqual(desordem_kendall([3, 2, 1, 0]), 1)
        self.assertAlmostEqual(desordem_kendall([1, 0, 2]), 1 / 3)

    def test_uma_thread_preserva_ordem(self) -> None:
        resultado = executar(Configuracao("a b c d e", 1, 0, 0), gerador_aleatorio=random.Random(3))
        self.assertEqual(resultado["order"], [0, 1, 2, 3, 4])
        self.assertEqual(resultado["kendall"], 0)

    def test_varias_threads_entregam_todas_as_palavras(self) -> None:
        resultado = executar(Configuracao("a b c d e f g h i", 4, 0, 0), gerador_aleatorio=random.Random(4))
        self.assertCountEqual(resultado["order"], list(range(9)))
        self.assertEqual(len(resultado["events"]), 9)

    def test_validacao_rejeita_entrada_inadequada(self) -> None:
        with self.assertRaises(ConfiguracaoInvalida):
            configuracao_de_dict({"text": "", "threads": 4})
        with self.assertRaises(ConfiguracaoInvalida):
            configuracao_de_dict({"text": "uma palavra", "threads": 65})


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = criar_servidor(porta=0)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = "http://127.0.0.1:" + str(cls.server.server_address[1])

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def post_stream(self, route: str, body: dict) -> list[dict]:
        request = Request(
            self.base + route,
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=5) as response:
            return [json.loads(line) for line in response.read().decode().splitlines()]

    def test_run_transmite_alocacao_eventos_e_resumo(self) -> None:
        registros = self.post_stream("/api/run", {
            "text": "um dois três quatro",
            "threads": 2,
            "delay_min_ms": 0,
            "delay_max_ms": 0,
        })
        self.assertEqual(registros[0]["type"], "allocation")
        eventos = [registro for registro in registros if registro["type"] == "event"]
        resumo = registros[-1]
        self.assertEqual(len(eventos), 4)
        self.assertEqual(resumo["type"], "summary")
        self.assertCountEqual(resumo["order"], [0, 1, 2, 3])

    def test_comparacao_retorna_agregados(self) -> None:
        registros = self.post_stream("/api/compare", {
            "text": "um dois três quatro",
            "threads": 4,
            "delay_min_ms": 0,
            "delay_max_ms": 0,
            "thread_counts": [1, 2],
            "repetitions": 1,
        })
        comparacao = next(registro for registro in registros if registro["type"] == "comparison")
        self.assertEqual([item["threads"] for item in comparacao["results"]], [1, 2])
        self.assertTrue(all("speedup" in item for item in comparacao["results"]))


if __name__ == "__main__":
    unittest.main()
