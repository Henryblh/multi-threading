(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const coresUsuarios = ["#1f91c8", "#fd5d42", "#7652c6", "#278560", "#ba6a15", "#485cce", "#ad3e78", "#566c33"];
  const LETRA = { DIGITAR: "D", LER: "L", ESCREVER: "E", GRAVAR: "G" };
  const ESTADO = { cpu: "na CPU", pronta: "pronta na fila", bloqueada: "bloqueada no semáforo", feita: "concluída", ausente: "ainda não chegou" };

  const estado = {
    mensagens: [
      { usuario: "Bruno", chegada: 0, texto: "alguem ai pode ajudar" },
      { usuario: "Ana", chegada: 1, texto: "calma bruno ja vou" },
      { usuario: "Carla", chegada: 2, texto: "servidor voltou agora" }
    ],
    controle: false, algoritmo: "rr", enviadas: [], resultado: null, max: 0, t: 0, timer: null, cores: new Map()
  };

  function el(tag, classe, texto) {
    const node = document.createElement(tag);
    if (classe) node.className = classe;
    if (texto !== undefined) node.textContent = texto;
    return node;
  }
  function palavras(texto) { return texto.trim().split(/\s+/).filter(Boolean); }
  function recalcularCores() {
    estado.cores = new Map();
    estado.mensagens.forEach((m) => {
      const nome = m.usuario.trim();
      if (nome && !estado.cores.has(nome)) estado.cores.set(nome, coresUsuarios[estado.cores.size % coresUsuarios.length]);
    });
  }
  function cor(usuario) { return estado.cores.get(usuario) || "#667077"; }
  function quem(id) {
    const m = estado.enviadas[id - 1];
    return m ? m.usuario + " #" + id : "#" + id;
  }
  function corDe(id) { const m = estado.enviadas[id - 1]; return m ? cor(m.usuario) : "#667077"; }
  async function postar(corpo) {
    const resposta = await fetch("/api/secao-critica", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.error || "Falha na requisição.");
    return dados;
  }
  function corpo(extra) {
    return {
      mensagens: estado.mensagens.map((m) => ({ usuario: m.usuario.trim(), chegada: Number(m.chegada), texto: m.texto })),
      algoritmo: estado.algoritmo, controle: estado.controle,
      quantum: Number($("quantum").value), id_inicial: Number($("id-inicial").value),
      ...extra
    };
  }

  // ---------- 01 · montar ----------
  function renderMensagens() {
    recalcularCores();
    const tbody = $("mensagens");
    tbody.replaceChildren();
    estado.mensagens.forEach((mensagem, indice) => {
      const linha = el("tr");
      const usuario = el("input", "usuario-campo");
      usuario.value = mensagem.usuario; usuario.maxLength = 24; usuario.setAttribute("aria-label", "Usuário " + (indice + 1));
      usuario.style.setProperty("--cor", cor(mensagem.usuario.trim()));
      usuario.addEventListener("change", () => { mensagem.usuario = usuario.value; renderMensagens(); });
      const chegada = el("input", "chegada-campo");
      chegada.type = "number"; chegada.min = 0; chegada.value = mensagem.chegada; chegada.setAttribute("aria-label", "Chegada " + (indice + 1));
      chegada.addEventListener("input", () => { mensagem.chegada = Number(chegada.value); });
      const texto = el("input");
      texto.value = mensagem.texto; texto.setAttribute("aria-label", "Mensagem " + (indice + 1));
      const passos = el("td", "burst");
      const atualizarPassos = () => {
        const n = palavras(texto.value).length;
        passos.textContent = `${n} fora + ${n + 2} na SC`;
        passos.title = `${n} para digitar (fora da seção crítica) e ${n + 2} para publicar (ler, ${n} escritas, gravar)`;
      };
      atualizarPassos();
      texto.addEventListener("input", () => { mensagem.texto = texto.value; atualizarPassos(); });
      const remover = el("button", "remover", "×");
      remover.type = "button"; remover.setAttribute("aria-label", "Remover " + (indice + 1));
      remover.disabled = estado.mensagens.length <= 2;
      remover.addEventListener("click", () => { estado.mensagens.splice(indice, 1); renderMensagens(); });
      const celula = (filho) => { const td = el("td"); td.append(filho); return td; };
      linha.append(el("td", null, String(indice + 1)), celula(usuario), celula(chegada), celula(texto), passos, celula(remover));
      tbody.append(linha);
    });
    $("adicionar").disabled = estado.mensagens.length >= 8;
  }
  $("adicionar").addEventListener("click", () => {
    const ultima = estado.mensagens[estado.mensagens.length - 1];
    estado.mensagens.push({ usuario: "Davi", chegada: ultima ? ultima.chegada + 1 : 0, texto: "to dentro" });
    renderMensagens();
  });

  function ligarAlternador(atributo, aplicar) {
    document.querySelectorAll(`[data-${atributo}]`).forEach((botao) => {
      botao.addEventListener("click", () => {
        document.querySelectorAll(`[data-${atributo}]`).forEach((b) => b.setAttribute("aria-pressed", String(b === botao)));
        aplicar(botao.dataset[atributo]);
      });
    });
  }
  ligarAlternador("controle", (valor) => { estado.controle = valor === "true"; });
  ligarAlternador("algoritmo", (valor) => { estado.algoritmo = valor; $("quantum").disabled = valor === "fcfs"; });
  $("quantum").addEventListener("input", () => {
    const q = Number($("quantum").value);
    $("quantum-output").textContent = q + (q === 1 ? " passo" : " passos");
  });

  async function executar() {
    $("executar").disabled = true;
    $("status").textContent = "Criando uma thread por mensagem…";
    try {
      const pedido = corpo();
      estado.enviadas = pedido.mensagens;
      recalcularCores();
      const dados = await postar(pedido);
      estado.resultado = dados;
      estado.max = dados.resumo.tempo_total;
      $("codigo").classList.toggle("sem-controle", !dados.controle);
      $("semaforo").classList.toggle("desligado", !dados.controle);
      $("tempo").max = estado.max;
      ["play", "voltar", "avancar", "tempo"].forEach((id) => { $(id).disabled = false; });
      $("status").textContent = `${dados.algoritmo === "rr" ? "Round Robin (quantum " + dados.quantum + ")" : "FCFS"} · ${dados.controle ? "com" : "sem"} semáforo · ${estado.max} ticks.`;
      renderLinha();
      renderConferencia();
      definirTempo(0);
      tocar();
      const combos = await renderMatriz(pedido);
      if (combos) renderDetalhes(combos.filter((c) => c.controle === pedido.controle));
    } catch (erro) {
      $("status").textContent = erro.message;
    } finally {
      $("executar").disabled = false;
    }
  }
  $("executar").addEventListener("click", executar);

  // ---------- 02 · passo a passo ----------
  function instanteEm(t, resultado = estado.resultado) {
    let achado = null;
    for (const inst of resultado.instantes) { if (inst.t <= t) achado = inst; }
    return achado;
  }

  function renderInstante() {
    const r = estado.resultado;
    const inst = instanteEm(estado.t);
    if (!inst) return;

    if (inst.tarefa) {
      $("agora").textContent = `t = ${inst.t} · ${quem(inst.tarefa)}: ${inst.detalhe}`;
    } else {
      $("agora").textContent = inst.t >= estado.max ? "Fim: todas as threads terminaram." : `t = ${inst.t} · CPU ociosa`;
    }

    document.querySelectorAll("#codigo span[data-passo]").forEach((linha) => {
      const ativo = inst.tarefa && linha.dataset.passo === inst.passo;
      linha.classList.toggle("ativo", Boolean(ativo));
      if (ativo) linha.style.setProperty("--cor", corDe(inst.tarefa));
    });

    const lista = $("threads");
    lista.replaceChildren();
    const lidos = Object.entries(inst.estados).filter(([, info]) => info.id_lido >= 0);
    Object.entries(inst.estados).forEach(([id, info]) => {
      const item = el("li");
      item.dataset.estado = info.estado;
      item.style.setProperty("--cor", corDe(Number(id)));
      const cabeca = el("header");
      cabeca.append(el("strong", null, quem(Number(id))));
      const etiqueta = el("span", "etiqueta", ESTADO[info.estado]);
      etiqueta.dataset.estado = info.estado;
      cabeca.append(etiqueta);
      const variavel = el("p", "var");
      variavel.append("variável local ");
      variavel.append(el("b", null, "id = " + (info.id_lido >= 0 ? info.id_lido : "?")));
      const mesmos = lidos.filter(([outro, o]) => outro !== id && info.id_lido >= 0 && o.id_lido === info.id_lido);
      if (mesmos.length) variavel.append(el("span", null, " ⚠ igual a " + mesmos.map(([outro]) => quem(Number(outro))).join(", ")));
      item.append(cabeca, variavel);
      lista.append(item);
    });

    const esperado = r.verificacao.proximo_id_esperado;
    $("proximo-id").textContent = inst.proximo_id;
    const fim = estado.t >= estado.max;
    $("proximo-esperado").textContent = `começou em ${r.id_inicial}; ao final deveria ser ${esperado}`;
    $("proximo-id").parentElement.classList.toggle("errado", fim && inst.proximo_id !== esperado);

    $("semaforo-valor").textContent = r.controle ? inst.semaforo.valor : "—";
    const fila = $("semaforo-fila");
    fila.replaceChildren();
    if (!r.controle) fila.textContent = "sem semáforo";
    else if (!inst.semaforo.bloqueados.length) fila.textContent = "ninguém";
    inst.semaforo.bloqueados.forEach((id) => {
      const chip = el("b", null, quem(id));
      chip.style.setProperty("--cor", corDe(id));
      fila.append(chip);
    });

    const historico = $("historico");
    historico.replaceChildren();
    if (!inst.historico.length) historico.append(el("li", "vazio-mini", "vazio"));
    inst.historico.forEach((slot) => {
      const item = el("li");
      const autores = [...new Set(slot.palavras.map((p) => p.autor).filter(Boolean))];
      item.classList.toggle("misturado", autores.length > 1);
      item.append(el("span", "slot-id", "#" + slot.id));
      const caixa = el("span", "palavras");
      slot.palavras.forEach((p) => {
        const palavra = el("span", null, p.palavra || "·");
        palavra.style.setProperty("--cor", cor(p.autor));
        palavra.title = p.autor;
        caixa.append(palavra);
      });
      item.append(caixa);
      if (autores.length > 1) item.append(el("span", "alerta", "⚠ palavras de " + autores.join(" e ") + " misturadas no mesmo id"));
      historico.append(item);
    });

    const log = $("log");
    log.replaceChildren();
    r.instantes.filter((i) => i.t <= estado.t).forEach((i) => {
      i.eventos.forEach((texto) => log.append(el("li", i === inst ? "recente" : null, texto)));
      if (i.tarefa) log.append(el("li", "tick" + (i === inst ? " recente" : ""), `t=${i.t} · ${quem(i.tarefa)}: ${i.detalhe}`));
    });
    log.scrollTop = log.scrollHeight;

    document.querySelectorAll("#linha .celula.atual").forEach((c) => c.classList.remove("atual"));
    document.querySelectorAll(`#linha .celula[data-t="${estado.t}"]`).forEach((c) => c.classList.add("atual"));
  }

  function definirTempo(t) {
    estado.t = Math.max(0, Math.min(estado.max, t));
    $("relogio").textContent = estado.t;
    $("tempo").value = estado.t;
    renderInstante();
  }
  function pausar() { clearInterval(estado.timer); estado.timer = null; $("play").textContent = "▶ Reproduzir"; }
  function tocar() {
    pausar();
    if (estado.t >= estado.max) definirTempo(0);
    $("play").textContent = "⏸ Pausar";
    estado.timer = setInterval(() => {
      if (estado.t >= estado.max) { pausar(); return; }
      definirTempo(estado.t + 1);
    }, Number($("velocidade").value));
  }
  $("play").addEventListener("click", () => (estado.timer ? pausar() : tocar()));
  $("voltar").addEventListener("click", () => { pausar(); definirTempo(estado.t - 1); });
  $("avancar").addEventListener("click", () => { pausar(); definirTempo(estado.t + 1); });
  $("velocidade").addEventListener("change", () => { if (estado.timer) tocar(); });
  $("tempo").addEventListener("input", () => { pausar(); definirTempo(Number($("tempo").value)); });

  // ---------- 03 · linha do tempo ----------
  function renderLinha() {
    $("linha").replaceChildren(montarLinha(estado.resultado));
  }

  function montarLinha(r) {
    const total = r.resumo.tempo_total;
    const grade = el("div", "linha");
    grade.style.gridTemplateColumns = `max-content repeat(${total}, 26px)`;
    grade.append(el("span", "rotulo", "tick"));
    for (let t = 0; t < total; t++) {
      const cabeca = el("span", "celula cabeca", String(t));
      cabeca.dataset.t = t;
      grade.append(cabeca);
    }
    const ultimo = r.instantes[r.instantes.length - 1];
    const ids = Object.keys(ultimo.estados).map(Number);
    const idFinal = Object.fromEntries(ids.map((id) => [id, ultimo.estados[id].id_lido]));
    ids.forEach((id) => {
      const rotulo = el("span", "rotulo", quem(id));
      rotulo.style.setProperty("--cor", corDe(id));
      grade.append(rotulo);
      for (let t = 0; t < total; t++) {
        const inst = instanteEm(t, r);
        const info = inst.estados[id];
        const celula = el("span", "celula");
        celula.dataset.t = t;
        celula.dataset.estado = info.estado;
        celula.style.setProperty("--cor", corDe(id));
        if (info.estado === "cpu") {
          celula.textContent = LETRA[inst.passo] || "";
          celula.dataset.fase = inst.passo === "DIGITAR" ? "fora" : "dentro";
          celula.title = `t=${t}: ${inst.detalhe}`;
          const colide = inst.passo === "LER" && ids.some((outro) => outro !== id && idFinal[outro] === idFinal[id]);
          if (colide) { celula.classList.add("colisao"); celula.title += " (outra thread leu o mesmo id)"; }
        } else if (info.estado === "bloqueada") {
          celula.textContent = "■";
          celula.title = `t=${t}: bloqueada no semáforo`;
        }
        grade.append(celula);
      }
    });
    return grade;
  }

  // ---------- 04 · conferência ----------
  function renderConferencia() {
    const r = estado.resultado, v = r.verificacao;
    const lista = $("conferencia");
    lista.replaceChildren();
    const item = (bom, texto) => { const li = el("li", bom ? "bom" : "ruim", texto); lista.append(li); };
    item(v.proximo_id_obtido === v.proximo_id_esperado,
      `proximoId terminou em ${v.proximo_id_obtido}; deveria ser ${v.proximo_id_esperado} (${r.id_inicial} + ${estado.enviadas.length} mensagens).`);
    if (v.duplicados.length) {
      v.duplicados.forEach((d) => item(false, `${d.tarefas.map(quem).join(", ")} leram o mesmo id ${d.id}.`));
    } else {
      item(true, "Cada mensagem recebeu um id diferente.");
    }
    v.slots.forEach((slot) => item(slot.integro,
      `#${slot.id}: "${slot.texto}"` + (slot.integro ? " (inteira)" : slot.autores.length > 1 ? ` (misturou ${slot.autores.join(" e ")})` : " (sobrescrita/incompleta)")));
    if (v.mensagens_com_problema.length) {
      item(false, `Não chegaram inteiras: ${v.mensagens_com_problema.map(quem).join(", ")}.`);
    }

    const selo = $("selo");
    selo.textContent = v.ok ? "ÍNTEGRO" : "CORROMPIDO";
    selo.classList.toggle("ruim", !v.ok);
    let texto;
    if (!v.ok) texto = "Condição de corrida: o escalonador trocou de thread no meio da seção crítica, e mais de uma thread leu o mesmo proximoId.";
    else if (r.controle) texto = `O semáforo garantiu o resultado: ${r.resumo.bloqueios} vez(es) uma thread tentou entrar e ficou bloqueada até o V() de quem estava dentro.`;
    else if (r.algoritmo === "fcfs") texto = "Deu certo, mas por sorte: o FCFS nunca interrompe uma thread. Troque para Round Robin.";
    else texto = "Deu certo, mas por sorte: nenhuma troca de thread caiu no meio de uma publicação. Mude o quantum ou as mensagens.";
    $("selo-texto").textContent = texto;
  }

  // ---------- 05 · matriz ----------
  async function renderMatriz(base) {
    const host = $("matriz");
    host.replaceChildren(el("p", "vazio", "Rodando as quatro combinações…"));
    try {
      const combos = [];
      for (const algoritmo of ["fcfs", "rr"]) {
        for (const controle of [false, true]) {
          combos.push({ algoritmo, controle, dados: await postar({ ...base, algoritmo, controle }) });
        }
      }
      host.replaceChildren();
      combos.forEach(({ algoritmo, controle, dados }) => {
        const v = dados.verificacao;
        const cartao = el("article", "cartao");
        cartao.dataset.ok = String(v.ok);
        cartao.dataset.sorte = String(v.ok && !controle);
        cartao.append(el("h3", null, `${algoritmo === "rr" ? "Round Robin (q=" + dados.quantum + ")" : "FCFS"} · ${controle ? "com" : "sem"} semáforo`));
        cartao.append(el("p", "resultado", v.ok ? (controle ? "ÍNTEGRO" : "ÍNTEGRO (por sorte)") : "CORROMPIDO"));
        const dl = el("dl");
        [["proximoId final", `${v.proximo_id_obtido} / ${v.proximo_id_esperado}`],
         ["ids duplicados", String(v.duplicados.length)],
         ["mensagens com problema", String(v.mensagens_com_problema.length)],
         ["bloqueios no semáforo", controle ? String(dados.resumo.bloqueios) : "—"],
         ["resposta média", dados.resumo.resposta_media.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " ticks"]
        ].forEach(([rotulo, valor]) => dl.append(el("dt", null, rotulo), el("dd", null, valor)));
        cartao.append(dl);
        const frase = !v.ok ? "Trocou de thread no meio da seção crítica."
          : !controle ? "Ninguém foi interrompido no meio. Não há proteção nenhuma aqui."
          : algoritmo === "rr" ? "Interrompido no meio, mas quem tentou entrar ficou bloqueado."
          : "Correto e protegido, mas sem rodízio: as respostas demoram mais.";
        cartao.append(el("p", null, frase));
        host.append(cartao);
      });
      return combos;
    } catch (erro) {
      host.replaceChildren(el("p", "vazio", erro.message));
      return null;
    }
  }

  // ---------- 06 · o escalonamento continua valendo ----------
  function num(valor, casas = 1) {
    return Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas });
  }
  function ordemPublicacao(dados) {
    return dados.verificacao.slots.map((slot) => slot.autores.join("+")).join(" → ");
  }

  function renderDetalhes(pares) {
    const nome = (c) => (c.algoritmo === "rr" ? `Round Robin (q=${c.dados.quantum})` : "FCFS");
    const protecao = pares[0].controle ? "com semáforo" : "sem semáforo";

    const linhas = $("detalhes-linhas");
    linhas.replaceChildren();
    pares.forEach((c) => {
      const bloco = el("div");
      const titulo = el("h3", null, `${nome(c)} · ${protecao}`);
      titulo.append(el("small", null, `tempo total ${c.dados.resumo.tempo_total} · ${c.dados.resumo.trocas} trocas · ${c.dados.verificacao.ok ? "íntegro" : "corrompido"}`));
      const caixa = el("div", "linha-wrap");
      caixa.append(montarLinha(c.dados));
      bloco.append(titulo, caixa);
      linhas.append(bloco);
    });

    const colunas = [
      ["resposta_media", 1], ["espera_media", 1], ["retorno_medio", 1],
      ["trocas", 0], ["bloqueios", 0], ["tempo_bloqueado", 0], ["tempo_total", 0]
    ];
    const melhores = Object.fromEntries(colunas.map(([chave]) => [chave, Math.min(...pares.map((c) => c.dados.resumo[chave]))]));
    const tbody = $("detalhes-placar");
    tbody.replaceChildren();
    pares.forEach((c) => {
      const linha = el("tr");
      linha.append(el("td", null, nome(c)));
      colunas.forEach(([chave, casas]) => {
        const valor = c.dados.resumo[chave];
        linha.append(el("td", Math.abs(valor - melhores[chave]) < 1e-9 ? "melhor" : null, num(valor, casas)));
      });
      linha.append(el("td", null, ordemPublicacao(c.dados)));
      tbody.append(linha);
    });

    const barras = $("detalhes-barras");
    barras.replaceChildren();
    [["resposta_media", "Resposta média"], ["retorno_medio", "Retorno médio"]].forEach(([chave, titulo]) => {
      const grupo = el("div", "barra-grupo");
      grupo.append(el("p", null, titulo));
      const maximo = Math.max(1, ...pares.map((c) => c.dados.resumo[chave]));
      pares.forEach((c) => {
        const valor = c.dados.resumo[chave];
        const linha = el("div", "barra" + (valor === melhores[chave] ? " vence" : ""));
        const trilho = el("span", "barra-trilho");
        const preenchido = el("span");
        preenchido.style.width = (valor / maximo * 100) + "%";
        trilho.append(preenchido);
        linha.append(el("span", null, nome(c)), trilho, el("b", null, num(valor)));
        grupo.append(linha);
      });
      barras.append(grupo);
    });

    const rr = pares.find((c) => c.algoritmo === "rr");
    const fcfs = pares.find((c) => c.algoritmo === "fcfs");
    const texto = $("detalhes-texto");
    texto.hidden = !(rr && fcfs);
    if (rr && fcfs) {
      const ganho = fcfs.dados.resumo.resposta_media - rr.dados.resumo.resposta_media;
      texto.textContent = pares[0].controle
        ? `Mesmo com semáforo, o Round Robin começa a atender cada mensagem ${num(ganho)} ticks antes, em média (${num(rr.dados.resumo.resposta_media)} contra ${num(fcfs.dados.resumo.resposta_media)}), porque a digitação fica fora da seção crítica e continua no rodízio. `
          + `O semáforo só age na publicação: ${rr.dados.resumo.bloqueios} bloqueio(s), somando ${rr.dados.resumo.tempo_bloqueado} ticks de espera. `
          + `A ordem de publicação também muda: ${ordemPublicacao(rr.dados)} no RR contra ${ordemPublicacao(fcfs.dados)} no FCFS.`
        : `Sem semáforo, o rodízio do Round Robin responde ${num(ganho)} ticks antes, mas ${rr.dados.verificacao.ok ? "desta vez nada corrompeu (sorte do quantum)" : "corrompe a publicação"}. Ligue o semáforo na seção 01 para manter o rodízio sem corromper.`;
    }
  }


  // ---------- 06 · curva ----------
  function prepararCanvas(canvas) {
    const razao = window.devicePixelRatio || 1;
    const caixa = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(caixa.width * razao));
    canvas.height = Math.max(1, Math.floor(caixa.height * razao));
    const ctx = canvas.getContext("2d");
    ctx.setTransform(razao, 0, 0, razao, 0, 0);
    return { ctx, largura: caixa.width, altura: caixa.height };
  }

  function desenharLinhas(canvasId, xs, series, maxY, casas) {
    const { ctx, largura, altura } = prepararCanvas($(canvasId));
    ctx.clearRect(0, 0, largura, altura);
    const pad = { left: 34, right: 14, top: 14, bottom: 26 };
    const x = (i) => pad.left + i / (xs.length - 1) * (largura - pad.left - pad.right);
    const y = (v) => altura - pad.bottom - v / maxY * (altura - pad.top - pad.bottom);
    ctx.font = "10px Courier New"; ctx.strokeStyle = "#d8d3c4"; ctx.fillStyle = "#667077"; ctx.lineWidth = 1;
    for (let linha = 0; linha <= 4; linha++) {
      const v = maxY * linha / 4;
      ctx.beginPath(); ctx.moveTo(pad.left, y(v)); ctx.lineTo(largura - pad.right, y(v)); ctx.stroke();
      ctx.fillText(v.toFixed(casas), 4, y(v) + 3);
    }
    series.forEach((serie) => {
      const d = serie.deslocamento || 0;
      ctx.save();
      ctx.strokeStyle = serie.cor; ctx.lineWidth = 2;
      if (serie.tracejado) ctx.setLineDash([6, 4]);
      ctx.beginPath();
      serie.valores.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v) + d) : ctx.moveTo(x(i), y(v) + d)));
      ctx.stroke();
      ctx.restore();
      if (!serie.tracejado) {
        ctx.fillStyle = serie.cor;
        serie.valores.forEach((v, i) => { ctx.beginPath(); ctx.arc(x(i), y(v) + d, 3.5, 0, Math.PI * 2); ctx.fill(); });
      }
    });
    ctx.fillStyle = "#172127"; ctx.textAlign = "center";
    xs.forEach((q, i) => ctx.fillText("q" + q, x(i), altura - 9));
    ctx.textAlign = "start";
  }

  async function varrer() {
    $("varrer").disabled = true;
    const quantums = Array.from({ length: 10 }, (_, i) => i + 1);
    try {
      const base = corpo({ algoritmo: "rr" });
      estado.enviadas = base.mensagens;
      recalcularCores();
      const series = [{ nome: "RR sem semáforo", cor: "#fd5d42", controle: false, problemas: [], resposta: [] },
                      { nome: "RR com semáforo", cor: "#278560", controle: true, problemas: [], resposta: [] }];
      for (const q of quantums) {
        $("varrer-status").textContent = `Quantum ${q}/10…`;
        for (const serie of series) {
          const dados = await postar({ ...base, quantum: q, controle: serie.controle });
          serie.problemas.push(dados.verificacao.mensagens_com_problema.length);
          serie.resposta.push(dados.resumo.resposta_media);
        }
      }
      const fcfs = await postar({ ...base, algoritmo: "fcfs", controle: true });
      const fcfsResposta = quantums.map(() => fcfs.resumo.resposta_media);

      desenharLinhas("grafico", quantums,
        series.map((s, i) => ({ cor: s.cor, valores: s.problemas, deslocamento: i ? 2 : -2 })),
        Math.ceil(Math.max(1, base.mensagens.length) / 4) * 4, 0);
      desenharLinhas("grafico-resposta", quantums, [
        { cor: "#ba6a15", valores: fcfsResposta, tracejado: true },
        ...series.map((s, i) => ({ cor: s.cor, valores: s.resposta, deslocamento: i ? 2 : -2 }))
      ], Math.max(1, ...fcfsResposta, ...series.flatMap((s) => s.resposta)) * 1.15, 1);

      const legenda = $("legenda-curva");
      legenda.replaceChildren();
      [...series, { nome: "FCFS (tracejado)", cor: "#ba6a15" }].forEach((serie) => {
        const item = el("span", null, serie.nome);
        item.style.setProperty("--cor", serie.cor);
        legenda.append(item);
      });
      const maiorThread = Math.max(...base.mensagens.map((m) => 2 * palavras(m.texto).length + 2));
      const primeiroLimpo = quantums.find((q, i) => series[0].problemas.slice(i).every((v) => v === 0));
      $("varrer-status").textContent = (primeiroLimpo
        ? `Sem semáforo, o erro só some a partir do quantum ${primeiroLimpo} (a maior thread tem ${maiorThread} passos), e aí o RR já quase não alterna.`
        : "Sem semáforo, o erro aparece em todos os quantums testados.")
        + " Com semáforo, nunca aparece, e a resposta do RR continua abaixo do FCFS.";
    } catch (erro) {
      $("varrer-status").textContent = erro.message;
    } finally {
      $("varrer").disabled = false;
    }
  }
  $("varrer").addEventListener("click", varrer);

  renderMensagens();
})();
