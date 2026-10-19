(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const CORES_FIXAS = { Bruno: "#e2553f", Ana: "#2f8fd6", Carla: "#8a5cd6", Davi: "#2f9e6a", Eva: "#d68a1f", "Você": "#e04a9a" };
  const PALETA = ["#159a9c", "#c2456e", "#5b6ee1", "#9c7b2a", "#6c8f2f", "#b5179e"];

  // A "bíblia" da corrida cabe no limite da seção crítica (20 palavras).
  const BIBLIA_CURTA = "Pessoal segue o regulamento completo do campeonato copiado do site oficial com regras horarios pontuacao desempate punicoes e muito mais";
  const BIBLIA_LONGA = "No principio era o chat e o chat estava vazio entao veio o Bruno e disse haja regulamento e houve regulamento "
    + "capitulo um das inscricoes capitulo dois dos horarios capitulo tres da pontuacao capitulo quatro dos criterios de desempate "
    + "capitulo cinco das punicoes para quem faltar capitulo seis das punicoes para quem reclamar das punicoes e assim por diante";
  // Os outros chegam enquanto o Bruno ainda está escrevendo a bíblia no histórico.
  const CENA_CORRIDA = [
    { usuario: "Bruno", chegada: 0, texto: BIBLIA_CURTA },
    { usuario: "Ana", chegada: 21, texto: "oi gente" },
    { usuario: "Carla", chegada: 23, texto: "alguem viu o jogo?" },
    { usuario: "Davi", chegada: 25, texto: "bom dia pessoal" }
  ];
  // Cena do SJF: a bíblia chega com a fila já andando e as falas curtas não param de chegar,
  // então sempre existe alguém menor que ela na fila (starvation).
  const CENA_SJF = {
    id: "sjf-fome", nome: "A bíblia no meio da fila",
    descricao: "Bruno manda a bíblia logo depois da Ana e da Carla, e a sala não para de mandar falas curtinhas.",
    mensagens: [
      ["Ana", 0, "bora jogar hoje"], ["Carla", 1, "bora"], ["Bruno", 2, BIBLIA_CURTA],
      ["Davi", 3, "to dentro"], ["Eva", 4, "eu tambem"], ["Ana", 6, "que horas?"],
      ["Carla", 8, "agora"], ["Davi", 10, "fechou"], ["Eva", 12, "criando sala"],
      ["Ana", 14, "link?"], ["Eva", 16, "manda ai"], ["Carla", 18, "entrei"],
      ["Davi", 20, "eu tambem"], ["Ana", 22, "kkkkkk"], ["Carla", 24, "cade o bruno"],
      ["Davi", 26, "sei la"], ["Eva", 28, "comecando"], ["Ana", 30, "gg"],
      ["Carla", 32, "boa"], ["Davi", 34, "bora mais uma"]
    ].map(([usuario, chegada, texto]) => ({ usuario, chegada, texto }))
  };

  const FASES = [
    {
      id: "sem", tipo: "corrida", controle: false, icone: "💥", nome: "Sem semáforo",
      sub: "todo mundo escreve no histórico ao mesmo tempo",
      licao: "Para publicar, cada thread lê o próximo número livre do chat, escreve a fala palavra por palavra nesse número e só no fim avança o contador. Sem semáforo, enquanto o Bruno ainda está escrevendo a bíblia, a Ana chega, lê o mesmo número e escreve por cima. É condição de corrida: falas misturadas, mensagens perdidas e um contador que mente."
    },
    {
      id: "com", tipo: "corrida", controle: true, icone: "🔒", nome: "Com semáforo",
      sub: "só uma thread publica por vez",
      licao: "A mesma cena, agora com a publicação entre P() e V() de um semáforo. Quem chega enquanto o Bruno publica fica bloqueado 🔒 na fila do semáforo, e ninguém escreve por cima de ninguém. Repare no preço: a sala fica esperando a bíblia inteira passar."
    },
    {
      id: "fcfs", tipo: "escala", icone: "🧱", nome: "FCFS",
      sub: "quem chegou primeiro fala até o fim",
      licao: "Agora o servidor tem um despachante: ele libera uma thread por vez (com semáforos) e a política decide quem é a próxima. No FCFS quem chegou primeiro fala até terminar. Se o primeiro é o Bruno com a bíblia, a sala inteira congela atrás dele: é o efeito comboio."
    },
    {
      id: "sjf", tipo: "escala", icone: "⚡", nome: "SJF", cena: CENA_SJF.id,
      sub: "a fala mais curta da fila passa na frente",
      licao: "O SJF escolhe a menor fala entre as que estão esperando, mas não interrompe ninguém. Aqui o Bruno não é o primeiro: quando a bíblia chega, a Ana já está com a CPU, e a sala não para de mandar falas curtinhas. Toda vez que a CPU fica livre existe alguém menor que a bíblia na fila, então o Bruno chegou em 3º e fala por último. É a starvation (inanição): a fala longa fica com fome de CPU enquanto as curtas continuarem chegando."
    },
    {
      id: "rr", tipo: "escala", icone: "🔄", nome: "Round Robin",
      sub: "cada fala usa a CPU um pouquinho por vez",
      licao: "No Round Robin cada fala ganha um quantum de palavras e volta para o fim da fila. A bíblia do Bruno sai aos pedaços, mas o “oi gente” da Ana aparece logo. A sala não trava, e o custo é pago por quem mandou o textão."
    },
    {
      id: "rr-usuario", tipo: "escala", icone: "👥", nome: "RR por usuário",
      sub: "o rodízio é entre pessoas, não mensagens",
      licao: "O rodízio é por pessoa: quem dispara cinco mensagens seguidas recebe a mesma vez de quem mandou uma. Teste com a cena “O usuário insistente” e compare com o Round Robin comum no placar."
    }
  ];
  const ALGORITMOS = ["fcfs", "sjf", "rr", "rr-usuario"];
  const NOME_ALGORITMO = { fcfs: "FCFS", sjf: "SJF", rr: "Round Robin", "rr-usuario": "RR por usuário" };
  const PASSOS = {
    DIGITAR: "digitando no rascunho", LER: "lendo o próximo nº do chat",
    ESCREVER: "escrevendo no histórico", GRAVAR: "avançando o contador"
  };

  const estado = {
    fase: 0,
    cenarios: [],
    cenarioId: "spammer",
    cena: { corrida: CENA_CORRIDA.map((m) => ({ ...m })), escala: [] },
    quantum: { corrida: 2, escala: 4 },
    resultados: { corrida: null, escala: null },
    visual: "png", frames: [], k: 0, timer: null, cores: new Map(), nos: new Map(), carregando: 0, linhaTotal: 1
  };

  // ---------- utilidades ----------
  function el(tag, classe, texto) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    if (texto !== undefined) no.textContent = texto;
    return no;
  }
  function palavras(texto) { return texto.trim().split(/\s+/).filter(Boolean); }
  function num(valor) { return Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 1 }); }
  function trecho(texto, max = 28) { return texto.length > max ? texto.slice(0, max - 1) + "…" : texto; }
  function fase() { return FASES[estado.fase]; }
  function tipo() { return fase().tipo; }
  function cena() { return estado.cena[tipo()]; }
  function cor(usuario) {
    if (!estado.cores.has(usuario)) {
      const livres = PALETA.filter((c) => ![...estado.cores.values()].includes(c));
      estado.cores.set(usuario, CORES_FIXAS[usuario] || livres[0] || PALETA[estado.cores.size % PALETA.length]);
    }
    return estado.cores.get(usuario);
  }
  function humor(espera) {
    if (espera < 6) return ["ok", "🙂"];
    if (espera < 14) return ["chateado", "😐"];
    if (espera < 24) return ["bravo", "😠"];
    return ["congelado", "🥶"];
  }
  async function postar(url, corpo) {
    const resposta = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.error || "Falha na requisição.");
    return dados;
  }
  function mostrarErro(texto) {
    $("erro").hidden = !texto;
    $("erro").textContent = texto || "";
  }

  // ---------- backend ----------
  async function garantirResultados() {
    const t = tipo();
    if (estado.resultados[t]) return;
    const mensagens = cena();
    if (t === "corrida") {
      const pedir = (controle) => postar("/api/secao-critica", {
        mensagens, algoritmo: "rr", quantum: estado.quantum.corrida, controle, id_inicial: 1
      });
      const [sem, com] = await Promise.all([pedir(false), pedir(true)]);
      estado.resultados.corrida = { sem, com };
    } else {
      const dados = await postar("/api/escalonar", {
        mensagens, quantum: estado.quantum.escala, custo_troca: 1, algoritmos: ALGORITMOS
      });
      estado.resultados.escala = Object.fromEntries(dados.resultados.map((r) => [r.algoritmo, r]));
    }
  }
  function resultadoAtual() {
    const f = fase();
    return f.tipo === "corrida" ? estado.resultados.corrida[f.id] : estado.resultados.escala[f.id];
  }

  // ---------- quadros (um por tick) ----------
  // Fases 3 a 6: o resultado do Despachante (fatias de CPU) vira o estado de cada fala em cada tick.
  function quadrosEscala(r, mensagens) {
    const textos = mensagens.map((m) => palavras(m.texto));
    const tarefas = r.tarefas.slice().sort((a, b) => a.tarefa - b.tarefa);
    const quadros = [];
    for (let k = 0; k <= r.resumo.tempo_total; k++) {
      const fatia = r.fatias.find((f) => f.inicio <= k && k < f.fim);
      const troca = r.trocas.find((t) => t.inicio <= k && k < t.fim);
      const msgs = tarefas.map((t) => {
        const feitas = r.fatias.filter((f) => f.tarefa === t.tarefa)
          .reduce((soma, f) => soma + Math.max(0, Math.min(k - f.inicio, f.fim - f.inicio)), 0);
        const situacao = t.chegada > k ? "ausente" : t.termino <= k ? "feita"
          : fatia && fatia.tarefa === t.tarefa ? "falando" : "esperando";
        return {
          id: t.tarefa, usuario: t.usuario, estado: situacao, chegada: t.chegada, fimEm: t.termino,
          palavras: textos[t.tarefa - 1].slice(0, feitas), total: t.burst,
          espera: situacao === "feita" ? t.espera : Math.max(0, k - t.chegada - feitas)
        };
      });
      const chat = tarefas.filter((t) => t.termino <= k)
        .sort((a, b) => a.termino - b.termino || a.tarefa - b.tarefa)
        .map((t) => ({
          chave: "m" + t.tarefa, autores: [t.usuario], slot: null,
          palavras: textos[t.tarefa - 1].map((p) => ({ p, autor: t.usuario }))
        }));

      let cpu = { texto: "parado", usuario: null };
      const eventos = tarefas.filter((t) => t.chegada === k)
        .map((t) => `📨 ${t.usuario} apertou Enter (${t.burst} palavra${t.burst > 1 ? "s" : ""}).`);
      if (troca) {
        const de = tarefas.find((t) => t.tarefa === troca.de), para = tarefas.find((t) => t.tarefa === troca.para);
        cpu = { texto: "trocando de contexto", usuario: null };
        eventos.push(`🔁 Troca de contexto: o servidor guarda o estado de ${de.usuario} e carrega o de ${para.usuario}.`);
      } else if (fatia) {
        const m = msgs.find((x) => x.id === fatia.tarefa);
        cpu = { texto: `${fatia.usuario} (${m.palavras.length + 1}/${m.total})`, usuario: fatia.usuario };
        eventos.push(`💬 ${fatia.usuario} está com a CPU: palavra ${m.palavras.length + 1} de ${m.total}.`);
      } else if (k === r.resumo.tempo_total) {
        eventos.push("🏁 Todas as falas chegaram ao chat.");
      }
      const esperando = msgs.filter((m) => m.estado === "esperando").sort((a, b) => b.espera - a.espera);
      if (esperando.length && !(k === r.resumo.tempo_total)) {
        eventos.push("Na fila: " + esperando.slice(0, 3).map((m) => `${m.usuario} (${m.espera})`).join(", ")
          + (esperando.length > 3 ? "…" : "") + ".");
      }
      quadros.push({ t: k, msgs, chat, cpu, legenda: eventos.join(" "), semaforo: null, contador: null, corrompidas: 0, perdidas: [] });
    }
    return quadros;
  }

  // Fases 1 e 2: cada instante da SecaoCritica já traz o histórico compartilhado daquele tick.
  function quadrosCorrida(r, mensagens) {
    const textos = mensagens.map((m) => palavras(m.texto));
    const digitadas = textos.map(() => 0), espera = textos.map(() => 0), fimEm = textos.map(() => null);
    const mapa = { cpu: "falando", pronta: "esperando", bloqueada: "bloqueada", feita: "feita", ausente: "ausente" };
    return r.instantes.map((inst, i) => {
      if (inst.tarefa && inst.passo === "DIGITAR") digitadas[inst.tarefa - 1]++;
      const msgs = mensagens.map((m, indice) => {
        const info = inst.estados[String(indice + 1)];
        const situacao = mapa[info.estado];
        if (situacao === "esperando" || situacao === "bloqueada") espera[indice]++;
        if (situacao === "feita" && fimEm[indice] === null) fimEm[indice] = i;
        return {
          id: indice + 1, usuario: m.usuario, estado: situacao, chegada: m.chegada, fimEm: fimEm[indice],
          palavras: textos[indice].slice(0, digitadas[indice]), total: textos[indice].length,
          espera: espera[indice], idLido: info.id_lido,
          publicando: digitadas[indice] === textos[indice].length && situacao !== "feita"
        };
      });
      let corrompidas = 0;
      const chat = inst.historico.map((slot) => {
        const autores = [...new Set(slot.palavras.map((w) => w.autor).filter(Boolean))];
        const leitores = msgs.filter((m) => m.idLido === slot.id);
        const misturada = autores.length > 1 || leitores.length > 1;
        if (misturada) corrompidas++;
        return {
          chave: "s" + slot.id, slot: slot.id, autores, leitores: leitores.map((m) => m.usuario), misturada,
          escrevendo: leitores.some((m) => m.estado !== "feita"),
          palavras: slot.palavras.map((w) => ({ p: w.palavra || "▒", autor: w.autor }))
        };
      });
      const usuarioCpu = inst.tarefa ? mensagens[inst.tarefa - 1].usuario : null;
      const eventos = inst.eventos.map((e) => "• " + e);
      if (usuarioCpu) eventos.unshift(`💬 ${usuarioCpu}: ${inst.detalhe}.`);
      else if (i === r.instantes.length - 1) eventos.push("🏁 Todas as threads terminaram.");
      return {
        t: inst.t, msgs, chat, corrompidas,
        cpu: { texto: usuarioCpu ? `${usuarioCpu}: ${PASSOS[inst.passo] || inst.passo}` : "parado", usuario: usuarioCpu },
        legenda: eventos.join(" "),
        semaforo: r.controle ? {
          valor: inst.semaforo.valor,
          bloqueados: inst.semaforo.bloqueados.map((id) => mensagens[id - 1].usuario)
        } : { desligado: true },
        contador: inst.proximo_id,
        // Só no fim dá para saber quem perdeu a fala de vez.
        perdidas: i === r.instantes.length - 1 ? r.verificacao.mensagens_com_problema : []
      };
    });
  }

  // ---------- a sala ----------
  const PINGUIM = `
    <svg class="pinguim" viewBox="0 0 66 80" aria-hidden="true">
      <ellipse class="sombra" cx="33" cy="76" rx="22" ry="4" fill="#0c223830"/>
      <path d="M10 40 C2 46 3 56 8 60 C11 54 12 47 12 42Z" fill="var(--cor)" stroke="#0c2238" stroke-width="2.5"/>
      <path d="M56 40 C64 46 63 56 58 60 C55 54 54 47 54 42Z" fill="var(--cor)" stroke="#0c2238" stroke-width="2.5"/>
      <path d="M33 4 C16 4 10 22 10 42 C10 62 19 73 33 73 C47 73 56 62 56 42 C56 22 50 4 33 4Z" fill="var(--cor)" stroke="#0c2238" stroke-width="2.5"/>
      <path d="M33 25 C22 25 18 38 18 48 C18 61 24 68 33 68 C42 68 48 61 48 48 C48 38 44 25 33 25Z" fill="#fff"/>
      <ellipse cx="25.5" cy="19" rx="5.5" ry="6.5" fill="#fff"/><ellipse cx="40.5" cy="19" rx="5.5" ry="6.5" fill="#fff"/>
      <circle cx="26.5" cy="20" r="2.8" fill="#172127"/><circle cx="39.5" cy="20" r="2.8" fill="#172127"/>
      <path d="M27 27 L39 27 L33 34Z" fill="#f7a823" stroke="#0c2238" stroke-width="1.5" stroke-linejoin="round"/>
      <ellipse cx="24" cy="74" rx="7" ry="3.2" fill="#f7a823" stroke="#0c2238" stroke-width="1.5"/>
      <ellipse cx="42" cy="74" rx="7" ry="3.2" fill="#f7a823" stroke="#0c2238" stroke-width="1.5"/>
      <rect class="gelo" x="3" y="8" width="60" height="70" rx="8" fill="#bfe8ffb3" stroke="#6fbbe6" stroke-width="2.5"/>
      <path class="gelo" d="M10 16 L18 12 M48 64 L56 58" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
    </svg>`;

  // O Bruno é o pinguim do Linux: corpo preto em forma de pera, barriga clara, bico e pés amarelos.
  const TUX = `
    <svg class="pinguim tux" viewBox="0 0 66 80" aria-hidden="true">
      <ellipse class="sombra" cx="33" cy="76" rx="25" ry="4" fill="#0c223830"/>
      <path d="M33 3 C19 3 15 15 15 26 C15 32 12 37 8 44 C3 53 5 65 13 70 C20 75 46 75 53 70 C61 65 63 53 58 44 C54 37 51 32 51 26 C51 15 47 3 33 3Z" fill="#1d1d1f" stroke="#0c2238" stroke-width="2.5"/>
      <path d="M8 46 C2 52 3 60 7 63 C10 58 12 52 13 48Z M58 46 C64 52 63 60 59 63 C56 58 54 52 53 48Z" fill="#1d1d1f"/>
      <path d="M33 30 C22 30 15 43 15 55 C15 66 22 72 33 72 C44 72 51 66 51 55 C51 43 44 30 33 30Z" fill="#f4f1e8"/>
      <ellipse cx="27" cy="16" rx="4.6" ry="6.2" fill="#fff"/><ellipse cx="39" cy="16" rx="4.6" ry="6.2" fill="#fff"/>
      <ellipse cx="28.2" cy="17.5" rx="2.2" ry="3" fill="#111"/><ellipse cx="37.8" cy="17.5" rx="2.2" ry="3" fill="#111"/>
      <circle cx="28.8" cy="16.3" r=".8" fill="#fff"/><circle cx="38.4" cy="16.3" r=".8" fill="#fff"/>
      <path d="M23 25 C26 21.5 40 21.5 43 25 C42 29.5 37 31.5 33 31.5 C29 31.5 24 29.5 23 25Z" fill="#f6bd2b" stroke="#0c2238" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M25.5 26.5 C29 28.5 37 28.5 40.5 26.5" fill="none" stroke="#c98a12" stroke-width="1.2"/>
      <path d="M8 73 C9 66 22 65 28 71 C27 77 11 78 8 73Z" fill="#f6bd2b" stroke="#0c2238" stroke-width="1.5"/>
      <path d="M58 73 C57 66 44 65 38 71 C39 77 55 78 58 73Z" fill="#f6bd2b" stroke="#0c2238" stroke-width="1.5"/>
      <rect class="gelo" x="3" y="8" width="60" height="70" rx="8" fill="#bfe8ffb3" stroke="#6fbbe6" stroke-width="2.5"/>
      <path class="gelo" d="M10 16 L18 12 M48 64 L56 58" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
    </svg>`;

  const GELO = `
      <rect class="gelo" x="3" y="8" width="60" height="70" rx="8" fill="#bfe8ffb3" stroke="#6fbbe6" stroke-width="2.5"/>
      <path class="gelo" d="M10 16 L18 12 M48 64 L56 58" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`;

  // A Ana é o Cadu Maverick: pinguim-saltador surfista, com topete, colar de dente de tubarão e prancha.
  const CADU = `
    <svg class="pinguim cadu" viewBox="0 0 66 80" aria-hidden="true">
      <ellipse class="sombra" cx="33" cy="76" rx="24" ry="4" fill="#0c223830"/>
      <g transform="rotate(14 55 42)">
        <ellipse cx="55" cy="42" rx="7.5" ry="31" fill="#f7d046" stroke="#0c2238" stroke-width="2.5"/>
        <path d="M55 13 V71" stroke="#e2553f" stroke-width="3"/>
      </g>
      <path d="M12 40 C4 46 5 56 9 60 C12 54 13 47 14 42Z" fill="#2c3646" stroke="#0c2238" stroke-width="2.5"/>
      <path d="M8 3 L18 9 L13 1 L24 7 L22 -1 L30 7Z" fill="#2c3646" stroke="#0c2238" stroke-width="2" stroke-linejoin="round" transform="translate(4 3)"/>
      <path d="M31 6 C17 6 12 22 12 42 C12 62 19 73 31 73 C43 73 50 62 50 42 C50 22 45 6 31 6Z" fill="#2c3646" stroke="#0c2238" stroke-width="2.5"/>
      <path d="M50 40 C56 42 58 48 57 53 C53 51 50 47 49 44Z" fill="#2c3646" stroke="#0c2238" stroke-width="2.5"/>
      <path d="M31 27 C21 27 18 39 18 49 C18 61 24 68 31 68 C38 68 44 61 44 49 C44 39 41 27 31 27Z" fill="#fff"/>
      <ellipse cx="25" cy="19" rx="5" ry="6" fill="#fff"/><ellipse cx="37" cy="19" rx="5" ry="6" fill="#fff"/>
      <circle cx="26" cy="20.5" r="2.7" fill="#172127"/><circle cx="36" cy="20.5" r="2.7" fill="#172127"/>
      <path d="M20 16 C22 14 27 14 30 16 M32 16 C35 14 40 14 42 16" fill="none" stroke="#0c2238" stroke-width="2" stroke-linecap="round"/>
      <path d="M25 26 L37 26 L31 33Z" fill="#f08a24" stroke="#0c2238" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M21 33 C25 38 37 38 41 33" fill="none" stroke="#7a5230" stroke-width="1.6"/>
      <path d="M28.5 36.5 L33.5 36.5 L31 43Z" fill="#fffbe8" stroke="#0c2238" stroke-width="1.2" stroke-linejoin="round"/>
      <ellipse cx="23" cy="74" rx="7" ry="3.2" fill="#f2a08a" stroke="#0c2238" stroke-width="1.5"/>
      <ellipse cx="39" cy="74" rx="7" ry="3.2" fill="#f2a08a" stroke="#0c2238" stroke-width="1.5"/>
      ${GELO}
    </svg>`;

  // A Carla é uma pinguim do Club Penguin: corpo redondo da cor dela, máscara branca e boné de hélice.
  const CLUB = `
    <svg class="pinguim club" viewBox="0 0 66 80" aria-hidden="true">
      <ellipse class="sombra" cx="33" cy="76" rx="24" ry="4" fill="#0c223830"/>
      <path d="M10 42 C2 48 3 58 8 62 C11 56 12 49 12 44Z" fill="var(--cor)" stroke="#0c2238" stroke-width="2.5"/>
      <path d="M56 42 C64 48 63 58 58 62 C55 56 54 49 54 44Z" fill="var(--cor)" stroke="#0c2238" stroke-width="2.5"/>
      <path d="M33 8 C17 8 9 24 9 45 C9 64 19 74 33 74 C47 74 57 64 57 45 C57 24 49 8 33 8Z" fill="var(--cor)" stroke="#0c2238" stroke-width="2.5"/>
      <path d="M33 33 C26 33 18 29 18 21 C18 15 24 13 28 15.5 C30.5 17 32 18.5 33 19.5 C34 18.5 35.5 17 38 15.5 C42 13 48 15 48 21 C48 29 40 33 33 33Z" fill="#fff"/>
      <ellipse cx="33" cy="55" rx="15" ry="15.5" fill="#fff"/>
      <ellipse cx="27" cy="21.5" rx="2.8" ry="3.8" fill="#111"/><ellipse cx="39" cy="21.5" rx="2.8" ry="3.8" fill="#111"/>
      <circle cx="27.8" cy="20.2" r=".9" fill="#fff"/><circle cx="39.8" cy="20.2" r=".9" fill="#fff"/>
      <path d="M28.5 26 L37.5 26 L33 31.5Z" fill="#f7a823" stroke="#0c2238" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M17 14 C18 8 25 4.5 33 4.5 L33 14Z" fill="#f6c429" stroke="#0c2238" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M33 4.5 C41 4.5 48 8 49 14 L33 14Z" fill="#2f8fd6" stroke="#0c2238" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M16 14.5 H50" stroke="#e2553f" stroke-width="3" stroke-linecap="round"/>
      <path d="M33 4.5 V0" stroke="#0c2238" stroke-width="2"/>
      <ellipse cx="27" cy="0" rx="6" ry="1.8" fill="#e2553f" stroke="#0c2238" stroke-width="1.2"/>
      <ellipse cx="39" cy="0" rx="6" ry="1.8" fill="#2f9e6a" stroke="#0c2238" stroke-width="1.2"/>
      <ellipse cx="24" cy="74" rx="7.5" ry="3.2" fill="#f7a823" stroke="#0c2238" stroke-width="1.5"/>
      <ellipse cx="42" cy="74" rx="7.5" ry="3.2" fill="#f7a823" stroke="#0c2238" stroke-width="1.5"/>
      ${GELO}
    </svg>`;

  // O Davi é o Pingu: pinguim de massinha, baixinho, olhos pequenos e o bicão do "noot noot".
  const PINGU = `
    <svg class="pinguim pingu" viewBox="0 0 66 80" aria-hidden="true">
      <ellipse class="sombra" cx="33" cy="76" rx="22" ry="4" fill="#0c223830"/>
      <path d="M11 44 C4 49 5 58 9 61 C12 56 13 50 14 46Z" fill="#202027" stroke="#0c2238" stroke-width="2.5"/>
      <path d="M55 44 C62 49 61 58 57 61 C54 56 53 50 52 46Z" fill="#202027" stroke="#0c2238" stroke-width="2.5"/>
      <path d="M33 12 C20 12 13 24 13 44 C13 63 21 73 33 73 C45 73 53 63 53 44 C53 24 46 12 33 12Z" fill="#202027" stroke="#0c2238" stroke-width="2.5"/>
      <path d="M33 34 C23 34 18 45 18 54 C18 64 25 69 33 69 C41 69 48 64 48 54 C48 45 43 34 33 34Z" fill="#f7f3ea"/>
      <circle cx="28" cy="22" r="4.3" fill="#fff"/><circle cx="38" cy="22" r="4.3" fill="#fff"/>
      <circle cx="29" cy="22.5" r="2" fill="#111"/><circle cx="37" cy="22.5" r="2" fill="#111"/>
      <path d="M21 29 C24 25.5 42 25.5 45 29 C44 34 38 36 33 36 C28 36 22 34 21 29Z" fill="#e8562a" stroke="#0c2238" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M23.5 30.5 C28 32.5 38 32.5 42.5 30.5" fill="none" stroke="#a83616" stroke-width="1.3"/>
      <ellipse cx="25" cy="74" rx="7" ry="3" fill="#e8562a" stroke="#0c2238" stroke-width="1.5"/>
      <ellipse cx="41" cy="74" rx="7" ry="3" fill="#e8562a" stroke="#0c2238" stroke-width="1.5"/>
      ${GELO}
    </svg>`;

  // Cada personagem fixo tem a sua aparência; quem não está aqui (Eva, Você…) usa o pinguim padrão.
  const APARENCIAS = { Bruno: TUX, Ana: CADU, Carla: CLUB, Davi: PINGU };
  // A mesma escalação em imagens de verdade (escalonamento/web/img), para comparar com os desenhos.
  const FOTOS = {
    Bruno: "tux.png", Ana: "cadu.png", Carla: "club-penguin.png", Davi: "pingu.png",
    Eva: "pablo.png", "Você": "capitao.png"
  };
  const ICONES_VISUAL = { desenho: "✏️ desenho", png: "🖼 PNG" };

  function desenharPersonagem(usuario) {
    if (estado.visual === "png" && FOTOS[usuario]) {
      // O gelo do "congelado" fica por cima da foto, já que não dá para pintar dentro dela.
      const foto = el("div", "pinguim foto");
      const imagem = el("img");
      imagem.src = "/static/img/" + FOTOS[usuario];
      imagem.alt = "";
      imagem.addEventListener("error", () => foto.replaceWith(svgDe(usuario)));
      foto.append(imagem, el("span", "gelo"));
      return foto;
    }
    return svgDe(usuario);
  }
  function svgDe(usuario) {
    const corpo = el("div");
    corpo.innerHTML = APARENCIAS[usuario] || PINGUIM;
    return corpo.firstElementChild;
  }

  function lerVisual() {
    try { return localStorage.getItem("sala-do-iglu-visual") === "desenho" ? "desenho" : "png"; } catch { return "png"; }
  }
  function trocarVisual(visual) {
    estado.visual = visual;
    try { localStorage.setItem("sala-do-iglu-visual", visual); } catch { /* sem armazenamento: só não lembra */ }
    document.querySelectorAll("[data-visual]").forEach((botao) => {
      botao.setAttribute("aria-pressed", String(botao.dataset.visual === visual));
    });
    if (estado.frames.length) {
      montarSala();
      desenhar(estado.k, false);
    }
  }

  function montarSala() {
    const host = $("jogadores");
    host.replaceChildren();
    estado.nos = new Map();
    const usuarios = [...new Set(cena().map((m) => m.usuario))];
    usuarios.forEach((usuario) => {
      const raiz = el("div", "jogador");
      raiz.style.setProperty("--cor", cor(usuario));
      const balao = el("div", "balao");
      const fala = el("p", "fala");
      const barra = el("div", "barra");
      const preenchido = el("i");
      barra.append(preenchido);
      const rotulo = el("span", "rotulo");
      balao.append(fala, barra, rotulo);
      const humorNo = el("span", "humor");
      const fila = el("span", "fila-extra");
      const status = el("span", "status");
      raiz.append(balao, humorNo, fila, desenharPersonagem(usuario), el("span", "nome", usuario), status);
      host.append(raiz);
      estado.nos.set(usuario, { raiz, balao, fala, barra, preenchido, rotulo, humorNo, fila, status, anterior: null });
    });
  }

  function desenharJogador(usuario, quadro, k) {
    const no = estado.nos.get(usuario);
    const minhas = quadro.msgs.filter((m) => m.usuario === usuario);
    const ativas = minhas.filter((m) => ["falando", "esperando", "bloqueada"].includes(m.estado));
    const atual = ativas.find((m) => m.estado === "falando") || ativas[0];
    const recente = atual ? null : minhas.filter((m) => m.estado === "feita" && k - m.fimEm < 8)
      .sort((a, b) => b.fimEm - a.fimEm)[0];
    const chegou = minhas.some((m) => m.estado !== "ausente");
    const situacao = atual ? atual.estado : chegou ? "feita" : "ausente";

    if (no.anterior === "ausente" && situacao !== "ausente") {
      no.raiz.classList.remove("chegou");
      void no.raiz.offsetWidth;
      no.raiz.classList.add("chegou");
    }
    no.anterior = situacao;
    no.raiz.dataset.estado = situacao;
    const perdeu = minhas.some((m) => quadro.perdidas.includes(m.id));
    no.raiz.classList.toggle("perdida", perdeu);

    // Humor: quanto mais tempo parado esperando, pior.
    let carinha = "", nivel = "ok";
    if (situacao === "falando") carinha = "😃";
    else if (situacao === "esperando" || situacao === "bloqueada") [nivel, carinha] = humor(atual.espera);
    else if (situacao === "feita") carinha = "😎";
    no.raiz.dataset.humor = nivel;
    no.humorNo.textContent = carinha;

    const extras = ativas.length - 1;
    no.fila.hidden = extras < 1;
    no.fila.textContent = `+${extras} na fila`;

    if (situacao === "ausente") {
      const chegada = Math.min(...minhas.map((m) => m.chegada));
      no.status.textContent = `entra em t=${chegada}`;
    } else if (situacao === "falando") {
      no.status.textContent = atual.publicando ? "📤 publicando no chat" : "💬 com a CPU";
    } else if (situacao === "esperando") {
      no.status.textContent = nivel === "congelado" ? `🥶 ${atual.espera} ticks sem falar` : `⏳ esperando há ${atual.espera}`;
    } else if (situacao === "bloqueada") {
      no.status.textContent = `🔒 na fila do semáforo (${atual.espera})`;
    } else {
      no.status.textContent = perdeu ? "💥 fala corrompida" : "✔ fala enviada";
    }
    if (perdeu) no.humorNo.textContent = "😱";

    const m = atual || recente;
    no.balao.hidden = !m;
    if (!m) return;
    no.fala.replaceChildren();
    if (!m.palavras.length) {
      const pontos = el("span", "digitando");
      pontos.append(el("i"), el("i"), el("i"));
      no.fala.append(pontos);
    } else {
      const LIMITE = 14;
      if (m.palavras.length > LIMITE) no.fala.append(el("span", "reticencias", "… "));
      no.fala.append(document.createTextNode(m.palavras.slice(-LIMITE).join(" ")));
    }
    if (situacao === "falando" && !m.publicando) no.fala.append(el("span", "cursor"));
    no.preenchido.style.width = `${Math.round((m.palavras.length / m.total) * 100)}%`;
    no.barra.hidden = m.estado === "feita";
    if (m.estado === "feita") no.rotulo.textContent = perdeu ? "💥 não chegou inteira" : "✔ enviada";
    else if (m.publicando) no.rotulo.textContent = m.idLido >= 0 ? `publicando no nº ${m.idLido}` : "rascunho pronto · vai publicar";
    else if (!m.palavras.length) no.rotulo.textContent = situacao === "bloqueada" ? "esperando o semáforo" : "esperando a vez";
    else no.rotulo.textContent = `${m.palavras.length}/${m.total} palavras`;
  }

  function desenharChat(quadro, travada, quemFala) {
    const log = $("chat-log");
    log.replaceChildren();
    quadro.chat.forEach((linha) => {
      const li = el("li");
      if (linha.slot !== null) li.append(el("span", "slot", "#" + linha.slot));
      if (linha.misturada) li.classList.add("corrompida");
      else if (linha.escrevendo) li.classList.add("escrevendo");
      const autor = linha.autores[0] || linha.leitores?.[0] || "?";
      const nome = el("b", null, (linha.misturada ? linha.autores.concat(linha.leitores || []) : [autor])
        .filter((v, i, a) => v && a.indexOf(v) === i).join(" + ") + ": ");
      nome.style.setProperty("--cor", cor(autor));
      li.append(nome);
      linha.palavras.forEach((w, i) => {
        const palavra = el("span", "palavra", w.p);
        palavra.style.setProperty("--cor", cor(w.autor || autor));
        if (linha.misturada) palavra.style.color = cor(w.autor || autor);
        li.append(palavra, document.createTextNode(i < linha.palavras.length - 1 ? " " : ""));
      });
      if (linha.misturada) {
        const motivo = linha.leitores && linha.leitores.length > 1
          ? `⚠ ${linha.leitores.join(" e ")} leram o mesmo nº ${linha.slot}`
          : "⚠ falas de pessoas diferentes no mesmo lugar";
        li.append(el("span", "alerta", motivo));
      }
      log.append(li);
    });
    if (!quadro.chat.length) log.append(el("li", "vazio", "(nenhuma fala chegou ao chat ainda)"));
    if (travada) log.append(el("li", "travado", `⌛ ninguém consegue falar enquanto ${quemFala || "o servidor"} ocupa a CPU…`));
    log.scrollTop = log.scrollHeight;
  }

  function desenhar(k, animar) {
    const quadro = estado.frames[k];
    if (!quadro) return;
    estado.k = k;
    const anterior = estado.frames[k - 1];
    const sala = $("sala");

    estado.nos.forEach((_, usuario) => desenharJogador(usuario, quadro, k));

    // HUD
    $("hud-tick").textContent = quadro.t;
    $("hud-cpu").textContent = quadro.cpu.texto;
    $("hud-cpu").style.setProperty("--cpu", quadro.cpu.usuario ? cor(quadro.cpu.usuario) : "var(--tinta)");
    const parados = quadro.msgs.filter((m) => m.estado === "esperando" || m.estado === "bloqueada");
    const piorEspera = parados.reduce((maior, m) => Math.max(maior, m.espera), 0);
    const ping = $("hud-ping");
    ping.dataset.nivel = piorEspera < 8 ? "bom" : piorEspera < 20 ? "medio" : "ruim";
    $("hud-ping-valor").textContent = `${20 + piorEspera * 35} ms`;
    const travada = piorEspera >= 20;
    sala.classList.toggle("travada", travada);
    $("lag").hidden = !travada;

    $("hud-semaforo").hidden = !quadro.semaforo;
    if (quadro.semaforo && quadro.semaforo.desligado) {
      $("hud-semaforo").dataset.valor = "desligado";
      $("hud-semaforo-valor").textContent = "🚫 nenhum";
    } else if (quadro.semaforo) {
      $("hud-semaforo").dataset.valor = quadro.semaforo.valor;
      $("hud-semaforo-valor").textContent = (quadro.semaforo.valor > 0 ? "🟢 livre" : "🔴 ocupado")
        + (quadro.semaforo.bloqueados.length ? ` · fila: ${quadro.semaforo.bloqueados.join(", ")}` : "");
    }
    const ultimo = k === estado.frames.length - 1;
    $("hud-contador").hidden = quadro.contador === null;
    if (quadro.contador !== null) {
      $("hud-contador-valor").textContent = "#" + quadro.contador;
      const v = resultadoAtual().verificacao;
      $("hud-contador").classList.toggle("errado", ultimo && !v.ok);
      if (ultimo && !v.ok) $("hud-contador-valor").textContent += ` (deveria ser #${v.proximo_id_esperado})`;
    }

    desenharChat(quadro, travada, quadro.cpu.usuario);
    moverCursorLinha(k);
    $("chat-info").textContent = tipo() === "corrida" ? "histórico compartilhado" : `${quadro.chat.length}/${quadro.msgs.length} falas`;

    if (animar && anterior && quadro.corrompidas > anterior.corrompidas) {
      sala.classList.remove("tremendo");
      void sala.offsetWidth;
      sala.classList.add("tremendo");
    }
    sala.classList.toggle("bugada", quadro.corrompidas > 0);

    $("agora").textContent = `t=${quadro.t} · ${quadro.legenda || "…"}`;
    $("tempo").value = k;
    desenharFim(ultimo);
  }

  // ---------- linha do tempo (o Gantt do laboratório, só da fase atual) ----------
  // Cada quadro k vale o intervalo [k, k+1): trechos seguidos no mesmo estado viram um bloco.
  function blocoLinha(classe, inicio, fim, corBloco, titulo) {
    const total = estado.linhaTotal;
    const node = el("span", classe);
    node.style.left = (inicio / total * 100) + "%";
    node.style.width = ((Math.min(fim, total) - inicio) / total * 100) + "%";
    if (corBloco) node.style.setProperty("--cor", corBloco);
    if (titulo) node.title = titulo;
    return node;
  }
  function linhaLinha(rotulo, corRotulo, filhos, classe) {
    const linha = el("div", "g-linha" + (classe ? " " + classe : ""));
    const nome = el("span", "g-rotulo", rotulo);
    if (corRotulo) nome.style.setProperty("--cor", corRotulo);
    const trilha = el("div", "g-trilha");
    trilha.append(...filhos);
    linha.append(nome, trilha);
    return linha;
  }
  function trechosSeguidos(valores) {
    const trechos = [];
    valores.forEach((valor, k) => {
      const ultimo = trechos[trechos.length - 1];
      if (ultimo && ultimo.valor === valor) ultimo.fim = k + 1;
      else trechos.push({ valor, inicio: k, fim: k + 1 });
    });
    return trechos;
  }

  function desenharLinhaTempo() {
    const grade = $("linha-grade");
    grade.replaceChildren();
    const quadros = estado.frames;
    estado.linhaTotal = Math.max(1, quadros.length - 1);
    const total = estado.linhaTotal;
    grade.style.setProperty("--tick", (100 / total) + "%");

    const f = fase();
    const q = estado.quantum[f.tipo];
    $("linha-algoritmo").textContent = f.tipo === "corrida"
      ? `Round Robin (quantum ${q}) ${f.controle ? "com" : "sem"} semáforo`
      : NOME_ALGORITMO[f.id] + (f.id === "rr" || f.id === "rr-usuario" ? ` (quantum ${q})` : "");
    $("linha-legenda").textContent = "Uma linha por mensagem: quando o jogador apertou Enter, quanto tempo ficou parado na fila "
      + "e em que ticks o servidor deu a CPU para ela. A linha vermelha acompanha o tick da sala.";

    const cpu = trechosSeguidos(quadros.map((quadro) => quadro.cpu.texto === "trocando de contexto"))
      .filter((t) => t.valor)
      .map((t) => blocoLinha("g-troca", t.inicio, t.fim, null, `troca de contexto em t=${t.inicio}`));
    grade.append(linhaLinha("CPU · trocas", null, cpu, "cpu-linha"));

    quadros[0].msgs.forEach((m, i) => {
      const c = cor(m.usuario);
      const filhos = [];
      trechosSeguidos(quadros.map((quadro) => quadro.msgs[i].estado)).forEach((t) => {
        const faixa = `t=${t.inicio}→${t.fim}`;
        if (t.valor === "falando") filhos.push(blocoLinha("g-fatia", t.inicio, t.fim, c, `${m.usuario} #${m.id} com a CPU: ${faixa}`));
        else if (t.valor === "esperando") filhos.push(blocoLinha("g-espera", t.inicio, t.fim, c, `${m.usuario} #${m.id} esperando: ${faixa}`));
        else if (t.valor === "bloqueada") filhos.push(blocoLinha("g-espera g-bloqueada", t.inicio, t.fim, c, `${m.usuario} #${m.id} bloqueado no semáforo: ${faixa}`));
      });
      const chegada = quadros.findIndex((quadro) => quadro.msgs[i].estado !== "ausente");
      if (chegada >= 0) {
        const marca = el("span", "g-chegada");
        marca.style.left = (chegada / total * 100) + "%";
        marca.style.setProperty("--cor", c);
        marca.title = `${m.usuario} apertou Enter em t=${quadros[chegada].t}`;
        filhos.push(marca);
      }
      grade.append(linhaLinha(`#${m.id} ${m.usuario}`, c, filhos));
    });

    const passo = total > 80 ? 10 : 5;
    const marcas = [];
    for (let t = 0; t <= total; t += passo) {
      const marca = el("span", null, String(t));
      marca.style.left = (t / total * 100) + "%";
      marcas.push(marca);
    }
    grade.append(linhaLinha("tick", null, marcas, "g-eixo"));

    const trilhaCursor = el("div", "g-cursor-trilha");
    const futuro = el("span", "g-futuro");
    futuro.id = "linha-futuro";
    const cursor = el("span", "g-cursor");
    cursor.id = "linha-cursor";
    trilhaCursor.append(futuro, cursor);
    grade.append(trilhaCursor);
  }

  function moverCursorLinha(k) {
    const cursor = $("linha-cursor");
    if (!cursor) return;
    const posicao = (Math.min(k, estado.linhaTotal) / estado.linhaTotal * 100) + "%";
    cursor.style.left = posicao;
    $("linha-futuro").style.left = posicao;
  }

  // ---------- veredito ----------
  function desenharFim(ultimo) {
    const caixa = $("veredito");
    const bug = $("tela-bug");
    caixa.hidden = !ultimo;
    bug.hidden = true;
    if (!ultimo) return;
    caixa.replaceChildren();
    const r = resultadoAtual();
    const mensagens = cena();

    if (tipo() === "corrida") {
      const v = r.verificacao;
      if (!v.ok) {
        const perdidas = v.mensagens_com_problema.map((id) => mensagens[id - 1].usuario);
        caixa.dataset.tipo = "ruim";
        caixa.append(el("h3", null, "💥 O chat bugou"),
          el("p", null, `O contador terminou em #${v.proximo_id_obtido}, mas deveria ser #${v.proximo_id_esperado}: `
            + `${v.duplicados.length} vez${v.duplicados.length === 1 ? "" : "es"} duas threads leram o mesmo número e escreveram no mesmo lugar.`),
          el("p", null, `Falas que não chegaram inteiras: ${perdidas.join(", ")}.`),
          el("p", null, "Ninguém percebeu travamento, e isso é o pior: o chat mostra uma conversa que nunca aconteceu."));
        bug.hidden = false;
        $("tela-bug-texto").textContent = `${perdidas.length} de ${mensagens.length} falas corrompidas · contador #${v.proximo_id_obtido} em vez de #${v.proximo_id_esperado}`;
      } else {
        const maisPreso = r.tarefas.slice().sort((a, b) => b.bloqueada - a.bloqueada)[0];
        caixa.dataset.tipo = maisPreso.bloqueada >= 10 ? "meh" : "bom";
        caixa.append(el("h3", null, "✅ Chat íntegro"),
          el("p", null, `Cada fala ficou no seu número e o contador terminou em #${v.proximo_id_esperado}. `
            + `O semáforo bloqueou ${r.resumo.bloqueios} vez${r.resumo.bloqueios === 1 ? "" : "es"}.`));
        if (maisPreso.bloqueada > 0) {
          caixa.append(el("p", null, `O preço: ${maisPreso.usuario} passou ${maisPreso.bloqueada} ticks na fila do semáforo esperando a vez de publicar. `
            + "Para a sala não travar por causa de uma fala grande, entra o escalonamento (fases 3 a 6)."));
        }
      }
      return;
    }

    // Quando há um textão, o que importa é como ficaram os OUTROS jogadores.
    const porEspera = (lista) => lista.slice().sort((a, b) => b.espera - a.espera || a.tarefa - b.tarefa);
    const maior = r.tarefas.reduce((a, b) => (b.burst > a.burst ? b : a));
    const resto = r.tarefas.filter((t) => t !== maior);
    const temTextao = resto.length > 0 && maior.burst >= 2 * Math.max(...resto.map((t) => t.burst));
    const pior = porEspera(temTextao ? resto : r.tarefas)[0];
    const melhor = ALGORITMOS.map((codigo) => ({
      codigo, t: estado.resultados.escala[codigo].tarefas.find((x) => x.tarefa === pior.tarefa)
    })).sort((a, b) => a.t.espera - b.t.espera)[0];
    caixa.dataset.tipo = pior.espera >= 20 ? "ruim" : pior.espera >= 10 ? "meh" : "bom";
    caixa.append(el("h3", null, pior.espera >= 20 ? "🥶 A sala travou" : pior.espera >= 10 ? "😐 Deu para jogar, com fila" : "😄 Ninguém travou"));
    caixa.append(el("p", null, `Quem mais esperou${temTextao ? ", fora o textão," : ""} foi ${pior.usuario}: ${pior.espera} ticks parado até ver “${trecho(mensagens[pior.tarefa - 1].texto, 40)}” inteiro no chat.`
      + (melhor.codigo !== fase().id && melhor.t.espera < pior.espera
        ? ` Com ${NOME_ALGORITMO[melhor.codigo]}, seriam ${melhor.t.espera}.`
        : " Nenhum outro algoritmo faz essa fala esperar menos nesta cena.")));
    if (temTextao) {
      const fcfs = estado.resultados.escala.fcfs.tarefas.find((x) => x.tarefa === maior.tarefa);
      caixa.append(el("p", null, `O textão de ${maior.usuario} (${maior.burst} palavras) esperou ${maior.espera} ticks`
        + (maior.espera > fcfs.espera ? ` (no FCFS, ${fcfs.espera}): quem manda a bíblia paga a conta, não a sala.` : ".")));
    }
    caixa.append(el("p", null, `Espera média da sala: ${num(r.resumo.espera_media)} ticks · ${r.resumo.trocas} trocas de contexto.`));
  }

  // ---------- placar ----------
  function desenharPlacar() {
    const host = $("placar");
    host.replaceChildren();
    const mensagens = cena();
    if (tipo() === "corrida") {
      $("placar-legenda").textContent = "A mesma cena com Round Robin (quantum " + estado.quantum.corrida
        + "), sem e com semáforo. O escalonador interrompe as threads no meio da publicação nos dois casos; só o semáforo impede que outra entre ali.";
      const duelo = el("div", "duelo");
      [["sem", "💥 Sem semáforo"], ["com", "🔒 Com semáforo"]].forEach(([id, titulo]) => {
        const r = estado.resultados.corrida[id], v = r.verificacao;
        const cartao = el("article", fase().id === id ? "atual" : "");
        cartao.append(el("h3", null, titulo));
        const grande = el("p", "grande " + (v.ok ? "ok" : "falha"), v.ok ? "chat íntegro" : "chat bugado");
        const dl = el("dl");
        [
          ["falas inteiras no chat", `${mensagens.length - v.mensagens_com_problema.length} de ${mensagens.length}`],
          ["contador final", `#${v.proximo_id_obtido} (esperado #${v.proximo_id_esperado})`],
          ["números lidos em dobro", v.duplicados.length],
          ["ticks bloqueados no semáforo", r.resumo.tempo_bloqueado],
          ["tempo total", r.resumo.tempo_total]
        ].forEach(([rotulo, valor]) => dl.append(el("dt", null, rotulo), el("dd", null, String(valor))));
        cartao.append(grande, dl);
        duelo.append(cartao);
      });
      host.append(duelo);
      return;
    }

    $("placar-legenda").textContent = "Ticks entre o jogador apertar Enter e a fala aparecer inteira no chat, na mesma cena, em cada algoritmo (quantum "
      + estado.quantum.escala + ", troca de contexto = 1 tick). 🙂 rápido · 😐 demorou · 😠 irritou · 🥶 congelou.";
    const tabela = el("table");
    const cabeca = el("tr");
    cabeca.append(el("th", null, "fala"));
    ALGORITMOS.forEach((codigo) => cabeca.append(el("th", codigo === fase().id ? "atual" : "", NOME_ALGORITMO[codigo])));
    const thead = el("thead");
    thead.append(cabeca);
    const corpo = el("tbody");
    mensagens.forEach((m, indice) => {
      const linha = el("tr");
      const celula = el("td");
      const quem = el("span", "quem", m.usuario);
      quem.style.setProperty("--cor", cor(m.usuario));
      celula.append(quem, el("span", "texto", " " + trecho(m.texto)));
      linha.append(celula);
      ALGORITMOS.forEach((codigo) => {
        const t = estado.resultados.escala[codigo].tarefas.find((x) => x.tarefa === indice + 1);
        const td = el("td", codigo === fase().id ? "atual" : "", `${humor(t.espera)[1]} ${t.retorno}`);
        td.title = `esperou ${t.espera} ticks na fila; apareceu no chat em t=${t.termino}`;
        linha.append(td);
      });
      corpo.append(linha);
    });
    const rodape = el("tfoot");
    [["espera média", (r) => num(r.resumo.espera_media)], ["pior espera", (r) => r.resumo.pior_espera],
      ["trocas de contexto", (r) => r.resumo.trocas]].forEach(([rotulo, valor]) => {
      const linha = el("tr");
      linha.append(el("td", null, rotulo));
      ALGORITMOS.forEach((codigo) => linha.append(el("td", codigo === fase().id ? "atual" : "", String(valor(estado.resultados.escala[codigo])))));
      rodape.append(linha);
    });
    tabela.append(thead, corpo, rodape);
    host.append(tabela);
  }

  // ---------- fases, cenas e controles ----------
  function desenharFases() {
    const host = $("fases");
    host.replaceChildren();
    FASES.forEach((f, indice) => {
      const li = el("li");
      const botao = el("button", "fase");
      botao.type = "button";
      botao.setAttribute("aria-pressed", String(indice === estado.fase));
      botao.append(el("span", "num", `FASE ${indice + 1}`), el("span", "icone", f.icone), el("b", null, f.nome), el("small", null, f.sub));
      botao.addEventListener("click", () => escolherFase(indice));
      li.append(botao);
      host.append(li);
    });
  }

  function desenharCenarios() {
    const host = $("cenarios");
    host.replaceChildren();
    estado.cenarios.forEach((c) => {
      const botao = el("button", "cenario", c.nome);
      botao.type = "button";
      botao.setAttribute("aria-pressed", String(c.id === estado.cenarioId));
      botao.append(el("small", null, c.descricao));
      botao.addEventListener("click", () => {
        estado.cenarioId = c.id;
        estado.cena.escala = c.mensagens.map((m) => ({ ...m }));
        mudouCena();
      });
      host.append(botao);
    });
  }

  function desenharEntrada() {
    const usuarios = ["Você", ...new Set(cena().map((m) => m.usuario))].filter((v, i, a) => a.indexOf(v) === i);
    const quem = $("quem");
    const escolhido = quem.value;
    quem.replaceChildren(...usuarios.map((u) => el("option", null, u)));
    if (usuarios.includes(escolhido)) quem.value = escolhido;
  }

  function ajustarControles() {
    const f = fase();
    const quantum = $("quantum");
    quantum.max = f.tipo === "corrida" ? 10 : 20;
    quantum.value = estado.quantum[f.tipo];
    $("quantum-output").textContent = quantum.value;
    const usaQuantum = f.tipo === "corrida" || f.id === "rr" || f.id === "rr-usuario";
    quantum.disabled = !usaQuantum;
    $("campo-quantum").classList.toggle("inativo", !usaQuantum);
    $("campo-quantum").title = usaQuantum ? "Palavras por vez antes de devolver a CPU" : `${f.nome} não usa quantum`;
    $("cenarios-wrap").hidden = f.tipo === "corrida";
    $("fase-icone").textContent = f.icone;
    $("fase-nome").textContent = `Fase ${estado.fase + 1} · ${f.nome}`;
    $("licao").textContent = f.licao;
  }

  async function carregar(tocar) {
    parar();
    const pedido = ++estado.carregando;
    mostrarErro("");
    ajustarControles();
    desenharFases();
    desenharEntrada();
    try {
      $("agora").textContent = "Rodando as threads no servidor Java…";
      await garantirResultados();
    } catch (erro) {
      if (pedido === estado.carregando) mostrarErro(erro.message);
      return false;
    }
    if (pedido !== estado.carregando) return false;
    const r = resultadoAtual();
    estado.frames = tipo() === "corrida" ? quadrosCorrida(r, cena()) : quadrosEscala(r, cena());
    $("tempo").max = estado.frames.length - 1;
    montarSala();
    desenharLinhaTempo();
    desenharPlacar();
    desenhar(0, false);
    if (tocar) tocarPausar();
    else $("agora").textContent = "Aperte ▶ Jogar para ver a sala.";
    return true;
  }

  function trocarCenaEscala(id) {
    const cenario = estado.cenarios.find((c) => c.id === id);
    if (!cenario) return;
    estado.cenarioId = cenario.id;
    estado.cena.escala = cenario.mensagens.map((m) => ({ ...m }));
    estado.resultados.escala = null;
    desenharCenarios();
  }

  function escolherFase(indice) {
    const mudouTipo = FASES[indice].tipo !== tipo();
    // O SJF tem cena própria; ao sair dele, volta a cena que estava antes.
    const nova = FASES[indice];
    if (nova.cena && estado.cenarioId !== nova.cena) {
      estado.cenaAntesDaFase = estado.cenarioId;
      trocarCenaEscala(nova.cena);
    } else if (!nova.cena && nova.tipo === "escala" && estado.cenarioId === CENA_SJF.id && estado.cenaAntesDaFase) {
      trocarCenaEscala(estado.cenaAntesDaFase);
      estado.cenaAntesDaFase = null;
    }
    estado.fase = indice;
    if (mudouTipo) $("chegada").value = tipo() === "corrida" ? 22 : 2;
    carregar(true);
  }

  function mudouCena() {
    estado.resultados[tipo()] = null;
    desenharCenarios();
    return carregar(true);
  }

  // ---------- reprodução ----------
  function parar() {
    clearInterval(estado.timer);
    estado.timer = null;
    $("play").textContent = "▶ Jogar";
  }
  function tocarPausar() {
    if (estado.timer) { parar(); return; }
    if (!estado.frames.length) return;
    if (estado.k >= estado.frames.length - 1) desenhar(0, false);
    $("play").textContent = "⏸ Pausar";
    estado.timer = setInterval(() => {
      if (estado.k >= estado.frames.length - 1) { parar(); return; }
      desenhar(estado.k + 1, true);
    }, Number($("velocidade").value));
  }

  $("play").addEventListener("click", tocarPausar);
  $("inicio").addEventListener("click", () => { parar(); desenhar(0, false); });
  $("voltar").addEventListener("click", () => { parar(); desenhar(Math.max(0, estado.k - 1), false); });
  $("avancar").addEventListener("click", () => { parar(); desenhar(Math.min(estado.frames.length - 1, estado.k + 1), true); });
  $("tempo").addEventListener("input", (evento) => { parar(); desenhar(Number(evento.target.value), false); });
  $("velocidade").addEventListener("change", () => { if (estado.timer) { parar(); tocarPausar(); } });
  $("quantum").addEventListener("input", (evento) => { $("quantum-output").textContent = evento.target.value; });
  $("quantum").addEventListener("change", (evento) => {
    estado.quantum[tipo()] = Number(evento.target.value);
    estado.resultados[tipo()] = null;
    carregar(true);
  });

  $("form-chat").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const texto = $("texto").value.trim();
    if (!texto) return;
    const nova = { usuario: $("quem").value, chegada: Number($("chegada").value) || 0, texto };
    cena().push(nova);
    if (tipo() === "escala") estado.cenarioId = null;
    if (await mudouCena()) {
      $("texto").value = "";
    } else {
      // O servidor recusou (limite de palavras ou de mensagens): desfaz e mantém o erro visível.
      const erro = $("erro").textContent;
      cena().splice(cena().indexOf(nova), 1);
      await mudouCena();
      mostrarErro(erro);
    }
  });
  $("biblia").addEventListener("click", () => {
    $("texto").value = tipo() === "corrida" ? BIBLIA_CURTA : BIBLIA_LONGA;
    $("texto").focus();
  });
  $("restaurar").addEventListener("click", () => {
    if (tipo() === "corrida") {
      estado.cena.corrida = CENA_CORRIDA.map((m) => ({ ...m }));
    } else {
      const original = estado.cenarios.find((c) => c.id === (estado.cenarioId || "spammer")) || estado.cenarios[0];
      estado.cenarioId = original.id;
      estado.cena.escala = original.mensagens.map((m) => ({ ...m }));
    }
    mudouCena();
  });

  document.querySelectorAll("[data-visual]").forEach((botao) => {
    botao.addEventListener("click", () => trocarVisual(botao.dataset.visual));
  });

  async function iniciar() {
    try {
      const resposta = await fetch("/api/cenarios");
      estado.cenarios = (await resposta.json()).cenarios.concat(CENA_SJF);
      const inicial = estado.cenarios.find((c) => c.id === estado.cenarioId) || estado.cenarios[0];
      estado.cenarioId = inicial.id;
      estado.cena.escala = inicial.mensagens.map((m) => ({ ...m }));
    } catch (erro) {
      mostrarErro("Não consegui falar com o servidor Java. Ele está rodando?");
      return;
    }
    desenharCenarios();
    trocarVisual(lerVisual());
    $("chegada").value = 22;
    carregar(false);
  }

  iniciar();
})();
