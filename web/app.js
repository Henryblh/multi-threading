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
    gridButton: $("grid-button"), gridStatus: $("grid-status")
  };

  function cor(threadId) { return colors[threadId % colors.length]; }
  function escapeText(node, value) { node.textContent = value; }
  function config() {
    return {
      text: controls.text.value,
      threads: Number(controls.threads.value),
      delay_min_ms: Number(controls.min.value),
      delay_max_ms: Number(controls.max.value)
    };
  }
  function atualizarSaidas() {
    $("threads-output").textContent = controls.threads.value;
    if (Number(controls.min.value) > Number(controls.max.value)) controls.max.value = controls.min.value;
    $("min-output").textContent = controls.min.value + " ms";
    $("max-output").textContent = controls.max.value + " ms";
  }
  [controls.threads, controls.min, controls.max].forEach((input) => input.addEventListener("input", atualizarSaidas));

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
    ["metric-time", "metric-inversions", "metric-kendall"].forEach((id) => escapeText($(id), "—"));
    escapeText($("interpretacao"), "A primeira medição aparecerá ao final da rodada.");
  }

  function renderAlocacao(blocks, words) {
    const host = $("alocacao"); host.replaceChildren();
    blocks.forEach((indices, threadId) => {
      const item = document.createElement("div");
      item.className = "bloco"; item.style.setProperty("--cor", cor(threadId));
      const title = document.createElement("strong"); title.textContent = "T" + threadId;
      const text = document.createElement("span");
      text.textContent = indices.length ? "palavras " + (indices[0] + 1) + "–" + (indices[indices.length - 1] + 1) : "sem palavras";
      item.append(title, text); host.append(item);
    });
    const timeline = $("timeline"); timeline.replaceChildren();
    blocks.forEach((_, threadId) => {
      const lane = document.createElement("div"); lane.className = "raia";
      const label = document.createElement("div"); label.className = "raia-label"; label.style.setProperty("--cor", cor(threadId)); label.textContent = "T" + threadId;
      const track = document.createElement("div"); track.className = "trilha"; track.dataset.thread = threadId;
      lane.append(label, track); timeline.append(lane);
    });
    state.run = { words, maxTime: Math.max(1, Number(controls.max.value) * Math.ceil(words.length / Math.max(1, blocks.length))), events: [] };
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

  function redesenharTimeline() {
    if (!state.run) return;
    document.querySelectorAll(".trilha").forEach((track) => track.replaceChildren());
    state.run.events.forEach((event) => {
    const track = document.querySelector('.trilha[data-thread="' + event.thread_id + '"]');
    if (track) {
      const pulse = document.createElement("span");
      pulse.className = "pulso"; pulse.style.setProperty("--cor", cor(event.thread_id));
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
    if (summary.kendall === 0) return "A saída preservou a ordem. Com uma thread, isso é garantido.";
    if (summary.kendall < .2) return "Há poucas inversões: os blocos ainda aparecem quase agrupados.";
    if (summary.kendall < .45) return "O escalonador misturou blocos de maneira perceptível.";
    return "A chegada está bastante misturada — próxima do comportamento aleatório.";
  }

  function concluirRodada(summary) {
    escapeText($("metric-time"), summary.duration_ms.toFixed(1) + " ms");
    escapeText($("metric-inversions"), summary.inversions + " / " + summary.total_pairs);
    escapeText($("metric-kendall"), (summary.kendall * 100).toFixed(1) + "%");
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
        if (record.type === "allocation") renderAlocacao(record.blocks, record.config.text.split(/\s+/).filter(Boolean));
        if (record.type === "event") adicionarEvento(record);
        if (record.type === "summary") {
          record.events_count = record.order.length;
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
})();
