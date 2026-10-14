(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const colors = ["#1f91c8", "#fd5d42", "#7652c6", "#278560", "#ba6a15", "#485cce", "#ad3e78", "#566c33"];
  const state = { controller: null, run: null, comparison: null, grid: null };
  const controls = {
    text: $("texto"), threads: $("threads"), min: $("delay-min"), max: $("delay-max"),
    run: $("run-button"), cancel: $("cancel-button"), status: $("status"),
    compare: $("compare-button"), compareStatus: $("compare-status"), repetitions: $("repetitions"),
    gridLengths: $("grid-lengths"), gridRepetitions: $("grid-repetitions"),
    gridButton: $("grid-button"), gridStatus: $("grid-status"),
    reconText: $("recon-texto"), reconThreads: $("recon-threads"),
    reconButton: $("recon-button"), reconStatus: $("recon-status"),
    quantum: $("quantum"), schedulerHint: $("scheduler-hint"),
    schedulersButton: $("schedulers-button"), schedulersStatus: $("schedulers-status")
  };
  const nomesEscalonador = { livre: "Livre (SO)", fcfs: "FCFS", rr: "Round Robin" };
  const coresEscalonador = { livre: "#278560", fcfs: "#1f91c8", rr: "#fd5d42" };
  const dicasEscalonador = {
    livre: "Todas as threads correm juntas; o sistema operacional decide quem avança.",
    fcfs: "Uma CPU: T0 roda até acabar, depois T1, depois T2…",
    rr: "Uma CPU: cada thread roda um quantum e volta para o fim da fila."
  };

  function cor(threadId) { return colors[threadId % colors.length]; }
  function escapeText(node, value) { node.textContent = value; }
  function escalonadorAtual() {
    const marcado = document.querySelector('input[name="scheduler"]:checked');
    return marcado ? marcado.value : "livre";
  }
  function quantumAtual() {
    const valor = Number(controls.quantum.value);
    return Number.isInteger(valor) ? Math.min(20, Math.max(1, valor)) : 1;
  }
  function config() {
    return {
      text: controls.text.value,
      threads: Number(controls.threads.value),
      delay_min_ms: Number(controls.min.value),
      delay_max_ms: Number(controls.max.value),
      scheduler: escalonadorAtual(),
      quantum: quantumAtual()
    };
  }
  function atualizarSaidas() {
    $("threads-output").textContent = controls.threads.value;
    if (Number(controls.min.value) > Number(controls.max.value)) controls.max.value = controls.min.value;
    $("min-output").textContent = controls.min.value + " ms";
    $("max-output").textContent = controls.max.value + " ms";
    const escalonador = escalonadorAtual();
    controls.quantum.disabled = escalonador !== "rr";
    controls.schedulerHint.textContent = dicasEscalonador[escalonador];
  }
  [controls.threads, controls.min, controls.max, controls.quantum].forEach((input) => input.addEventListener("input", atualizarSaidas));
  document.querySelectorAll('input[name="scheduler"]').forEach((input) => input.addEventListener("change", atualizarSaidas));
  function ms(valor) { return valor === null || valor === undefined ? "—" : valor.toFixed(0) + " ms"; }

  function montarLoteEnderecado(texto) {
    return texto.trim().split(/\s+/).filter(Boolean)
      .map((palavra, indice) => "id1/palavra" + (indice + 1) + "/" + palavra)
      .join(" ");
  }
  function atualizarLoteEnderecado() {
    controls.reconText.value = montarLoteEnderecado(controls.text.value);
  }
  controls.text.addEventListener("input", atualizarLoteEnderecado);

  function criarContagens(hostId) {
    const host = $(hostId);
    [1, 2, 4, 8, 16, 32].forEach((count) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox"; input.value = count; input.checked = true;
      label.append(input, " " + count);
      host.append(label);
    });
  }

  function limparRodada() {
    $("alocacao").replaceChildren();
    $("timeline").replaceChildren();
    $("ordem-chegada").replaceChildren();
    escapeText($("frase-original"), controls.text.value.trim() || "—");
    escapeText($("frase-final"), "As palavras aparecerão aqui.");
    ["metric-time", "metric-inversions", "metric-kendall", "metric-wait", "metric-response", "metric-switches"].forEach((id) => escapeText($(id), "—"));
    escapeText($("interpretacao"), "A primeira medição aparecerá ao final da rodada.");
  }

  function renderAlocacao(blocks, words, scheduler) {
    const host = $("alocacao"); host.replaceChildren();
    blocks.forEach((indices, threadId) => {
      const item = document.createElement("div");
      item.className = "bloco"; item.style.setProperty("--cor", cor(threadId));
      const title = document.createElement("strong"); title.textContent = "T" + threadId;
      const text = document.createElement("span");
      const posicoes = indices.map((indice) => indice + 1);
      const rotulo = posicoes.length > 6
        ? posicoes.slice(0, 6).join(", ") + ", … (" + posicoes.length + " palavras)"
        : posicoes.join(", ");
      text.textContent = posicoes.length ? "palavras " + rotulo : "sem palavras";
      item.append(title, text); host.append(item);
    });
    const timeline = $("timeline"); timeline.replaceChildren();
    blocks.forEach((_, threadId) => {
      const lane = document.createElement("div"); lane.className = "raia";
      const label = document.createElement("div"); label.className = "raia-label"; label.style.setProperty("--cor", cor(threadId)); label.textContent = "T" + threadId;
      const track = document.createElement("div"); track.className = "trilha"; track.dataset.thread = threadId;
      lane.append(label, track); timeline.append(lane);
    });
    // Com um escalonador só uma thread trabalha por vez: o tempo total é a soma dos atrasos.
    const media = (Number(controls.min.value) + Number(controls.max.value)) / 2;
    const estimativa = scheduler === "livre"
      ? Number(controls.max.value) * Math.ceil(words.length / Math.max(1, blocks.length))
      : media * words.length;
    state.run = { words, scheduler, maxTime: Math.max(1, estimativa), events: [], slices: [], running: null };
  }

  function despachar(record) {
    if (!state.run) return;
    state.run.running = { thread_id: record.thread_id, inicio_ms: record.inicio_ms };
    redesenharTimeline();
  }

  function registrarFatia(record) {
    if (!state.run) return;
    state.run.slices.push(record);
    state.run.running = null;
    state.run.maxTime = Math.max(state.run.maxTime, record.fim_ms);
    redesenharTimeline();
  }

  function adicionarEvento(event) {
    if (!state.run) return;
    state.run.events.push(event);
    state.run.maxTime = Math.max(state.run.maxTime, event.tempo_ms);
    redesenharTimeline();
    const item = document.createElement("li");
    item.style.setProperty("--cor", cor(event.thread_id));
    item.textContent = (event.indice_original + 1) + " · " + event.palavra;
    $("ordem-chegada").append(item);
    escapeText($("frase-final"), state.run.events.map((entry) => entry.palavra).join(" "));
  }

  function barraFatia(fatia, fim, maxTime, cls) {
    const barra = document.createElement("span");
    barra.className = cls; barra.style.setProperty("--cor", cor(fatia.thread_id));
    barra.style.left = (fatia.inicio_ms / maxTime) * 98 + "%";
    barra.style.width = Math.max(0.4, ((fim - fatia.inicio_ms) / maxTime) * 98) + "%";
    barra.title = "T" + fatia.thread_id + " com a CPU: " + fatia.inicio_ms.toFixed(0) + "–" + fim.toFixed(0) + " ms";
    return barra;
  }

  function redesenharTimeline() {
    if (!state.run) return;
    document.querySelectorAll(".trilha").forEach((track) => track.replaceChildren());
    const fatias = state.run.slices.slice();
    if (state.run.running) {
      const ultimo = state.run.events.length ? state.run.events[state.run.events.length - 1].tempo_ms : 0;
      fatias.push(Object.assign({}, state.run.running, { fim_ms: Math.max(state.run.running.inicio_ms, ultimo), ativa: true }));
    }
    fatias.forEach((fatia) => {
      const track = document.querySelector('.trilha[data-thread="' + fatia.thread_id + '"]');
      if (track) track.append(barraFatia(fatia, fatia.fim_ms, state.run.maxTime, "fatia" + (fatia.ativa ? " ativa" : "")));
    });
    const jaAnimados = state.run.animados || 0;
    state.run.animados = state.run.events.length;
    state.run.events.forEach((event, posicao) => {
    const track = document.querySelector('.trilha[data-thread="' + event.thread_id + '"]');
    if (track) {
      const pulse = document.createElement("span");
      pulse.className = "pulso"; pulse.style.setProperty("--cor", cor(event.thread_id));
      if (posicao < jaAnimados) pulse.style.animation = "none";  // só palavras novas entram animadas
      pulse.style.left = Math.min(98, Math.max(1, (event.tempo_ms / state.run.maxTime) * 98)) + "%";
      pulse.title = "Palavra " + (event.indice_original + 1) + ": " + event.palavra;
      pulse.textContent = event.indice_original + 1;
      track.append(pulse);
    }
    });
  }

  function interpretar(summary) {
    if (summary.cancelled) return "A rodada foi cancelada antes de todas as palavras chegarem.";
    if (summary.order.length < 2) return "Há poucas palavras para observar inversões.";
    if (summary.scheduler === "fcfs") {
      const ultima = summary.thread_stats[summary.thread_stats.length - 1];
      return "FCFS: cada thread entregou o bloco inteiro antes da próxima entrar. A ordem é previsível, mas a frase sai agrupada por thread — e T"
        + ultima.thread_id + " esperou " + ultima.response_ms.toFixed(0) + " ms para começar.";
    }
    if (summary.scheduler === "rr" && summary.kendall === 0) {
      return "Round Robin com quantum " + summary.quantum + " acompanhou o rodízio da divisão: a frase saiu na ordem certa, ao custo de "
        + summary.context_switches + " trocas de contexto e de um tempo total serial.";
    }
    if (summary.scheduler === "rr") {
      return "Com quantum " + summary.quantum + ", cada thread entrega " + summary.quantum + " palavras seguidas antes de passar a vez: a frase sai em blocos. Use quantum 1 para recuperar a ordem.";
    }
    if (summary.kendall === 0) return "A saída preservou a ordem. Com uma thread, isso é garantido.";
    if (summary.kendall < .2) return "Há poucas inversões: os blocos ainda aparecem quase agrupados.";
    if (summary.kendall < .45) return "O escalonador misturou blocos de maneira perceptível.";
    return "A chegada está bastante misturada — próxima do comportamento aleatório.";
  }

  function concluirRodada(summary) {
    escapeText($("metric-time"), summary.duration_ms.toFixed(1) + " ms");
    escapeText($("metric-inversions"), summary.inversions + " / " + summary.total_pairs);
    escapeText($("metric-kendall"), (summary.kendall * 100).toFixed(1) + "%");
    escapeText($("metric-wait"), ms(summary.mean_wait_ms));
    escapeText($("metric-response"), ms(summary.mean_response_ms));
    escapeText($("metric-switches"), summary.context_switches === null ? "SO decide" : String(summary.context_switches));
    escapeText($("interpretacao"), interpretar(summary));
    controls.status.textContent = summary.cancelled ? "Rodada cancelada." : "Rodada concluída: " + summary.events_count + " palavras observadas.";
  }

  async function consumirNDJSON(url, payload, onRecord, signal) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal
    });
    if (!response.ok) {
      const erro = await response.json().catch(() => ({}));
      throw new Error(erro.error || "Não foi possível iniciar o experimento.");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      pending += decoder.decode(part.value, { stream: true });
      const lines = pending.split("\n"); pending = lines.pop();
      lines.filter(Boolean).forEach((line) => onRecord(JSON.parse(line)));
    }
    if (pending.trim()) onRecord(JSON.parse(pending));
  }

  async function iniciarRodada() {
    if (state.controller) state.controller.abort();
    limparRodada();
    const payload = config();
    const controller = new AbortController(); state.controller = controller;
    controls.run.disabled = true; controls.cancel.disabled = false;
    controls.status.textContent = "Criando threads e aguardando as primeiras conclusões…";
    try {
      await consumirNDJSON("/api/run", payload, (record) => {
        if (record.type === "allocation") renderAlocacao(record.blocks, record.config.text.split(/\s+/).filter(Boolean), record.config.scheduler);
        if (record.type === "event") adicionarEvento(record);
        if (record.type === "dispatch") despachar(record);
        if (record.type === "slice") registrarFatia(record);
        if (record.type === "summary") {
          record.events_count = record.order.length;
          if (state.run) {
            state.run.slices = record.slices; state.run.running = null;
            state.run.maxTime = Math.max(state.run.maxTime, record.duration_ms);
            redesenharTimeline();
          }
          concluirRodada(record);
        }
        if (record.type === "error") throw new Error(record.error);
      }, controller.signal);
    } catch (error) {
      if (error.name === "AbortError") controls.status.textContent = "Rodada cancelada.";
      else controls.status.textContent = error.message;
    } finally {
      if (state.controller === controller) state.controller = null;
      controls.run.disabled = false; controls.cancel.disabled = true;
    }
  }

  function prepararCanvas(canvas) {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    const context = canvas.getContext("2d");
    context.scale(ratio, ratio);
    return { context, width: rect.width, height: rect.height };
  }

  function desenharGrafico(canvasId, results, kind) {
    const canvas = $(canvasId);
    const { context: ctx, width, height } = prepararCanvas(canvas);
    ctx.clearRect(0, 0, width, height);
    if (!results || !results.length) return;
    const pad = { left: 42, right: 15, top: 15, bottom: 30 };
    const values = results.flatMap((item) => kind === "time" ? item.trials.map((trial) => trial.duration_ms) : item.trials.map((trial) => trial.kendall * 100));
    const maxY = Math.max(kind === "time" ? 1 : 10, ...values) * 1.12;
    const x = (i) => pad.left + (results.length === 1 ? (width - pad.left - pad.right) / 2 : i * (width - pad.left - pad.right) / (results.length - 1));
    const y = (value) => height - pad.bottom - (value / maxY) * (height - pad.top - pad.bottom);
    ctx.strokeStyle = "#d8d3c4"; ctx.lineWidth = 1;
    for (let line = 0; line <= 4; line += 1) {
      const yy = pad.top + line * (height - pad.top - pad.bottom) / 4;
      ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(width - pad.right, yy); ctx.stroke();
      ctx.fillStyle = "#667077"; ctx.font = "10px Courier New"; ctx.fillText((maxY * (4 - line) / 4).toFixed(kind === "time" ? 0 : 1), 2, yy + 3);
    }
    ctx.strokeStyle = kind === "time" ? "#1f91c8" : "#fd5d42"; ctx.lineWidth = 2;
    ctx.beginPath();
    results.forEach((item, index) => {
      const mean = kind === "time" ? item.mean_duration_ms : item.mean_kendall * 100;
      index ? ctx.lineTo(x(index), y(mean)) : ctx.moveTo(x(index), y(mean));
    });
    ctx.stroke();
    results.forEach((item, index) => {
      const trials = kind === "time" ? item.trials.map((trial) => trial.duration_ms) : item.trials.map((trial) => trial.kendall * 100);
      ctx.fillStyle = "#172127";
      trials.forEach((value, trialIndex) => {
        const offset = (trialIndex - (trials.length - 1) / 2) * 5;
        ctx.beginPath(); ctx.arc(x(index) + offset, y(value), 3, 0, Math.PI * 2); ctx.fill();
      });
      const mean = kind === "time" ? item.mean_duration_ms : item.mean_kendall * 100;
      ctx.fillStyle = kind === "time" ? "#1f91c8" : "#fd5d42";
      ctx.beginPath(); ctx.arc(x(index), y(mean), 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#172127"; ctx.font = "10px Courier New"; ctx.textAlign = "center";
      ctx.fillText(item.threads + "T", x(index), height - 10);
    });
    ctx.textAlign = "start";
  }

  function renderComparacao(results) {
    state.comparison = results;
    desenharGrafico("time-chart", results, "time");
    desenharGrafico("disorder-chart", results, "disorder");
    const body = $("comparison-table"); body.replaceChildren();
    results.forEach((item) => {
      const row = document.createElement("tr");
      const cells = [
        item.threads,
        item.mean_duration_ms.toFixed(1) + " ms",
        item.min_duration_ms.toFixed(1) + "–" + item.max_duration_ms.toFixed(1) + " ms",
        item.speedup.toFixed(2) + "×",
        (item.mean_kendall * 100).toFixed(1) + "%"
      ];
      cells.forEach((value) => { const cell = document.createElement("td"); cell.textContent = value; row.append(cell); });
      body.append(row);
    });
  }

  async function iniciarComparacao() {
    const counts = [...document.querySelectorAll("#thread-counts input:checked")].map((input) => Number(input.value)).sort((a, b) => a - b);
    if (!counts.includes(1)) {
      controls.compareStatus.textContent = "Inclua 1 thread: ela é a base do speedup.";
      return;
    }
    const repetitions = Number(controls.repetitions.value);
    if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10) {
      controls.compareStatus.textContent = "Escolha entre 1 e 10 repetições.";
      return;
    }
    if (state.controller) state.controller.abort();
    const payload = Object.assign(config(), { thread_counts: counts, repetitions });
    const controller = new AbortController(); state.controller = controller;
    controls.compare.disabled = true; controls.run.disabled = true; controls.cancel.disabled = false;
    controls.compareStatus.textContent = "Medindo 0 de " + (counts.length * repetitions) + " rodadas…";
    try {
      await consumirNDJSON("/api/compare", payload, (record) => {
        if (record.type === "progress") {
          controls.compareStatus.textContent = "Medindo " + record.done + " de " + record.total + " · " + record.threads + " threads, tentativa " + record.repetition + ".";
        }
        if (record.type === "comparison") {
          renderComparacao(record.results);
          controls.compareStatus.textContent = "Comparação concluída. Pontos mostram cada tentativa; círculos coloridos, as médias.";
        }
        if (record.type === "error") throw new Error(record.error);
      }, controller.signal);
    } catch (error) {
      controls.compareStatus.textContent = error.name === "AbortError" ? "Comparação cancelada." : error.message;
    } finally {
      if (state.controller === controller) state.controller = null;
      controls.compare.disabled = false; controls.run.disabled = false; controls.cancel.disabled = true;
    }
  }

  function desenharGrade(resultado) {
    state.grid = resultado;
    const { results, lengths, threads } = resultado;
    const canvas = $("grid-chart");
    const { context: ctx, width, height } = prepararCanvas(canvas);
    ctx.clearRect(0, 0, width, height);
    if (!results || !results.length) return;
    const pad = { left: 46, right: 15, top: 15, bottom: 30 };
    const maxY = Math.max(1, ...results.map((item) => item.mean_duration_ms)) * 1.12;
    const x = (i) => pad.left + (lengths.length === 1 ? (width - pad.left - pad.right) / 2 : i * (width - pad.left - pad.right) / (lengths.length - 1));
    const y = (value) => height - pad.bottom - (value / maxY) * (height - pad.top - pad.bottom);
    ctx.strokeStyle = "#d8d3c4"; ctx.lineWidth = 1;
    for (let line = 0; line <= 4; line += 1) {
      const yy = pad.top + line * (height - pad.top - pad.bottom) / 4;
      ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(width - pad.right, yy); ctx.stroke();
      ctx.fillStyle = "#667077"; ctx.font = "10px Courier New"; ctx.fillText((maxY * (4 - line) / 4).toFixed(0), 2, yy + 3);
    }
    threads.forEach((threadCount, serie) => {
      const pontos = lengths.map((comprimento) => {
        const item = results.find((r) => r.length === comprimento && r.threads === threadCount);
        return item ? item.mean_duration_ms : null;
      });
      ctx.strokeStyle = cor(serie); ctx.lineWidth = 2;
      ctx.beginPath();
      let comecou = false;
      pontos.forEach((valor, i) => {
        if (valor === null) return;
        if (!comecou) { ctx.moveTo(x(i), y(valor)); comecou = true; } else { ctx.lineTo(x(i), y(valor)); }
      });
      ctx.stroke();
      pontos.forEach((valor, i) => {
        if (valor === null) return;
        ctx.fillStyle = cor(serie);
        ctx.beginPath(); ctx.arc(x(i), y(valor), 3.5, 0, Math.PI * 2); ctx.fill();
      });
    });
    ctx.fillStyle = "#172127"; ctx.font = "10px Courier New"; ctx.textAlign = "center";
    lengths.forEach((comprimento, i) => ctx.fillText(comprimento + "p", x(i), height - 10));
    ctx.textAlign = "start";
  }

  function renderGridLegend(threads) {
    const host = $("grid-legend"); host.replaceChildren();
    threads.forEach((threadCount, index) => {
      const span = document.createElement("span");
      span.style.setProperty("--cor", cor(index));
      span.textContent = threadCount + " threads";
      host.append(span);
    });
  }

  async function iniciarGrade() {
    const comprimentos = controls.gridLengths.value.split(",")
      .map((valor) => Number(valor.trim()))
      .filter((valor) => Number.isInteger(valor) && valor > 0);
    if (!comprimentos.length) {
      controls.gridStatus.textContent = "Informe ao menos um comprimento válido, em palavras.";
      return;
    }
    const threadsSelecionadas = [...document.querySelectorAll("#grid-thread-counts input:checked")]
      .map((input) => Number(input.value)).sort((a, b) => a - b);
    if (!threadsSelecionadas.length) {
      controls.gridStatus.textContent = "Selecione ao menos uma quantidade de threads.";
      return;
    }
    const repeticoes = Number(controls.gridRepetitions.value);
    if (!Number.isInteger(repeticoes) || repeticoes < 1 || repeticoes > 10) {
      controls.gridStatus.textContent = "Escolha entre 1 e 10 repetições.";
      return;
    }
    if (state.controller) state.controller.abort();
    const payload = {
      lengths: comprimentos,
      threads: threadsSelecionadas,
      repetitions: repeticoes,
      delay_min_ms: Number(controls.min.value),
      delay_max_ms: Number(controls.max.value)
    };
    const controller = new AbortController(); state.controller = controller;
    controls.gridButton.disabled = true; controls.run.disabled = true; controls.compare.disabled = true; controls.cancel.disabled = false;
    const total = comprimentos.length * threadsSelecionadas.length * repeticoes;
    controls.gridStatus.textContent = "Medindo 0 de " + total + " rodadas…";
    try {
      await consumirNDJSON("/api/compare-grid", payload, (record) => {
        if (record.type === "progress") {
          controls.gridStatus.textContent = "Medindo " + record.done + " de " + record.total + " · "
            + record.length + " palavras, " + record.threads + " threads.";
        }
        if (record.type === "grid") {
          desenharGrade(record);
          renderGridLegend(record.threads);
          controls.gridStatus.textContent = "Comparação concluída. Cada cor é uma quantidade de threads.";
        }
        if (record.type === "error") throw new Error(record.error);
      }, controller.signal);
    } catch (error) {
      controls.gridStatus.textContent = error.name === "AbortError" ? "Comparação cancelada." : error.message;
    } finally {
      if (state.controller === controller) state.controller = null;
      controls.gridButton.disabled = false; controls.run.disabled = false; controls.compare.disabled = false; controls.cancel.disabled = true;
    }
  }

  function renderReconstrucao(dados) {
    const host = $("recon-resultado"); host.replaceChildren();
    const maxDur = Math.max(dados.single.duration_ms, dados.multi.duration_ms, 1);
    [dados.single, dados.multi].forEach((lado, indice) => {
      const card = document.createElement("div");
      card.className = "recon-card"; card.style.setProperty("--cor", cor(indice ? 1 : 3));
      const titulo = document.createElement("p");
      titulo.className = "microtitulo";
      titulo.textContent = lado.threads === 1 ? "1 THREAD · TUDO EM SÉRIE" : lado.threads + " THREADS · EM PARALELO";
      const tempo = document.createElement("p");
      tempo.className = "recon-tempo"; tempo.textContent = lado.duration_ms.toFixed(0) + " ms";
      const barra = document.createElement("div"); barra.className = "recon-barra";
      const fill = document.createElement("span");
      fill.style.width = Math.max(2, lado.duration_ms / maxDur * 100) + "%";
      barra.append(fill);
      const lista = document.createElement("ol"); lista.className = "recon-frases";
      Object.entries(lado.sentences).forEach(([id, frase]) => {
        const li = document.createElement("li");
        li.textContent = id + " → " + frase;
        lista.append(li);
      });
      card.append(titulo, tempo, barra, lista);
      host.append(card);
    });
    const resumo = document.createElement("p");
    resumo.className = "recon-resumo";
    const rapidez = dados.speedup >= 1.05
      ? dados.speedup.toFixed(2) + "× mais rápido com " + dados.multi.threads + " threads"
      : "sem ganho real com " + dados.multi.threads + " threads";
    resumo.textContent = (dados.match ? "Mesma mensagem remontada nos dois casos — " : "Atenção: remontagens diferentes — ")
      + rapidez + ". A ordem de chegada mudou, o conteúdo não.";
    host.append(resumo);
  }

  async function iniciarReconstrucao() {
    atualizarLoteEnderecado();
    const text = controls.reconText.value.trim();
    const threads = Number(controls.reconThreads.value);
    if (!text) { controls.reconStatus.textContent = "Escreva uma frase na seção 01."; return; }
    if (!Number.isInteger(threads) || threads < 2 || threads > 16) {
      controls.reconStatus.textContent = "Escolha entre 2 e 16 threads."; return;
    }
    if (state.controller) state.controller.abort();
    const controller = new AbortController(); state.controller = controller;
    const payload = { text, threads, delay_min_ms: Number(controls.min.value), delay_max_ms: Number(controls.max.value) };
    controls.reconButton.disabled = true; controls.run.disabled = true;
    controls.reconStatus.textContent = "Enviando os dois lotes e remontando…";
    try {
      const response = await fetch("/api/reconstruct", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload), signal: controller.signal
      });
      const dados = await response.json();
      if (!response.ok) throw new Error(dados.error || "Não foi possível remontar.");
      renderReconstrucao(dados);
      controls.reconStatus.textContent = "Pronto. Compare os tempos: mesmo trabalho, remontado pelas etiquetas.";
    } catch (error) {
      controls.reconStatus.textContent = error.name === "AbortError" ? "Cancelado." : error.message;
    } finally {
      if (state.controller === controller) state.controller = null;
      controls.reconButton.disabled = false; controls.run.disabled = false;
    }
  }

  function cartaoEscalonador(resultado, maxTime) {
    const card = document.createElement("article");
    card.className = "escalonador-card"; card.style.setProperty("--cor", coresEscalonador[resultado.scheduler]);
    const titulo = document.createElement("p"); titulo.className = "microtitulo";
    titulo.textContent = nomesEscalonador[resultado.scheduler].toUpperCase() + (resultado.scheduler === "rr" ? " · QUANTUM " + resultado.quantum : "");
    const tempo = document.createElement("p"); tempo.className = "recon-tempo"; tempo.textContent = resultado.duration_ms.toFixed(0) + " ms";

    const gantt = document.createElement("div"); gantt.className = "gantt";
    resultado.blocks.forEach((bloco, threadId) => {
      if (!bloco.length) return;
      const linha = document.createElement("div"); linha.className = "gantt-linha";
      const rotulo = document.createElement("span"); rotulo.className = "gantt-rotulo"; rotulo.textContent = "T" + threadId;
      rotulo.style.setProperty("--cor", cor(threadId));
      const trilha = document.createElement("div"); trilha.className = "gantt-trilha";
      resultado.slices.filter((fatia) => fatia.thread_id === threadId)
        .forEach((fatia) => trilha.append(barraFatia(fatia, fatia.fim_ms, maxTime, "gantt-fatia")));
      linha.append(rotulo, trilha); gantt.append(linha);
    });
    const eixo = document.createElement("p"); eixo.className = "gantt-eixo";
    const zero = document.createElement("span"); zero.textContent = "0 ms";
    const fim = document.createElement("span"); fim.textContent = maxTime.toFixed(0) + " ms";
    eixo.append(zero, fim);

    const chegada = document.createElement("ol"); chegada.className = "ordem-chegada compacta";
    resultado.events.forEach((evento) => {
      const item = document.createElement("li");
      item.style.setProperty("--cor", cor(evento.thread_id));
      item.textContent = (evento.indice_original + 1) + " · " + evento.palavra;
      chegada.append(item);
    });

    const metricas = document.createElement("dl"); metricas.className = "metricas";
    [
      ["desordem", (resultado.kendall * 100).toFixed(1) + "%"],
      ["espera média", ms(resultado.mean_wait_ms)],
      ["resposta média", ms(resultado.mean_response_ms)],
      ["retorno médio", ms(resultado.mean_turnaround_ms)],
      ["trocas de contexto", resultado.context_switches === null ? "SO decide" : String(resultado.context_switches)]
    ].forEach(([nome, valor]) => {
      const linha = document.createElement("div");
      const dt = document.createElement("dt"); dt.textContent = nome;
      const dd = document.createElement("dd"); dd.textContent = valor;
      linha.append(dt, dd); metricas.append(linha);
    });
    const frase = document.createElement("p"); frase.className = "frase"; frase.textContent = resultado.final_text;
    card.append(titulo, tempo, gantt, eixo, chegada, frase, metricas);
    return card;
  }

  function conclusaoEscalonadores(resultados) {
    const por = Object.fromEntries(resultados.map((item) => [item.scheduler, item]));
    const { livre, fcfs, rr } = por;
    if (!livre || !fcfs || !rr) return "";
    const partes = [];
    const serial = (fcfs.duration_ms + rr.duration_ms) / 2;
    partes.push("Livre terminou " + (serial / Math.max(1, livre.duration_ms)).toFixed(1) + "× mais rápido porque as threads trabalham em paralelo, mas embaralhou "
      + (livre.kendall * 100).toFixed(0) + "% dos pares.");
    partes.push("FCFS e Round Robin usam uma CPU só, então levam quase o mesmo tempo total (" + fcfs.duration_ms.toFixed(0) + " × " + rr.duration_ms.toFixed(0) + " ms).");
    partes.push("A diferença está em quem espera: no FCFS a resposta média foi " + ms(fcfs.mean_response_ms) + ", no Round Robin " + ms(rr.mean_response_ms) + ".");
    if (rr.kendall === 0) partes.push("Com quantum " + rr.quantum + " o Round Robin segue o rodízio da divisão e entrega a frase na ordem certa.");
    else if (fcfs.kendall > 0) partes.push("O FCFS entrega a frase agrupada por thread (desordem " + (fcfs.kendall * 100).toFixed(0) + "%).");
    return partes.join(" ");
  }

  function renderEscalonadores(resultados) {
    const host = $("schedulers-resultado"); host.replaceChildren();
    const maxTime = Math.max(1, ...resultados.map((item) => item.duration_ms));
    resultados.forEach((resultado) => host.append(cartaoEscalonador(resultado, maxTime)));
    const resumo = document.createElement("p"); resumo.className = "recon-resumo";
    resumo.textContent = conclusaoEscalonadores(resultados);
    host.append(resumo);
  }

  async function iniciarEscalonadores() {
    const payload = config();
    if (!payload.text.trim()) { controls.schedulersStatus.textContent = "Escreva uma frase na seção 01."; return; }
    if (state.controller) state.controller.abort();
    const controller = new AbortController(); state.controller = controller;
    controls.schedulersButton.disabled = true; controls.run.disabled = true; controls.cancel.disabled = false;
    controls.schedulersStatus.textContent = "Rodando os três escalonadores com os mesmos atrasos…";
    try {
      await consumirNDJSON("/api/compare-schedulers", payload, (record) => {
        if (record.type === "progress") {
          controls.schedulersStatus.textContent = "Rodando " + (record.done + 1) + " de " + record.total + " · " + nomesEscalonador[record.scheduler] + "…";
        }
        if (record.type === "schedulers") {
          renderEscalonadores(record.results);
          controls.schedulersStatus.textContent = "Pronto. Cada cor é uma thread; as barras mostram quando ela teve a CPU.";
        }
        if (record.type === "error") throw new Error(record.error);
      }, controller.signal);
    } catch (error) {
      controls.schedulersStatus.textContent = error.name === "AbortError" ? "Comparação cancelada." : error.message;
    } finally {
      if (state.controller === controller) state.controller = null;
      controls.schedulersButton.disabled = false; controls.run.disabled = false; controls.cancel.disabled = true;
    }
  }

  controls.schedulersButton.addEventListener("click", iniciarEscalonadores);
  controls.reconButton.addEventListener("click", iniciarReconstrucao);
  controls.run.addEventListener("click", iniciarRodada);
  controls.cancel.addEventListener("click", () => { if (state.controller) state.controller.abort(); });
  controls.compare.addEventListener("click", iniciarComparacao);
  controls.gridButton.addEventListener("click", iniciarGrade);
  window.addEventListener("resize", () => {
    if (state.comparison) renderComparacao(state.comparison);
    if (state.grid) desenharGrade(state.grid);
  });
  criarContagens("thread-counts");
  criarContagens("grid-thread-counts");
  atualizarSaidas();
  limparRodada();
  atualizarLoteEnderecado();
})();
