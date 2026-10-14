(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const colors = ["#1f91c8", "#fd5d42", "#7652c6", "#278560", "#ba6a15", "#ad3e78"];
  const cor = (threadId) => colors[threadId % colors.length];
  const controls = {
    messages: $("mensagens"), min: $("delay-min"), max: $("delay-max"),
    both: $("ambos-button"), sem: $("sem-button"), com: $("com-button"),
    cancel: $("cancel-button"), status: $("status"), conclusion: $("conclusao")
  };
  const paineis = { sem: $("painel-sem"), com: $("painel-com") };
  const state = { controller: null, runs: {}, frame: null };

  function mensagens() {
    return controls.messages.value.split("\n").map((linha) => linha.trim()).filter(Boolean);
  }
  function frequencias() {
    const marcado = document.querySelector('input[name="frequencias"]:checked');
    return marcado ? Number(marcado.value) : 1;
  }
  function atualizarSaidas() {
    if (Number(controls.min.value) > Number(controls.max.value)) controls.max.value = controls.min.value;
    $("min-output").textContent = controls.min.value + " ms";
    $("max-output").textContent = controls.max.value + " ms";
  }
  [controls.min, controls.max].forEach((input) => input.addEventListener("input", atualizarSaidas));

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function ms(valor) { return valor.toFixed(0) + " ms"; }

  // Estimativa da duração para a escala de tempo já começar razoável.
  function estimarDuracao(mode, lista, freq) {
    const media = (Number(controls.min.value) + Number(controls.max.value)) / 2 + 10;
    const palavras = lista.map((mensagem) => mensagem.split(/\s+/).length);
    if (mode === "sem") return media * Math.max(...palavras);
    return media * palavras.reduce((a, b) => a + b, 0) / freq;
  }

  function prepararPainel(mode, inicio) {
    const painel = paineis[mode];
    const run = {
      mode, painel, names: inicio.names, messages: inicio.messages, frequencies: inicio.frequencies,
      t0: performance.now(), lastEvent: 0, done: false, summary: null,
      estimate: estimarDuracao(mode, inicio.messages, inicio.frequencies),
      threads: inicio.messages.map(() => ({ wait: null, enter: null, leave: null, words: [] })),
      waiting: [], inside: new Map(), lanes: [], receivers: []
    };
    painel.querySelector(".canal-topo h3").textContent = mode === "sem"
      ? "Todos falam quando querem"
      : "new Semaphore(" + inicio.frequencies + ")";

    const timeline = painel.querySelector('[data-role="timeline"]'); timeline.replaceChildren();
    inicio.names.forEach((nome, threadId) => {
      const lane = el("div", "canal-raia");
      const label = el("span", "canal-rotulo", "T" + threadId + " " + nome);
      label.style.setProperty("--cor", cor(threadId));
      const track = el("div", "canal-trilha");
      const wait = el("span", "barra-espera"); wait.style.setProperty("--cor", cor(threadId));
      const talk = el("span", "barra-fala"); talk.style.setProperty("--cor", cor(threadId));
      track.append(wait, talk);
      lane.append(label, track); timeline.append(lane);
      run.lanes.push({ track, wait, talk, ticks: [] });
    });

    const receptor = painel.querySelector('[data-role="receptor"]'); receptor.replaceChildren();
    for (let f = 0; f < inicio.frequencies; f += 1) {
      const bloco = el("div", "receptor-bloco");
      bloco.append(el("p", "microtitulo", "RECEPTOR · FREQUÊNCIA " + (f + 1)));
      const linha = el("p", "receptor-linha");
      bloco.append(linha); receptor.append(bloco);
      run.receivers.push(linha);
    }
    painel.querySelector('[data-role="placar"]').replaceChildren();
    painel.classList.add("ativo");
    state.runs[mode] = run;
    renderEstado(run);
  }

  function renderEstado(run) {
    const host = run.painel.querySelector('[data-role="estado"]'); host.replaceChildren();
    const chip = (threadId, extra) => {
      const node = el("span", "chip", "T" + threadId + " " + run.names[threadId] + (extra || ""));
      node.style.setProperty("--cor", cor(threadId));
      return node;
    };
    const noAr = el("div", "estado-linha");
    noAr.append(el("span", "estado-rotulo", "no ar"));
    if (!run.inside.size) noAr.append(el("span", "estado-vazio", run.done ? "canal livre" : "ninguém"));
    run.inside.forEach((freq, threadId) => noAr.append(chip(threadId, run.frequencies > 1 ? " · f" + (freq + 1) : "")));

    if (run.mode === "sem") {
      const falando = run.inside.size;
      const alerta = el("div", "estado-linha");
      alerta.append(el("span", "estado-rotulo", "semáforo"));
      alerta.append(el("span", "estado-vazio", "nenhum, ninguém pede a vez"));
      host.append(alerta, noAr);
      if (falando > run.frequencies) {
        host.append(el("p", "colisao", falando + " operadores falando ao mesmo tempo em " + run.frequencies + " frequência(s): colisão!"));
      }
      return;
    }
    const lampadas = el("div", "estado-linha");
    lampadas.append(el("span", "estado-rotulo", "permissões"));
    const livres = run.frequencies - run.inside.size;
    for (let i = 0; i < run.frequencies; i += 1) {
      const lamp = el("span", "permissao" + (i < livres ? " livre" : ""));
      lamp.title = i < livres ? "permissão livre" : "permissão em uso";
      lampadas.append(lamp);
    }
    lampadas.append(el("span", "estado-vazio", livres + " livre(s) de " + run.frequencies));
    const fila = el("div", "estado-linha");
    fila.append(el("span", "estado-rotulo", "fila"));
    if (!run.waiting.length) fila.append(el("span", "estado-vazio", "vazia"));
    run.waiting.forEach((threadId) => fila.append(chip(threadId)));
    host.append(lampadas, noAr, fila);
  }

  function aplicarEvento(run, evento) {
    const fio = run.threads[evento.thread_id];
    run.lastEvent = Math.max(run.lastEvent, evento.tempo_ms);
    if (evento.kind === "wait") {
      fio.wait = evento.tempo_ms;
      run.waiting.push(evento.thread_id);
    }
    if (evento.kind === "enter") {
      fio.enter = evento.tempo_ms;
      run.waiting = run.waiting.filter((id) => id !== evento.thread_id);
      run.inside.set(evento.thread_id, evento.frequencia);
    }
    if (evento.kind === "word") {
      fio.words.push(evento.tempo_ms);
      const tick = el("span", "tique"); tick.style.setProperty("--cor", cor(evento.thread_id));
      tick.title = evento.palavra;
      run.lanes[evento.thread_id].track.append(tick);
      run.lanes[evento.thread_id].ticks.push({ node: tick, tempo: evento.tempo_ms });
      const palavra = el("span", "palavra-ouvida", evento.palavra);
      palavra.style.setProperty("--cor", cor(evento.thread_id));
      run.receivers[evento.frequencia].append(palavra, " ");
    }
    if (evento.kind === "leave") {
      fio.leave = evento.tempo_ms;
      run.inside.delete(evento.thread_id);
    }
    renderEstado(run);
  }

  // Escala comum aos dois painéis: o lado mais lento ocupa a largura toda.
  function escala() {
    const runs = Object.values(state.runs);
    return Math.max(1, ...runs.map((run) => run.done ? run.summary.duration_ms : Math.max(run.estimate, agora(run))));
  }
  function agora(run) {
    if (run.done) return run.summary.duration_ms;
    return Math.max(run.lastEvent, performance.now() - run.t0);
  }

  function desenhar() {
    const total = escala();
    const pos = (t) => (t / total) * 100;
    Object.values(state.runs).forEach((run) => {
      const fim = agora(run);
      run.threads.forEach((fio, threadId) => {
        const lane = run.lanes[threadId];
        const inicioEspera = fio.wait;
        const fimEspera = fio.enter !== null ? fio.enter : (inicioEspera !== null ? fim : null);
        if (inicioEspera !== null && fimEspera - inicioEspera > 0.5) {
          lane.wait.style.left = pos(inicioEspera) + "%";
          lane.wait.style.width = pos(fimEspera - inicioEspera) + "%";
          lane.wait.hidden = false;
        } else lane.wait.hidden = true;
        if (fio.enter !== null) {
          const fimFala = fio.leave !== null ? fio.leave : fim;
          lane.talk.style.left = pos(fio.enter) + "%";
          lane.talk.style.width = Math.max(0.3, pos(fimFala - fio.enter)) + "%";
          lane.talk.hidden = false;
        } else lane.talk.hidden = true;
        lane.ticks.forEach((tick) => { tick.node.style.left = pos(tick.tempo) + "%"; });
      });
    });
    const algumAtivo = Object.values(state.runs).some((run) => !run.done);
    state.frame = algumAtivo ? requestAnimationFrame(desenhar) : null;
  }
  function animar() { if (!state.frame) state.frame = requestAnimationFrame(desenhar); }

  function renderPlacar(run, summary) {
    const host = run.painel.querySelector('[data-role="placar"]'); host.replaceChildren();
    const metricas = el("dl", "metricas");
    const perdidas = summary.lost_updates;
    [
      ["mensagens íntegras", summary.intact + " de " + summary.messages.length, summary.intact === summary.messages.length],
      ["contador de palavras", summary.counter + " de " + summary.expected_counter + (perdidas ? " (" + perdidas + " perdidas)" : ""), perdidas === 0],
      ["tempo total", ms(summary.duration_ms), null],
      ["espera média no semáforo", run.mode === "sem" ? "não espera" : ms(summary.mean_wait_ms), null]
    ].forEach(([nome, valor, ok]) => {
      const linha = el("div");
      const dd = el("dd", ok === null ? "" : (ok ? "ok" : "erro"), valor);
      linha.append(el("dt", "", nome), dd); metricas.append(linha);
    });
    const lista = el("ul", "mensagens-status");
    summary.messages.forEach((mensagem) => {
      const item = el("li", mensagem.intact ? "ok" : "erro");
      item.style.setProperty("--cor", cor(mensagem.thread_id));
      const nome = el("strong", "", "T" + mensagem.thread_id + " " + mensagem.name);
      const estado = el("span", "", mensagem.intact
        ? "chegou inteira"
        : "quebrada por " + mensagem.interruptions + " palavra(s) de outros");
      item.append(nome, estado); lista.append(item);
    });
    host.append(metricas, lista);
  }

  function concluir() {
    const { sem, com } = state.runs;
    if (!sem || !com || !sem.summary || !com.summary) { controls.conclusion.hidden = true; return; }
    const a = sem.summary, b = com.summary;
    controls.conclusion.textContent = "Sem controle: " + a.intact + " de " + a.messages.length + " mensagens inteiras e "
      + a.lost_updates + " atualização(ões) do contador perdida(s). Com o semáforo: " + b.intact + " de " + b.messages.length
      + " inteiras e " + b.lost_updates + " perdida(s), mas a transmissão levou " + (b.duration_ms / Math.max(1, a.duration_ms)).toFixed(1)
      + "× mais tempo, porque os operadores esperam a vez (" + ms(b.mean_wait_ms) + " de espera média).";
    controls.conclusion.hidden = false;
  }

  async function consumirNDJSON(payload, onRecord, signal) {
    const response = await fetch("/api/critical-section", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal
    });
    if (!response.ok) {
      const erro = await response.json().catch(() => ({}));
      throw new Error(erro.error || "Não foi possível iniciar a transmissão.");
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

  function transmitir(mode, signal) {
    const payload = {
      mode, messages: mensagens(), frequencies: frequencias(),
      delay_min_ms: Number(controls.min.value), delay_max_ms: Number(controls.max.value)
    };
    return consumirNDJSON(payload, (record) => {
      if (record.type === "start") { prepararPainel(mode, record); animar(); }
      const run = state.runs[mode];
      if (record.type === "event" && run) aplicarEvento(run, record);
      if (record.type === "summary" && run) {
        run.summary = record; run.done = true; run.inside.clear(); run.waiting = [];
        renderEstado(run); renderPlacar(run, record); desenhar();
      }
      if (record.type === "error") throw new Error(record.error);
    }, signal);
  }

  async function iniciar(modos) {
    const lista = mensagens();
    if (lista.length < 2 || lista.length > 6) {
      controls.status.textContent = "Escreva de 2 a 6 mensagens, uma por linha.";
      return;
    }
    if (state.controller) state.controller.abort();
    const controller = new AbortController(); state.controller = controller;
    state.runs = {};
    controls.conclusion.hidden = true;
    Object.entries(paineis).forEach(([mode, painel]) => painel.classList.toggle("apagado", !modos.includes(mode)));
    [controls.both, controls.sem, controls.com].forEach((botao) => { botao.disabled = true; });
    controls.cancel.disabled = false;
    controls.status.textContent = modos.length > 1
      ? "Transmitindo nos dois canais ao mesmo tempo…"
      : "Transmitindo " + (modos[0] === "sem" ? "sem" : "com") + " controle…";
    try {
      await Promise.all(modos.map((mode) => transmitir(mode, controller.signal)));
      concluir();
      controls.status.textContent = "Transmissão encerrada. Confira o receptor e o placar de cada canal.";
    } catch (error) {
      controls.status.textContent = error.name === "AbortError" ? "Transmissão cancelada." : error.message;
    } finally {
      if (state.controller === controller) state.controller = null;
      [controls.both, controls.sem, controls.com].forEach((botao) => { botao.disabled = false; });
      controls.cancel.disabled = true;
      if (state.frame) { cancelAnimationFrame(state.frame); state.frame = null; }
    }
  }

  controls.both.addEventListener("click", () => iniciar(["sem", "com"]));
  controls.sem.addEventListener("click", () => iniciar(["sem"]));
  controls.com.addEventListener("click", () => iniciar(["com"]));
  controls.cancel.addEventListener("click", () => { if (state.controller) state.controller.abort(); });
  atualizarSaidas();
})();
