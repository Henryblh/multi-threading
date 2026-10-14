from __future__ import annotations

import json
import random
import threading
import unittest
from urllib.request import Request, urlopen

from semaforos_core import ConfiguracaoCanal, MENSAGENS_EXEMPLO, canal_de_dict, executar_canal, interrupcoes_por_thread
from servidor import criar_servidor
from threads_core import (
    Configuracao,
    ConfiguracaoInvalida,
    configuracao_de_dict,
    desordem_kendall,
    dividir_indices,
    executar,
    reconstruir_marcadas,
)


def ordem_com(escalonador: str, quantum: int = 1, threads: int = 3, palavras: int = 7) -> dict:
    texto = " ".join(f"p{indice}" for indice in range(palavras))
    return executar(
        Configuracao(texto, threads, 0, 2, escalonador, quantum),
        gerador_aleatorio=random.Random(5),
    )


class NucleoTests(unittest.TestCase):
    def test_divisao_cobre_cada_indice_uma_vez(self) -> None:
        blocos = dividir_indices(17, 4)
        self.assertCountEqual([indice for bloco in blocos for indice in bloco], list(range(17)))

    def test_divisao_em_rodizio(self) -> None:
        self.assertEqual(dividir_indices(7, 3), [[0, 3, 6], [1, 4], [2, 5]])

    def test_reconstroi_frases_fora_de_ordem(self) -> None:
        chegada = [
            "id2/palavra2/rede", "id1/palavra1/O", "id2/palavra1/A",
            "id1/palavra3/preto", "id1/palavra2/gato",
        ]
        self.assertEqual(
            reconstruir_marcadas(chegada),
            {"id1": "O gato preto", "id2": "A rede"},
        )

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

    def test_fcfs_entrega_cada_bloco_inteiro_em_ordem_de_chegada(self) -> None:
        resultado = ordem_com("fcfs")
        self.assertEqual(resultado["order"], [0, 3, 6, 1, 4, 2, 5])
        self.assertEqual([fatia["thread_id"] for fatia in resultado["slices"]], [0, 1, 2])
        self.assertEqual(resultado["context_switches"], 2)

    def test_round_robin_quantum_um_remonta_a_frase(self) -> None:
        resultado = ordem_com("rr", quantum=1)
        self.assertEqual(resultado["order"], list(range(7)))
        self.assertEqual([fatia["thread_id"] for fatia in resultado["slices"]], [0, 1, 2, 0, 1, 2, 0])
        self.assertEqual(resultado["kendall"], 0)

    def test_round_robin_quantum_dois_entrega_pares(self) -> None:
        resultado = ordem_com("rr", quantum=2)
        self.assertEqual(resultado["order"], [0, 3, 1, 4, 2, 5, 6])

    def test_round_robin_responde_antes_que_fcfs(self) -> None:
        fcfs = ordem_com("fcfs", threads=4, palavras=16)
        rr = ordem_com("rr", threads=4, palavras=16)
        self.assertLess(rr["mean_response_ms"], fcfs["mean_response_ms"])

    def test_escalonadores_usam_os_mesmos_atrasos(self) -> None:
        fatias = {
            nome: sum(f["fim_ms"] - f["inicio_ms"] for f in ordem_com(nome)["slices"])
            for nome in ("fcfs", "rr")
        }
        self.assertAlmostEqual(fatias["fcfs"], fatias["rr"], delta=25)

    def test_cancelar_escalonado_nao_trava(self) -> None:
        cancelar = threading.Event()
        cancelar.set()
        resultado = executar(Configuracao("a b c d", 2, 0, 0, "rr"), cancelar=cancelar)
        self.assertTrue(resultado["cancelled"])

    def test_validacao_rejeita_entrada_inadequada(self) -> None:
        with self.assertRaises(ConfiguracaoInvalida):
            configuracao_de_dict({"text": "", "threads": 4})
        with self.assertRaises(ConfiguracaoInvalida):
            configuracao_de_dict({"text": "uma palavra", "threads": 65})
        with self.assertRaises(ConfiguracaoInvalida):
            configuracao_de_dict({"text": "uma palavra", "scheduler": "sjf"})
        with self.assertRaises(ConfiguracaoInvalida):
            configuracao_de_dict({"text": "uma palavra", "scheduler": "rr", "quantum": 0})


