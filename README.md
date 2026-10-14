# Playground de Threads

Demonstração de como várias threads processam as palavras de uma frase em paralelo
e devolvem os resultados em uma ordem imprevisível. O projeto tem versões de
terminal e um playground web.

## TP3: Semáforos e seção crítica

Cada thread é um operador de rádio com uma mensagem própria, e todos disputam o
mesmo canal (que, como um walkie-talkie, só entende uma voz por vez).

| Conceito | No exemplo |
| --- | --- |
| Recurso compartilhado | o canal de rádio e o contador de palavras transmitidas |
| Seção crítica | transmitir a mensagem inteira, palavra por palavra |
| Semáforo | a permissão para falar: `acquire()` antes, `release()` depois |

- **SEM controle:** todos falam ao mesmo tempo. O receptor ouve as mensagens
  misturadas (nenhuma chega inteira) e o contador compartilhado perde
  atualizações, porque `contador = contador + 1` é ler, somar e gravar.
- **COM controle:** `new Semaphore(1)` deixa um operador por vez no canal. Todas
  as mensagens chegam inteiras e o contador fecha certo, mas a transmissão
  demora mais, porque os outros esperam a vez.
- **Bônus:** `new Semaphore(2)` abre duas frequências. Até dois operadores falam
  ao mesmo tempo, e o contador passa a precisar de um mutex próprio.

### Versão Java (terminal)

```bash
java java/CanalDeRadio.java            # SEM e depois COM controle, com comparação
java java/CanalDeRadio.java sem        # só sem controle
java java/CanalDeRadio.java com 2      # com controle e 2 frequências
```

Requer Java 11 ou mais novo (não precisa compilar antes). Acrescente `--sem-cor`
se o terminal mostrar códigos de cor estranhos. Cada thread tem uma coluna, então
dá para ver quem está falando em cada instante.

### Versão web

Rode `python servidor.py` e abra `http://127.0.0.1:8000/semaforos`. Os dois
canais transmitem lado a lado, ao vivo, mostrando quem espera na fila do
semáforo, quem está no ar, o que o receptor ouviu e o placar de cada lado.

## Requisitos

- Python 3 (testado no Python 3.14)
- Java 11+ para a versão de terminal do TP3
- Nenhuma dependência externa (só as bibliotecas padrão)

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
A página do TP3 fica em `/semaforos`, com um link no topo das duas páginas.
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

### Escalonadores (FCFS e Round Robin)

No playground web, a seção 01 tem um seletor de **escalonador**:

- **Livre (SO)** — comportamento original: todas as threads trabalham ao mesmo
  tempo e o sistema operacional decide quem avança. É o mais rápido, mas a frase
  chega embaralhada.
- **FCFS** (*First Come, First Served*) — um escalonador próprio entrega uma
  "CPU" simulada a uma thread por vez, na ordem de chegada (T0, T1, T2…). Cada
  thread roda até terminar todas as suas palavras. A saída fica agrupada por
  thread (1, 4, 7, …, 2, 5, 8, …) e as últimas threads esperam muito para começar.
- **Round Robin** — cada thread usa a CPU por um *quantum* (em palavras) e volta
  para o fim da fila. Com quantum 1 ele acompanha o rodízio da divisão das
  palavras e a frase sai na ordem certa, ao custo de mais trocas de contexto.

A seção 04 (**Escalonadores lado a lado**) roda os três com os mesmos atrasos
por palavra e mostra o diagrama de Gantt, a ordem de chegada e as métricas
clássicas: espera, resposta, retorno (*turnaround*) e trocas de contexto.

## Testes

```bash
python -m unittest
```

## Estrutura

| Arquivo | Descrição |
| --- | --- |
| `threads_core.py` | Lógica principal: divisão das palavras, execução das threads e escalonadores FCFS/Round Robin |
| `java/CanalDeRadio.java` | TP3: seção crítica sem e com semáforo, no terminal |
| `semaforos_core.py` | TP3: a mesma simulação do canal de rádio, usada pela página web |
| `servidor.py` | Servidor HTTP local que serve o playground web |
| `web/` | Interface do playground (`index.html` escalonador, `semaforos.html` TP3) |
| `threads_palavras.py` | Demonstração simples no terminal |
| `threads_visual.py` | Timeline no terminal com métrica de desordem |
| `test_threads_core.py` | Testes automatizados |
