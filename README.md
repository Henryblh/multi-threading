# Playground de Threads

Demonstração de como várias threads processam as palavras de uma frase em paralelo
e devolvem os resultados em uma ordem imprevisível. O projeto tem versões de
terminal e um playground web.

## Requisitos

- Python 3 (testado no Python 3.14)
- Nenhuma dependência externa (só a biblioteca padrão)

## Como rodar

Clone o repositório e entre na pasta:

```bash
git clone https://github.com/Henryblh/multi-threading.git
cd multi-threading
```

### Playground web

```bash
python servidor.py
```

Abra no navegador o endereço exibido (por padrão, `http://127.0.0.1:8000`).
Para usar outra porta:

```bash
python servidor.py --port 8080
```

Pressione `Ctrl+C` para encerrar o servidor.

### Versão de terminal (palavras)

```bash
python threads_palavras.py                          # usa a frase de exemplo
python threads_palavras.py "uma frase para testar"  # usa a sua frase
python threads_palavras.py --perguntar              # pede a frase no terminal
```

### Versão de terminal (timeline)

```bash
python threads_visual.py            # uma rodada com 4 threads
python threads_visual.py 8          # uma rodada com 8 threads
python threads_visual.py --comparar # compara diferentes quantidades de threads
```

## Testes

```bash
python -m unittest
```

## Estrutura

| Arquivo | Descrição |
| --- | --- |
| `threads_core.py` | Lógica principal: divisão das palavras e execução das threads |
| `servidor.py` | Servidor HTTP local que serve o playground web |
| `web/` | Interface do playground (HTML, CSS e JavaScript) |
| `threads_palavras.py` | Demonstração simples no terminal |
| `threads_visual.py` | Timeline no terminal com métrica de desordem |
| `test_threads_core.py` | Testes automatizados |
