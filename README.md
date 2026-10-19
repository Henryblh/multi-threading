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

## Parte 2: escalonamento (Java)

Comparação de algoritmos de escalonamento num canal de chat: cada mensagem é uma
thread Java, e um despachante decide, com semáforos, quem usa a CPU (1 palavra = 1 tick).
Algoritmos: **FCFS**, **SJF**, **Round Robin** e **Round Robin por usuário**.

Requer JDK 17 ou superior (sem dependências externas). A partir da raiz do projeto:

```bash
javac -encoding UTF-8 -d escalonamento/out escalonamento/src/escalonador/*.java
java -cp escalonamento/out escalonador.Servidor            # playground em http://127.0.0.1:8001
java -cp escalonamento/out escalonador.Servidor --terminal spammer   # Gantt no terminal
```

A **Sala do Iglu** (`http://127.0.0.1:8001/chat`) mostra o mesmo backend como o chat de um jogo: cada
jogador é um personagem com balão de fala, e as fases mostram o chat sem semáforo (falas corrompidas),
com semáforo e com cada algoritmo de escalonamento (a bíblia do Bruno travando ou não a sala).

Cenários do terminal: `spammer`, `fila`, `insistente`, `iguais`.

Testes:

```bash
javac -encoding UTF-8 -d escalonamento/out escalonamento/src/escalonador/*.java escalonamento/test/escalonador/*.java
java -cp escalonamento/out escalonador.TesteEscalonador
```

| Arquivo | Descrição |
| --- | --- |
| `escalonamento/src/escalonador/Despachante.java` | Libera uma thread por vez via semáforo e mede o resultado |
| `escalonamento/src/escalonador/Politica.java` | Os algoritmos (a fila de prontos de cada um) |
| `escalonamento/src/escalonador/Tarefa.java` | A thread de cada mensagem |
| `escalonamento/src/escalonador/Cenarios.java` | Cenários prontos que expõem o ponto forte/fraco de cada algoritmo |
| `escalonamento/src/escalonador/Servidor.java` | Servidor HTTP do JDK e modo terminal |
| `escalonamento/web/` | Interface do playground (reusa `web/styles.css`) |

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
