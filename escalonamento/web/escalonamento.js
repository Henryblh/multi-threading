(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const coresUsuarios = ["#1f91c8", "#fd5d42", "#7652c6", "#278560", "#ba6a15", "#485cce", "#ad3e78", "#566c33"];
  const ALGORITMOS = [
    { codigo: "fcfs", nome: "FCFS", sub: "First Come, First Served", cor: "#fd5d42" },
    { codigo: "sjf", nome: "SJF", sub: "Shortest Job First", cor: "#ba6a15" },
    { codigo: "rr", nome: "Round Robin", sub: "rodízio por mensagem", cor: "#1f91c8" },
    { codigo: "rr-usuario", nome: "RR por usuário", sub: "rodízio por pessoa", cor: "#278560" }
  ];
  const porCodigo = Object.fromEntries(ALGORITMOS.map((a) => [a.codigo, a]));

  const estado = {
    cenarios: [], cenario: null, editado: false, mensagens: [],
    resultados: [], max: 0, t: 0, timer: null, cores: new Map(), visoes: []
  };

  // ---------- utilidades ----------
  function el(tag, classe, texto) {
    const node = document.createElement(tag);
    if (classe) node.className = classe;
    if (texto !== undefined) node.textContent = texto;
    return node;
  }
  function num(valor, casas = 1) { return Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas }); }
  function palavras(texto) { return texto.trim().split(/\s+/).filter(Boolean); }
  function recalcularCores() {
    estado.cores = new Map();
    estado.mensagens.forEach((m) => {
      const nome = m.usuario.trim();
      if (nome && !estado.cores.has(nome)) estado.cores.set(nome, coresUsuarios[estado.cores.size % coresUsuarios.length]);
    });
  }
  function cor(usuario) { return estado.cores.get(usuario) || "#667077"; }
  async function postar(url, corpo) {
    const resposta = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.error || "Falha na requisição.");
    return dados;
  }

  // ---------- 01 · canal ----------
  function renderCenarios() {
    const host = $("cenarios");
    host.replaceChildren();
    estado.cenarios.forEach((cenario) => {
      const botao = el("button", "cenario", cenario.nome);
      botao.type = "button";
      botao.setAttribute("aria-pressed", String(estado.cenario === cenario && !estado.editado));
      botao.append(el("small", null, cenario.descricao));
      botao.addEventListener("click", () => carregarCenario(cenario, true));
      host.append(botao);
    });
  }

  function carregarCenario(cenario, escalonarDepois) {
    estado.cenario = cenario;
    estado.editado = false;
    estado.mensagens = cenario.mensagens.map((m) => ({ ...m }));
    $("cenario-destaque").textContent = cenario.descricao + " → " + cenario.destaque;
    renderCenarios();
    renderMensagens();
    if (escalonarDepois) escalonar();
  }

  function marcarEditado() {
    if (!estado.editado) {
      estado.editado = true;
      $("cenario-destaque").textContent = "Canal editado à mão. Escalone de novo para atualizar os resultados.";
      renderCenarios();
    }
  }

  function renderMensagens() {
    recalcularCores();
    const corpo = $("mensagens");
    corpo.replaceChildren();
    estado.mensagens.forEach((mensagem, indice) => {
      const linha = el("tr");
      const usuario = el("input", "usuario-campo");
      usuario.value = mensagem.usuario; usuario.maxLength = 24; usuario.setAttribute("aria-label", "Usuário da mensagem " + (indice + 1));
      usuario.style.setProperty("--cor", cor(mensagem.usuario.trim()));
      usuario.addEventListener("change", () => { mensagem.usuario = usuario.value; marcarEditado(); renderMensagens(); });
      const chegada = el("input", "chegada-campo");
      chegada.type = "number"; chegada.min = 0; chegada.max = 1000; chegada.value = mensagem.chegada;
      chegada.setAttribute("aria-label", "Chegada da mensagem " + (indice + 1));
      chegada.addEventListener("input", () => { mensagem.chegada = Number(chegada.value); marcarEditado(); });
      const texto = el("input");
      texto.value = mensagem.texto; texto.setAttribute("aria-label", "Texto da mensagem " + (indice + 1));
      const burst = el("td", "burst", palavras(mensagem.texto).length + "p");
      texto.addEventListener("input", () => { mensagem.texto = texto.value; burst.textContent = palavras(texto.value).length + "p"; marcarEditado(); });
      const remover = el("button", "remover", "×");
      remover.type = "button"; remover.setAttribute("aria-label", "Remover mensagem " + (indice + 1));
      remover.disabled = estado.mensagens.length === 1;
      remover.addEventListener("click", () => { estado.mensagens.splice(indice, 1); marcarEditado(); renderMensagens(); });
      [el("td", null, String(indice + 1)), usuario, chegada, texto].forEach((item, i) => {
        if (i === 0) { linha.append(item); return; }
        const celula = el("td"); celula.append(item); linha.append(celula);
      });
      const celulaRemover = el("td"); celulaRemover.append(remover);
      linha.append(burst, celulaRemover);
      corpo.append(linha);
    });
  }

  $("adicionar").addEventListener("click", () => {
    const ultima = estado.mensagens[estado.mensagens.length - 1];
    estado.mensagens.push({ usuario: "Eva", chegada: ultima ? ultima.chegada + 1 : 0, texto: "nova mensagem no canal" });
    marcarEditado();
    renderMensagens();
  });

  function renderAlgoritmos() {
    const host = $("algoritmos");
    ALGORITMOS.forEach((algoritmo) => {
      const rotulo = el("label");
      const caixa = el("input");
      caixa.type = "checkbox"; caixa.value = algoritmo.codigo; caixa.checked = true;
      rotulo.append(caixa, " " + algoritmo.nome);
      host.append(rotulo);
    });
  }
  function algoritmosEscolhidos() {
    return [...$("algoritmos").querySelectorAll("input:checked")].map((caixa) => caixa.value);
  }

  function atualizarSaidas() {
    const q = Number($("quantum").value), c = Number($("custo").value);
    $("quantum-output").textContent = q + (q === 1 ? " palavra" : " palavras");
    $("custo-output").textContent = c + (c === 1 ? " tick" : " ticks");
  }
  $("quantum").addEventListener("input", atualizarSaidas);
  $("custo").addEventListener("input", atualizarSaidas);

  function corpoRequisicao(extra) {
    return {
      mensagens: estado.mensagens.map((m) => ({ usuario: m.usuario, chegada: Number(m.chegada), texto: m.texto })),
      quantum: Number($("quantum").value),
      custo_troca: Number($("custo").value),
      ...extra
    };
  }

  async function escalonar() {
    const algoritmos = algoritmosEscolhidos();
    if (!algoritmos.length) { $("status").textContent = "Escolha pelo menos um algoritmo."; return; }
    $("escalonar").disabled = true;
    $("status").textContent = "Criando uma thread por mensagem e escalonando…";
    try {
      const dados = await postar("/api/escalonar", corpoRequisicao({ algoritmos }));
      recalcularCores();
      estado.resultados = dados.resultados;
      estado.max = Math.max(...dados.resultados.map((r) => r.resumo.tempo_total));
      const totalMsgs = dados.resultados[0].tarefas.length;
      $("status").textContent = `${totalMsgs} threads por algoritmo · quantum ${dados.quantum} · troca ${dados.custo_troca} tick(s). Reproduzindo ↓`;
      prepararVisoes();
      renderChats();
      renderGantts();
      renderPlacar();
      renderVeredito();
      definirTempo(0);
      $("play").disabled = $("reiniciar").disabled = $("tempo").disabled = false;
      $("tempo").max = estado.max;
      tocar();
    } catch (erro) {
      $("status").textContent = erro.message;
    } finally {
      $("escalonar").disabled = false;
    }
  }
  $("escalonar").addEventListener("click", escalonar);

  // ---------- linha do tempo derivada ----------
  function prepararVisoes() {
    estado.visoes = estado.resultados.map((resultado) => {
      const tarefas = resultado.tarefas.map((tarefa) => {
        const fatias = resultado.fatias.filter((f) => f.tarefa === tarefa.tarefa);
        return { ...tarefa, fatias, palavras: fatias.flatMap((f) => f.palavras) };
      }).sort((a, b) => a.chegada - b.chegada || a.tarefa - b.tarefa);
      return { resultado, tarefas };
    });
  }
  function progresso(tarefa, t) {
    return tarefa.fatias.reduce((soma, f) => soma + Math.max(0, Math.min(t, f.fim) - f.inicio), 0);
  }
  function cpuEm(resultado, t) {
    const fatia = resultado.fatias.find((f) => f.inicio <= t && t < f.fim);
    if (fatia) return { tipo: "fatia", fatia };
    if (resultado.trocas.some((tr) => tr.inicio <= t && t < tr.fim)) return { tipo: "troca" };
    return { tipo: t >= resultado.resumo.tempo_total ? "fim" : "ociosa" };
  }

  // ---------- 02 · chat ao vivo ----------
  function renderChats() {
    const host = $("chats");
    host.replaceChildren();
    estado.visoes.forEach((visao) => {
      const info = porCodigo[visao.resultado.algoritmo];
      const coluna = el("article", "chat");
      const topo = el("header", "chat-topo");
      topo.append(el("h3", null, info.nome));
      const cpu = el("p", "cpu");
      topo.append(cpu);
      const log = el("ol", "chat-log");
      log.setAttribute("aria-label", "Mensagens no " + info.nome);
      const rodape = el("footer", "chat-rodape");
      rodape.append(el("span", null, "resposta média " + num(visao.resultado.resumo.resposta_media)),
        el("span", null, visao.resultado.resumo.trocas + " trocas"));
      coluna.append(topo, log, rodape);
      host.append(coluna);

      visao.cpu = cpu;
      visao.log = log;
      visao.tarefas.forEach((tarefa) => {
        const bolha = el("li", "bolha");
        bolha.style.setProperty("--cor", cor(tarefa.usuario));
        const cabecalho = el("header");
        cabecalho.append(el("strong", null, tarefa.usuario + " · #" + tarefa.tarefa));
        const situacao = el("span", "estado");
        cabecalho.append(situacao);
        const texto = el("p", "texto");
        texto.style.margin = "0";
        bolha.append(cabecalho, texto);
        bolha.hidden = true;
        log.append(bolha);
        tarefa.dom = { bolha, situacao, texto };
      });
    });
  }

  function atualizarChats(t) {
    estado.visoes.forEach((visao) => {
      const agora = cpuEm(visao.resultado, t);
      visao.cpu.replaceChildren();
      visao.cpu.append("CPU →");
      if (agora.tipo === "fatia") {
        const b = el("b", null, agora.fatia.usuario + " #" + agora.fatia.tarefa);
        b.style.setProperty("--cor", cor(agora.fatia.usuario));
        visao.cpu.append(b, el("span", null, "thread " + agora.fatia.thread));
      } else if (agora.tipo === "troca") {
        visao.cpu.append(el("b", "troca", "troca de contexto"));
      } else {
        visao.cpu.append(el("span", null, agora.tipo === "fim" ? "✓ tudo entregue" : "ociosa"));
      }

      let apareceuNova = false;
      visao.tarefas.forEach((tarefa) => {
        const { bolha, situacao, texto } = tarefa.dom;
        const visivel = t >= tarefa.chegada;
        if (visivel && bolha.hidden) apareceuNova = true;
        bolha.hidden = !visivel;
        if (!visivel) return;
        const feitas = progresso(tarefa, t);
        const rodando = agora.tipo === "fatia" && agora.fatia.tarefa === tarefa.tarefa;
        let situacaoTexto, estadoBolha;
        if (feitas >= tarefa.burst) { estadoBolha = "feita"; situacaoTexto = "✓ t=" + tarefa.termino; }
        else if (rodando) { estadoBolha = "rodando"; situacaoTexto = "digitando " + feitas + "/" + tarefa.burst; }
        else if (feitas > 0) { estadoBolha = "pausada"; situacaoTexto = "pausada " + feitas + "/" + tarefa.burst; }
        else { estadoBolha = "fila"; situacaoTexto = "na fila há " + (t - tarefa.chegada); }
        bolha.dataset.estado = estadoBolha;
        situacao.textContent = situacaoTexto;
        texto.textContent = feitas > 0 ? tarefa.palavras.slice(0, feitas).join(" ") : "aguardando CPU…";
      });
      if (apareceuNova) visao.log.scrollTop = visao.log.scrollHeight;
    });
  }

  // ---------- player ----------
  function definirTempo(t) {
    estado.t = Math.max(0, Math.min(estado.max, t));
    $("relogio").textContent = estado.t;
    $("tempo").value = estado.t;
    atualizarChats(estado.t);
    document.querySelectorAll(".g-cursor").forEach((cursor) => { cursor.style.left = (estado.t / estado.max * 100) + "%"; });
  }
  function pausar() {
    clearInterval(estado.timer);
    estado.timer = null;
    $("play").textContent = "▶ Reproduzir";
  }
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
  $("reiniciar").addEventListener("click", () => { definirTempo(0); tocar(); });
  $("velocidade").addEventListener("change", () => { if (estado.timer) tocar(); });
  $("tempo").addEventListener("input", () => { pausar(); definirTempo(Number($("tempo").value)); });

  // ---------- 03 · Gantt ----------
  function posicao(inicio, fim) {
    return { left: (inicio / estado.max * 100) + "%", width: ((fim - inicio) / estado.max * 100) + "%" };
  }
  function bloco(classe, inicio, fim, corBloco, titulo) {
    const node = el("span", classe);
    Object.assign(node.style, posicao(inicio, fim));
    if (corBloco) node.style.setProperty("--cor", corBloco);
    if (titulo) node.title = titulo;
    return node;
  }
  function linhaGantt(rotulo, corRotulo, filhos, classe) {
    const linha = el("div", "g-linha" + (classe ? " " + classe : ""));
    const nome = el("span", "g-rotulo", rotulo);
    if (corRotulo) nome.style.setProperty("--cor", corRotulo);
    const trilha = el("div", "g-trilha");
    trilha.append(...filhos);
    linha.append(nome, trilha);
    return linha;
  }

  function renderGantts() {
    const host = $("gantts");
    host.replaceChildren();
    const passo = estado.max > 80 ? 10 : 5;
    estado.visoes.forEach((visao) => {
      const r = visao.resultado;
      const caixa = el("article", "gantt");
      const titulo = el("h3", null, porCodigo[r.algoritmo].nome);
      titulo.append(el("small", null, `tempo total ${r.resumo.tempo_total} · ${r.resumo.trocas} trocas`));
      const corpo = el("div", "gantt-corpo");
      const grade = el("div", "gantt-grade");
      grade.style.setProperty("--tick", (100 / estado.max) + "%");

      grade.append(linhaGantt("CPU · trocas", null,
        r.trocas.map((tr) => bloco("g-troca", tr.inicio, Math.max(tr.fim, tr.inicio + 0.25), null,
          `troca #${tr.de} → #${tr.para} em t=${tr.inicio}`)), "cpu-linha"));

      [...visao.tarefas].sort((a, b) => a.tarefa - b.tarefa).forEach((tarefa) => {
        const c = cor(tarefa.usuario);
        const filhos = [bloco("g-espera", tarefa.chegada, tarefa.termino, c,
          `#${tarefa.tarefa} ${tarefa.usuario}: chegou em ${tarefa.chegada}, terminou em ${tarefa.termino}, esperou ${tarefa.espera}`)];
        tarefa.fatias.forEach((f) => filhos.push(bloco("g-fatia", f.inicio, f.fim, c,
          `${f.usuario} #${f.tarefa}: t=${f.inicio}→${f.fim} · "${f.palavras.join(" ")}"`)));
        grade.append(linhaGantt(`#${tarefa.tarefa} ${tarefa.usuario}`, c, filhos));
      });

      const marcas = [];
      for (let t = 0; t <= estado.max; t += passo) {
        const marca = el("span", null, String(t));
        marca.style.left = (t / estado.max * 100) + "%";
        marcas.push(marca);
      }
      grade.append(linhaGantt("tick", null, marcas, "g-eixo"));

      const trilhaCursor = el("div", "gantt-cursor-trilha");
      trilhaCursor.append(el("span", "g-cursor"));
      grade.append(trilhaCursor);
      corpo.append(grade);
      caixa.append(titulo, corpo);
      host.append(caixa);
    });
  }

  // ---------- 04 · placar e veredito ----------
  const METRICAS = [
    { chave: "resposta_media", casas: 1 },
    { chave: "resposta_por_pessoa", casas: 1 },
    { chave: "pior_resposta", casas: 0 },
    { chave: "espera_media", casas: 1 },
    { chave: "retorno_medio", casas: 1 },
    { chave: "trocas", casas: 0 },
    { chave: "tempo_total", casas: 0 }
  ];

  function renderPlacar() {
    const corpo = $("placar");
    corpo.replaceChildren();
    const melhores = Object.fromEntries(METRICAS.map((m) =>
      [m.chave, Math.min(...estado.resultados.map((r) => r.resumo[m.chave]))]));
    estado.resultados.forEach((r) => {
      const linha = el("tr");
      linha.append(el("td", null, porCodigo[r.algoritmo].nome));
      METRICAS.forEach((m) => {
        const valor = r.resumo[m.chave];
        const celula = el("td", estado.resultados.length > 1 && Math.abs(valor - melhores[m.chave]) < 1e-9 ? "melhor" : null, num(valor, m.casas));
        linha.append(celula);
      });
      corpo.append(linha);
    });

    const barras = $("barras");
    barras.replaceChildren();
    [["resposta_media", "Resposta média", "quanto demora para começar a aparecer"],
     ["pior_resposta", "Pior resposta", "quem ficou mais tempo sem ver nada"]].forEach(([chave, titulo]) => {
      const grupo = el("div", "barra-grupo");
      grupo.append(el("p", null, titulo));
      const maximo = Math.max(1, ...estado.resultados.map((r) => r.resumo[chave]));
      estado.resultados.forEach((r) => {
        const valor = r.resumo[chave];
        const linha = el("div", "barra" + (valor === melhores[chave] ? " vence" : ""));
        const trilho = el("span", "barra-trilho");
        const preenchido = el("span");
        preenchido.style.width = (valor / maximo * 100) + "%";
        trilho.append(preenchido);
        linha.append(el("span", null, porCodigo[r.algoritmo].nome), trilho, el("b", null, num(valor, chave === "pior_resposta" ? 0 : 1)));
        grupo.append(linha);
      });
      barras.append(grupo);
    });
  }

  function itemVeredito(partes) {
    const item = el("li");
    partes.forEach((parte) => item.append(typeof parte === "string" ? parte : el("strong", null, parte.forte)));
    return item;
  }

  function renderVeredito() {
    const lista = $("veredito");
    lista.replaceChildren();
    const rs = estado.resultados;
    const nome = (r) => porCodigo[r.algoritmo].nome;
    const ordenar = (chave) => [...rs].sort((a, b) => a.resumo[chave] - b.resumo[chave]);

    if (estado.cenario && !estado.editado) lista.append(itemVeredito([estado.cenario.destaque]));
    if (rs.length < 2) {
      lista.append(itemVeredito(["Escolha mais de um algoritmo para comparar."]));
      return;
    }

    const porResposta = ordenar("resposta_media");
    const melhor = porResposta[0], pior = porResposta[porResposta.length - 1];
    const fator = melhor.resumo.resposta_media > 0 ? pior.resumo.resposta_media / melhor.resumo.resposta_media : null;
    lista.append(itemVeredito([{ forte: nome(melhor) }, ` faz a primeira palavra aparecer em ${num(melhor.resumo.resposta_media)} ticks, em média. `,
      { forte: nome(pior) }, ` leva ${num(pior.resumo.resposta_media)}` + (fator && fator >= 1.2 ? ` (${num(fator)}× mais lento).` : ".")]));

    const porPior = ordenar("pior_resposta");
    const injusto = porPior[porPior.length - 1];
    const vitima = [...injusto.tarefas].sort((a, b) => b.resposta - a.resposta)[0];
    if (vitima && vitima.resposta > 0) {
      lista.append(itemVeredito(["Quem mais esperou para começar: ", { forte: `${vitima.usuario} #${vitima.tarefa}` },
        ` no ${nome(injusto)}, ${vitima.resposta} ticks sem ver nenhuma palavra` +
        (injusto.algoritmo === "sjf" ? ". É a cara da starvation."
          : injusto.algoritmo === "fcfs" ? ". É o efeito comboio."
          : injusto.algoritmo === "rr-usuario" && injusto.tarefas.filter((t) => t.usuario === vitima.usuario).length > 1
            ? `. Foi de propósito: ${vitima.usuario} mandou várias mensagens, e o rodízio por pessoa o põe no fim da fila.` : ".")]));
    }

    const porRetorno = ordenar("retorno_medio");
    const rr = rs.find((r) => r.algoritmo === "rr");
    if (rr && porRetorno[0] !== rr && porRetorno[0].algoritmo !== "rr-usuario") {
      lista.append(itemVeredito(["Para terminar tudo mais cedo (retorno médio), quem vence é ", { forte: nome(porRetorno[0]) },
        ` com ${num(porRetorno[0].resumo.retorno_medio)} contra ${num(rr.resumo.retorno_medio)} do RR. Esse é o preço do rodízio.`]));
    } else {
      lista.append(itemVeredito(["Menor retorno médio: ", { forte: nome(porRetorno[0]) }, ` (${num(porRetorno[0].resumo.retorno_medio)} ticks).`]));
    }

    const fcfs = rs.find((r) => r.algoritmo === "fcfs");
    const custo = Number($("custo").value);
    if (rr && fcfs && rr.resumo.trocas > fcfs.resumo.trocas) {
      lista.append(itemVeredito(["O RR fez ", { forte: String(rr.resumo.trocas) }, ` trocas de contexto contra ${fcfs.resumo.trocas} do FCFS` +
        (custo ? `: ${(rr.resumo.trocas - fcfs.resumo.trocas) * custo} ticks a mais só trocando de mensagem.` : ".")]));
    }

    const rrUsuario = rs.find((r) => r.algoritmo === "rr-usuario");
    const porPessoa = ordenar("resposta_por_pessoa");
    if (porPessoa[0].resumo.resposta_por_pessoa < porResposta[0].resumo.resposta_por_pessoa - 1e-9) {
      lista.append(itemVeredito(["Contando cada ", { forte: "pessoa" }, " uma vez, o melhor é ", { forte: nome(porPessoa[0]) },
        `: ${num(porPessoa[0].resumo.resposta_por_pessoa)} ticks de resposta por pessoa, contra ${num(porResposta[0].resumo.resposta_por_pessoa)} do ${nome(porResposta[0])}.`]));
    }
    if (rr && rrUsuario) {
      let destaque = null;
      rr.tarefas.forEach((tarefa) => {
        const outra = rrUsuario.tarefas.find((t) => t.tarefa === tarefa.tarefa);
        const ganho = tarefa.resposta - outra.resposta;
        if (ganho > 0 && (!destaque || ganho > destaque.ganho)) destaque = { tarefa, outra, ganho };
      });
      if (destaque) {
        lista.append(itemVeredito(["Rodízio por pessoa: ", { forte: `${destaque.tarefa.usuario} #${destaque.tarefa.tarefa}` },
          ` começou em ${destaque.outra.resposta} ticks no RR por usuário, contra ${destaque.tarefa.resposta} no RR comum.`]));
      }
    }
  }

  // ---------- 05 · varredura do quantum ----------
  function prepararCanvas(canvas) {
    const razao = window.devicePixelRatio || 1;
    const caixa = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(caixa.width * razao));
    canvas.height = Math.max(1, Math.floor(caixa.height * razao));
    const ctx = canvas.getContext("2d");
    ctx.setTransform(razao, 0, 0, razao, 0, 0);
    return { ctx, largura: caixa.width, altura: caixa.height };
  }

  function desenharLinhas(canvasId, xs, series, quantumAtual) {
    const { ctx, largura, altura } = prepararCanvas($(canvasId));
    ctx.clearRect(0, 0, largura, altura);
    const pad = { left: 36, right: 12, top: 12, bottom: 26 };
    const maxY = Math.max(1, ...series.flatMap((s) => s.valores)) * 1.1;
    const x = (i) => pad.left + (xs.length === 1 ? 0 : i / (xs.length - 1)) * (largura - pad.left - pad.right);
    const y = (v) => altura - pad.bottom - (v / maxY) * (altura - pad.top - pad.bottom);

    ctx.strokeStyle = "#d8d3c4"; ctx.lineWidth = 1; ctx.font = "10px Courier New"; ctx.fillStyle = "#667077";
    for (let linha = 0; linha <= 4; linha++) {
      const valor = maxY * linha / 4, yy = y(valor);
      ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(largura - pad.right, yy); ctx.stroke();
      ctx.fillText(valor.toFixed(0), 2, yy + 3);
    }
    const iAtual = xs.indexOf(quantumAtual);
    if (iAtual >= 0) {
      ctx.save(); ctx.strokeStyle = "#172127"; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(x(iAtual), pad.top); ctx.lineTo(x(iAtual), altura - pad.bottom); ctx.stroke();
      ctx.restore();
    }
    series.forEach((serie) => {
      ctx.save();
      ctx.strokeStyle = serie.cor; ctx.lineWidth = 2;
      if (serie.tracejado) ctx.setLineDash([6, 4]);
      ctx.beginPath();
      serie.valores.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
      ctx.stroke();
      ctx.restore();
      if (!serie.tracejado) {
        ctx.fillStyle = serie.cor;
        serie.valores.forEach((v, i) => { ctx.beginPath(); ctx.arc(x(i), y(v), 2.6, 0, Math.PI * 2); ctx.fill(); });
      }
    });
    ctx.fillStyle = "#172127"; ctx.textAlign = "center";
    xs.forEach((q, i) => { if (q === 1 || q % 2 === 0) ctx.fillText("q" + q, x(i), altura - 9); });
    ctx.textAlign = "start";
  }

  async function varrer() {
    const botao = $("varrer");
    botao.disabled = true;
    const quantums = Array.from({ length: 20 }, (_, i) => i + 1);
    try {
      const base = await postar("/api/escalonar", corpoRequisicao({ algoritmos: ["fcfs", "sjf"] }));
      const porQuantum = [];
      for (const q of quantums) {
        $("varrer-status").textContent = `Escalonando com quantum ${q}/20…`;
        porQuantum.push(await postar("/api/escalonar", corpoRequisicao({ algoritmos: ["rr", "rr-usuario"], quantum: q })));
      }
      const serie = (codigo, chave) => porQuantum.map((d) => d.resultados.find((r) => r.algoritmo === codigo).resumo[chave]);
      const constante = (codigo, chave) => quantums.map(() => base.resultados.find((r) => r.algoritmo === codigo).resumo[chave]);
      const montar = (chave) => [
        { nome: "FCFS", cor: porCodigo.fcfs.cor, valores: constante("fcfs", chave), tracejado: true },
        { nome: "SJF", cor: porCodigo.sjf.cor, valores: constante("sjf", chave), tracejado: true },
        { nome: "Round Robin", cor: porCodigo.rr.cor, valores: serie("rr", chave) },
        { nome: "RR por usuário", cor: porCodigo["rr-usuario"].cor, valores: serie("rr-usuario", chave) }
      ];
      const atual = Number($("quantum").value);
      desenharLinhas("grafico-resposta", quantums, montar("resposta_media"), atual);
      desenharLinhas("grafico-trocas", quantums, montar("trocas"), atual);

      const legenda = $("legenda-quantum");
      legenda.replaceChildren();
      ALGORITMOS.forEach((a) => {
        const item = el("span", null, a.nome + (a.codigo === "fcfs" || a.codigo === "sjf" ? " (tracejado)" : ""));
        item.style.setProperty("--cor", a.cor);
        legenda.append(item);
      });
      const item = el("span", null, "┆ quantum atual (" + atual + ")");
      item.style.setProperty("--cor", "transparent");
      legenda.append(item);

      const rrResp = serie("rr", "resposta_media");
      const fcfsResp = constante("fcfs", "resposta_media")[0];
      const encontro = quantums.find((q, i) => Math.abs(rrResp[i] - fcfsResp) < 1e-9);
      $("varrer-status").textContent = encontro
        ? `A partir do quantum ${encontro}, o RR vira FCFS: o quantum já cobre a mensagem inteira.`
        : "Com quantum 20 o RR ainda interrompe alguma mensagem. Aumente o quantum e ele converge para o FCFS.";
    } catch (erro) {
      $("varrer-status").textContent = erro.message;
    } finally {
      botao.disabled = false;
    }
  }
  $("varrer").addEventListener("click", varrer);

  // ---------- início ----------
  async function iniciar() {
    renderAlgoritmos();
    atualizarSaidas();
    try {
      const resposta = await fetch("/api/cenarios");
      estado.cenarios = (await resposta.json()).cenarios;
      carregarCenario(estado.cenarios[0], false);
    } catch (erro) {
      $("cenario-destaque").textContent = "Não consegui carregar os cenários: " + erro.message;
    }
  }
  iniciar();
})();