class SecaoCriticaTests(unittest.TestCase):
    def rodar(self, com_controle: bool, frequencias: int = 1) -> dict:
        return executar_canal(
            ConfiguracaoCanal(MENSAGENS_EXEMPLO, com_controle, frequencias, 5, 5, pausa_contador_ms=8),
            gerador_aleatorio=random.Random(1),
        )

    def test_sem_controle_mistura_mensagens_e_perde_contagens(self) -> None:
        resultado = self.rodar(False)
        self.assertLess(resultado["intact"], len(MENSAGENS_EXEMPLO))
        self.assertGreater(resultado["lost_updates"], 0)

    def test_com_controle_entrega_tudo_inteiro(self) -> None:
        resultado = self.rodar(True)
        self.assertEqual(resultado["intact"], len(MENSAGENS_EXEMPLO))
        self.assertEqual(resultado["lost_updates"], 0)
        self.assertEqual(len(resultado["heard"]), 1)

    def test_semaforo_contador_permite_duas_frequencias(self) -> None:
        resultado = self.rodar(True, frequencias=2)
        self.assertEqual(resultado["intact"], len(MENSAGENS_EXEMPLO))
        self.assertEqual(resultado["lost_updates"], 0)
        dentro, maximo = 0, 0
        for evento in resultado["events"]:
            dentro += {"enter": 1, "leave": -1}.get(evento["kind"], 0)
            maximo = max(maximo, dentro)
        self.assertEqual(maximo, 2)

    def test_conta_interrupcoes(self) -> None:
        ouvido = [[{"thread_id": t} for t in (0, 1, 0, 0, 1)]]
        self.assertEqual(interrupcoes_por_thread(ouvido, 2), [1, 2])

    def test_validacao_do_canal(self) -> None:
        with self.assertRaises(ConfiguracaoInvalida):
            canal_de_dict({"messages": ["só uma"]})
        with self.assertRaises(ConfiguracaoInvalida):
            canal_de_dict({"mode": "talvez"})
        with self.assertRaises(ConfiguracaoInvalida):
            canal_de_dict({"frequencies": 4})


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

    def test_reconstruct_compara_uma_e_varias_threads(self) -> None:
        lote = " ".join(
            f"id{frase}/palavra{pos}/w{frase}{pos}"
            for pos in range(1, 5) for frase in range(1, 5)
        )
        registros = self.post_stream("/api/reconstruct", {
            "text": lote, "threads": 4, "delay_min_ms": 1, "delay_max_ms": 3,
        })
        corpo = registros[0]
        self.assertEqual(corpo["single"]["threads"], 1)
        self.assertEqual(corpo["multi"]["threads"], 4)
        self.assertTrue(corpo["match"])
        self.assertEqual(len(corpo["multi"]["sentences"]), 4)
        self.assertLess(corpo["multi"]["duration_ms"], corpo["single"]["duration_ms"])

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

    def test_compara_escalonadores(self) -> None:
        registros = self.post_stream("/api/compare-schedulers", {
            "text": "um dois três quatro cinco seis",
            "threads": 3, "delay_min_ms": 0, "delay_max_ms": 1, "quantum": 1,
        })
        final = next(registro for registro in registros if registro["type"] == "schedulers")
        resultados = {item["scheduler"]: item for item in final["results"]}
        self.assertEqual(set(resultados), {"livre", "fcfs", "rr"})
        self.assertEqual(resultados["rr"]["order"], list(range(6)))
        self.assertEqual(resultados["fcfs"]["order"], [0, 3, 1, 4, 2, 5])

    def test_run_escalonado_transmite_fatias(self) -> None:
        registros = self.post_stream("/api/run", {
            "text": "um dois três quatro", "threads": 2,
            "delay_min_ms": 0, "delay_max_ms": 0, "scheduler": "rr",
        })
        tipos = [registro["type"] for registro in registros]
        self.assertEqual(tipos.count("dispatch"), 4)
        self.assertEqual(tipos.count("slice"), 4)
        self.assertEqual(registros[-1]["order"], [0, 1, 2, 3])

    def test_secao_critica_transmite_eventos(self) -> None:
        registros = self.post_stream("/api/critical-section", {
            "mode": "com", "messages": ["a b", "c d e"], "delay_min_ms": 0, "delay_max_ms": 1,
        })
        tipos = [registro["type"] for registro in registros]
        self.assertEqual(tipos[0], "start")
        self.assertEqual(tipos.count("event"), 2 + 2 + 5 + 2)  # wait, enter, palavras, leave
        self.assertEqual(registros[-1]["type"], "summary")
        self.assertEqual(registros[-1]["intact"], 2)


if __name__ == "__main__":
    unittest.main()
