import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { auth, firestore, getFirebase } from "./firebase.js";

onAuthStateChanged(auth, (user) => { if (!user) window.location.replace("./index.html"); });

let authMod;
let fsMod;

const $ = (seletor) => document.querySelector(seletor);
const estados = [
  ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"],
  ["AM", "Amazonas"], ["BA", "Bahia"], ["CE", "Ceará"],
  ["DF", "Distrito Federal"], ["ES", "Espírito Santo"],
  ["GO", "Goiás"], ["MA", "Maranhão"], ["MT", "Mato Grosso"],
  ["MS", "Mato Grosso do Sul"], ["MG", "Minas Gerais"],
  ["PA", "Pará"], ["PB", "Paraíba"], ["PR", "Paraná"],
  ["PE", "Pernambuco"], ["PI", "Piauí"], ["RJ", "Rio de Janeiro"],
  ["RN", "Rio Grande do Norte"], ["RS", "Rio Grande do Sul"],
  ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"],
  ["SP", "São Paulo"], ["SE", "Sergipe"], ["TO", "Tocantins"]
];

const segmentos = [
  "Restaurante", "Pizzaria", "Hamburgueria", "Barbearia",
  "Salão de beleza", "Clínica", "Dentista", "Academia",
  "Oficina mecânica", "Loja de roupas", "Imobiliária",
  "Hotel", "Pet shop", "Padaria", "Cafeteria"
];

let usuarioAtual = null;
let modoCadastro = false;
let buscando = false;

const LIMITES_DIARIOS = { FREE: 5, PRO: 25, MAX: 100, BUSINESS: 100 };
function chaveUso(uid) { return `lf_daily_searches_${uid || "visitante"}`; }
function usoDiario(uid) {
  const hoje = new Date().toLocaleDateString("en-CA");
  try {
    const salvo = JSON.parse(localStorage.getItem(chaveUso(uid)) || "null");
    return salvo && salvo.data === hoje ? Number(salvo.quantidade || 0) : 0;
  } catch { return 0; }
}
function limitePlano(plano) { return LIMITES_DIARIOS[String(plano || "FREE").toUpperCase()] ?? 5; }
function registrarPesquisa(uid) {
  const hoje = new Date().toLocaleDateString("en-CA");
  const quantidade = usoDiario(uid) + 1;
  localStorage.setItem(chaveUso(uid), JSON.stringify({ data: hoje, quantidade }));
  atualizarContadorPesquisas();
}
function atualizarContadorPesquisas() {
  const uid = usuarioAtual?.uid || "visitante";
  const plano = window.leadfinderPlan || "FREE";
  const usados = usoDiario(uid), limite = limitePlano(plano);
  ["credit-count", "credit-count-search", "credit-count-page"].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = `${usados}/${limite}`;
  });
  const stat = document.getElementById("daily-limit-stat"); if (stat) stat.textContent = limite;
}

function mensagem(texto) {
  const el = $("#resultado-status");
  if (el) el.textContent = texto;
}

function mensagemAuth(texto) {
  const el = $("#auth-mensagem");
  if (el) el.textContent = texto;

  const settings = $("#auth-mensagem-settings");
  if (settings) settings.textContent = texto;
}

function mostrarView(nome) {
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === `view-${nome}`);
  });

  document.querySelectorAll(".nav-item").forEach((botao) => {
    botao.classList.toggle("active", botao.dataset.view === nome);
  });

  $("#sidebar")?.classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function preencherEstados(id) {
  const select = document.getElementById(id);
  if (!select) return;

  select.innerHTML =
    '<option value="">Selecione o estado</option>' +
    estados.map(([uf, nome]) =>
      `<option value="${uf}">${nome}</option>`
    ).join("");
}

async function carregarCidades(uf, idCidade) {
  const cidade = document.getElementById(idCidade);
  if (!cidade) return;

  cidade.disabled = true;
  cidade.innerHTML = '<option value="">Carregando cidades...</option>';

  if (!uf) {
    cidade.innerHTML = '<option value="">Selecione primeiro o estado</option>';
    return;
  }

  try {
    const url =
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(uf)}/municipios?orderBy=nome`;

    const resposta = await fetch(url);
    if (!resposta.ok) throw new Error("Falha ao consultar o IBGE");

    const lista = await resposta.json();

    cidade.innerHTML =
      '<option value="">Selecione a cidade</option>' +
      lista.map((item) =>
        `<option value="${String(item.nome).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;")}">${item.nome}</option>`
      ).join("");

    cidade.disabled = false;
  } catch (erro) {
    console.error("Erro ao carregar cidades:", erro);
    cidade.innerHTML = '<option value="">Não foi possível carregar. Tente novamente.</option>';
  }
}

function sincronizarFiltros(origem) {
  const pares = [
    ["estado", "estado-search"],
    ["cidade", "cidade-search"],
    ["nicho", "nicho-search"],
    ["necessidade", "necessidade-search"]
  ];

  for (const par of pares) {
    const elemento = document.getElementById(par[0]);
    const outro = document.getElementById(par[1]);

    if (!elemento || !outro) continue;

    if (origem === par[0]) outro.value = elemento.value;
    if (origem === par[1]) elemento.value = outro.value;
  }
}

function configurarFiltros() {
  preencherEstados("estado");
  preencherEstados("estado-search");

  $("#estado")?.addEventListener("change", async (e) => {
    await carregarCidades(e.target.value, "cidade");
    sincronizarFiltros("estado");
    await carregarCidades(e.target.value, "cidade-search");
  });

  $("#estado-search")?.addEventListener("change", async (e) => {
    await carregarCidades(e.target.value, "cidade-search");
    sincronizarFiltros("estado-search");
    await carregarCidades(e.target.value, "cidade");
  });

  for (const id of ["cidade", "nicho", "necessidade"]) {
    $("#" + id)?.addEventListener("change", () => sincronizarFiltros(id));
  }

  for (const id of ["cidade-search", "nicho-search", "necessidade-search"]) {
    $("#" + id)?.addEventListener("change", () => sincronizarFiltros(id));
  }
}

function configurarNavegacao() {
  document.querySelectorAll("[data-view]").forEach((botao) => {
    botao.addEventListener("click", (evento) => {
      evento.preventDefault();
      const view = botao.dataset.view;
      if (view) mostrarView(view);
    });
  });

  document.querySelectorAll("[data-scroll]").forEach((botao) => {
    botao.addEventListener("click", () => {
      document.getElementById(botao.dataset.scroll)?.scrollIntoView({
        behavior: "smooth"
      });
    });
  });

  $("#mobile-menu")?.addEventListener("click", () => {
    $("#sidebar")?.classList.toggle("open");
  });

  $("#btn-login")?.addEventListener("click", () => abrirAuth(false));
  $("#btn-cadastro")?.addEventListener("click", () => abrirAuth(true));
  $("#trocar-auth")?.addEventListener("click", () => abrirAuth(!modoCadastro));
  $("#voltar-inicio")?.addEventListener("click", () => mostrarView("inicio"));

  $("#global-search")?.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
      evento.preventDefault();
      mostrarView("buscar");
    }
  });

  document.querySelectorAll("[data-plan]").forEach((botao) => {
    botao.addEventListener("click", () => {
      alert("O pagamento ainda não está conectado. Nenhuma cobrança foi feita.");
    });
  });
}

function abrirAuth(cadastro) {
  modoCadastro = cadastro;

  const nome = $("#nome");
  const telefone = $("#telefone");
  const titulo = $("#auth-titulo");
  const botao = $("#auth-submit");
  const alternar = $("#trocar-auth");

  if (nome) {
    nome.hidden = !cadastro;
    nome.required = cadastro;
  }

  if (telefone) {
    telefone.hidden = !cadastro;
    telefone.required = cadastro;
  }

  if (titulo) titulo.textContent = cadastro ? "Crie sua conta" : "Entre na sua conta";
  if (botao) botao.textContent = cadastro ? "Criar conta grátis" : "Entrar";
  if (alternar) alternar.textContent = cadastro
    ? "Já tem uma conta? Entrar"
    : "Ainda não tem conta? Cadastre-se";

  if ($("#senha")) {
    $("#senha").autocomplete = cadastro ? "new-password" : "current-password";
  }

  mensagemAuth("");
  mostrarView("auth");
}

function lerSalvos() {
  try {
    return JSON.parse(localStorage.getItem("lf_saved_leads") || "[]");
  } catch {
    return [];
  }
}

function salvarSalvos(lista) {
  localStorage.setItem("lf_saved_leads", JSON.stringify(lista));
  renderizarSalvos();
}

function textoSeguro(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function mensagemAbordagem(empresa) {
  const nome = empresa.nome || "tua empresa";
  return `Olá! Tudo bem? Encontrei a ${nome} e trabalho com criação de sites profissionais para empresas. Gostaria de conversar sobre como uma presença online pode ajudar o negócio de vocês. Posso te apresentar uma ideia?`;
}

function cardEmpresa(empresa, indice, salvos = false) {
  const id = String(empresa.id || empresa.nome || indice);
  const salvo = lerSalvos().some((item) => String(item.id || item.nome) === id);
  const telefone = String(empresa.telefone || "").replace(/\D/g, "");
  const whatsapp = empresa.whatsapp ||
    (telefone.length >= 10 ? `https://wa.me/55${telefone.replace(/^55/, "")}` : "");

  const endereco = empresa.endereco || "Endereço não informado";
  const site = empresa.site || "";
  const semSite = !site;
  const temContato = Boolean(telefone || whatsapp);
  const temperatura = semSite && temContato
    ? { emoji: "🔥", nome: "Quente", classe: "hot" }
    : semSite || temContato
      ? { emoji: "🌤️", nome: "Morno", classe: "warm" }
      : { emoji: "❄️", nome: "Frio", classe: "cold" };

  return `
    <article class="lead-card result-card">
      <div class="lead-card-content">
        <div class="lead-card-title-line"><h3>${textoSeguro(empresa.nome || "Empresa sem nome")}</h3><span class="lead-temperature ${temperatura.classe}" title="Temperatura estimada pela presença de site e contato">${temperatura.emoji} ${temperatura.nome}</span></div>
        <p>${textoSeguro(endereco)}</p>
        ${telefone ? `<p>Telefone: ${textoSeguro(empresa.telefone)}</p>` : ""}
        ${site ? `<p>Site: <a href="${textoSeguro(site)}" target="_blank" rel="noopener noreferrer">${textoSeguro(site)}</a></p>` : ""}
        <p class="muted">${textoSeguro(empresa.situacao || "Informações públicas disponíveis")}</p>
      </div>
      <div class="lead-actions">
        ${whatsapp ? `<a class="btn btn-whatsapp" href="${textoSeguro(whatsapp)}" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>` : ""}
        <button class="btn btn-ghost" type="button" data-copy="${indice}">Copiar abordagem</button>
        <button class="btn btn-primary" type="button" data-site-prompt="${indice}">Gerar prompt de site</button>
        ${salvos
          ? `<button class="btn btn-ghost" type="button" data-remove="${textoSeguro(id)}">Remover</button>`
          : `<button class="btn btn-ghost" type="button" data-save="${indice}" ${salvo ? "disabled" : ""}>${salvo ? "Salvo" : "Salvar lead"}</button>`}
      </div>
      <textarea class="approach-text" readonly aria-label="Mensagem de abordagem">${textoSeguro(mensagemAbordagem(empresa))}</textarea>
    </article>`;
}

let resultadosAtuais = [];

function renderizarResultados(empresas) {
  const container = $("#resultados");
  if (!container) return;

  resultadosAtuais = empresas;

  const contador = $("#results-count");
  if (contador) contador.textContent = `${empresas.length} encontrados`;

  if (!empresas.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>Nenhuma empresa encontrada nesta consulta</h3>
        <p>Tente outro segmento ou cidade para encontrar novas oportunidades.</p>
      </div>`;
    return;
  }

  container.innerHTML = empresas.map((empresa, i) => cardEmpresa(empresa, i)).join("");
  configurarBotoesResultados();
}

function configurarBotoesResultados() {
  $("#resultados")?.querySelectorAll("[data-save]").forEach((botao) => {
    botao.addEventListener("click", () => {
      const empresa = resultadosAtuais[Number(botao.dataset.save)];
      if (!empresa) return;

      const salvos = lerSalvos();
      const chave = String(empresa.id || empresa.nome);
      if (!salvos.some((item) => String(item.id || item.nome) === chave)) {
        salvos.push(empresa);
        salvarSalvos(salvos);
        renderizarResultados(resultadosAtuais);
      }
    });
  });

  $("#resultados")?.querySelectorAll("[data-copy]").forEach((botao) => {
    botao.addEventListener("click", async () => {
      const empresa = resultadosAtuais[Number(botao.dataset.copy)];
      if (!empresa) return;

      try {
        await navigator.clipboard.writeText(mensagemAbordagem(empresa));
        botao.textContent = "Copiado!";
      } catch {
        const area = botao.closest(".lead-card")?.querySelector("textarea");
        if (area) {
          area.hidden = false;
          area.select();
          document.execCommand("copy");
          botao.textContent = "Copiado!";
        }
      }
    });
  });

  $("#resultados")?.querySelectorAll("[data-site-prompt]").forEach((botao) => {
    botao.addEventListener("click", () => {
      const empresa = resultadosAtuais[Number(botao.dataset.sitePrompt)];
      if (empresa) abrirGeradorPrompt(empresa);
    });
  });
}

function montarPromptSite(empresa) {
  const nome = empresa.nome || "Nome da empresa";
  const endereco = empresa.endereco || "endereço a confirmar";
  const telefone = empresa.telefone || "telefone a confirmar";
  const cidade = empresa.cidade || document.querySelector("#cidade-search")?.value || document.querySelector("#cidade")?.value || "cidade a confirmar";
  const estado = empresa.estado || document.querySelector("#estado-search")?.value || document.querySelector("#estado")?.value || "estado a confirmar";
  const site = empresa.site || "nenhum site foi identificado nos dados disponíveis";
  const segmento = empresa.nicho || empresa.segmento || document.querySelector("#nicho-search")?.value || document.querySelector("#nicho")?.value || "segmento a confirmar";
  return `Crie um site profissional, moderno e responsivo para ${nome}, negócio do segmento ${segmento}, em ${cidade} - ${estado}.

DADOS DISPONÍVEIS
- Empresa: ${nome}
- Segmento: ${segmento}
- Cidade/estado: ${cidade} - ${estado}
- Endereço: ${endereco}
- Telefone: ${telefone}
- Site atual: ${site}

OBJETIVO
Apresentar a empresa com credibilidade, explicar seus produtos ou serviços e transformar visitantes em contatos.

ESTRUTURA
1. Cabeçalho com nome/logo, navegação simples e chamada para contato.
2. Seção principal com título claro, resumo e botão de contato.
3. Apresentação do negócio e seus diferenciais, sem inventar fatos.
4. Serviços/produtos em cartões editáveis.
5. Galeria com imagens relevantes e otimizadas.
6. Área de contato com telefone e botão de WhatsApp somente se o número estiver correto.
7. Rodapé com informações confirmadas.

REQUISITOS
Design original alinhado ao segmento, tipografia legível, cores consistentes, acessibilidade, SEO local básico, carregamento rápido, layout adaptado para celular/tablet/computador e botões funcionais. Não invente preços, avaliações, horário, endereço, certificações ou serviços não informados; sinalize os dados faltantes para revisão. Entregue o código completo e explique como editar textos, imagens e contatos.`;
}

function abrirGeradorPrompt(empresa) {
  let modal = document.getElementById("lf-site-prompt-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "lf-site-prompt-modal";
    modal.className = "lf-prompt-overlay";
    modal.innerHTML = `<section class="lf-prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="lf-prompt-title"><button type="button" class="lf-prompt-close" aria-label="Fechar">×</button><span class="eyebrow">SITE CREATOR · LEADFINDER</span><h2 id="lf-prompt-title">Gerador de prompt de site</h2><p class="muted">Revise os dados e copie o prompt para sua ferramenta de criação de sites por IA.</p><textarea id="lf-site-prompt-text" aria-label="Prompt do site"></textarea><div class="lf-prompt-actions"><button type="button" class="btn btn-primary" id="lf-copy-site-prompt">Copiar prompt</button><button type="button" class="btn btn-ghost" id="lf-select-site-prompt">Selecionar texto</button></div><p id="lf-site-prompt-status" class="muted" role="status" aria-live="polite"></p></section>`;
    document.body.appendChild(modal);
    modal.querySelector(".lf-prompt-close").addEventListener("click", () => modal.classList.remove("open"));
    modal.addEventListener("click", (event) => { if (event.target === modal) modal.classList.remove("open"); });
    modal.querySelector("#lf-select-site-prompt").addEventListener("click", () => { const area = modal.querySelector("#lf-site-prompt-text"); area.focus(); area.select(); });
    modal.querySelector("#lf-copy-site-prompt").addEventListener("click", async () => {
      const area = modal.querySelector("#lf-site-prompt-text"); const status = modal.querySelector("#lf-site-prompt-status");
      try { await navigator.clipboard.writeText(area.value); status.textContent = "Prompt copiado. Agora cole na sua ferramenta de IA."; }
      catch { area.focus(); area.select(); status.textContent = "A cópia automática foi bloqueada. O texto está selecionado para copiar manualmente."; }
    });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") modal.classList.remove("open"); });
  }
  modal.querySelector("#lf-prompt-title").textContent = `Prompt para ${empresa.nome || "esta empresa"}`;
  modal.querySelector("#lf-site-prompt-text").value = montarPromptSite(empresa);
  modal.querySelector("#lf-site-prompt-status").textContent = "";
  modal.classList.add("open");
}

function renderizarSalvos() {
  const container = $("#saved-leads");
  const contador = $("#saved-count");
  if (!container) return;

  const salvos = lerSalvos();
  if (contador) contador.textContent = `${salvos.length} salvos`;

  if (!salvos.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span>◇</span>
        <h3>Nenhum lead salvo ainda</h3>
        <p>Faça uma busca e salve empresas para encontrá-las aqui.</p>
        <button class="btn btn-primary" data-view="buscar">Buscar empresas</button>
      </div>`;
    container.querySelector("[data-view]")?.addEventListener("click", () => mostrarView("buscar"));
    return;
  }

  container.innerHTML = salvos.map((empresa, i) => cardEmpresa(empresa, i, true)).join("");

  container.querySelectorAll("[data-remove]").forEach((botao) => {
    botao.addEventListener("click", () => {
      salvarSalvos(lerSalvos().filter(
        (empresa) => String(empresa.id || empresa.nome) !== botao.dataset.remove
      ));
      renderizarResultados(resultadosAtuais);
    });
  });

  container.querySelectorAll("[data-copy]").forEach((botao) => {
    botao.addEventListener("click", async () => {
      const empresa = salvos[Number(botao.dataset.copy)];
      try {
        await navigator.clipboard.writeText(mensagemAbordagem(empresa));
        botao.textContent = "Copiado!";
      } catch {
        const area = botao.closest(".lead-card")?.querySelector("textarea");
        if (area) {
          area.select();
          document.execCommand("copy");
        }
      }
    });
  });
}

async function executarBusca(origem) {
  if (buscando) return;

  const sufixo = origem === "inicio" ? "" : "-search";
  const estado = $(`#estado${sufixo}`)?.value;
  const cidade = $(`#cidade${sufixo}`)?.value;
  const nicho = $(`#nicho${sufixo}`)?.value;
  const necessidade = $(`#necessidade${sufixo}`)?.value || "todos";

  if (!estado || !cidade || !nicho) {
    if (origem === "inicio") mostrarView("inicio");
    else mostrarView("buscar");
    mensagem("Selecione o estado, a cidade e o segmento antes de pesquisar.");
    return;
  }

  if (!usuarioAtual) {
    mensagemAuth("Entre ou crie uma conta antes de pesquisar empresas.");
    abrirAuth(false);
    return;
  }

  const planoAtual = window.leadfinderPlan || "FREE";
  const limite = limitePlano(planoAtual);
  const usados = usoDiario(usuarioAtual.uid);
  if (usados >= limite) {
    mensagem(`Você já usou suas ${limite} pesquisas de hoje. O limite renova amanhã; confira os planos para ampliar sua cota.`);
    atualizarContadorPesquisas();
    return;
  }

  buscando = true;
  mostrarView("buscar");
  mensagem("Buscando empresas nas fontes públicas. Aguarde...");
  const container = $("#resultados");
  if (container) container.innerHTML = `<div class="loading-inline" role="status">Buscando empresas novas...</div>`;

  try {
    const token = await usuarioAtual.getIdToken();

    const resposta = await fetch("/api/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      cache: "no-store",
      body: JSON.stringify({ estado, cidade, nicho, requestId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` })
    });

    let dados = {};
    try {
      dados = await resposta.json();
    } catch {}

    if (!resposta.ok) {
      throw new Error(dados.erro || dados.mensagem || `Erro na pesquisa (${resposta.status}).`);
    }

    let empresas = Array.isArray(dados.empresas) ? dados.empresas : [];

    // Evita repetir leads apresentados em pesquisas anteriores da mesma conta.
    const seenKey = `lf_seen_leads_${usuarioAtual.uid}`;
    let vistos = [];
    try { vistos = JSON.parse(localStorage.getItem(seenKey) || "[]"); } catch { vistos = []; }
    const vistosSet = new Set(vistos.map(String));
    empresas = empresas.filter((empresa) => !vistosSet.has(String(empresa.id || `${empresa.nome || ""}|${empresa.endereco || ""}`)));

    if (necessidade === "sem-site") {
      empresas = empresas.filter((empresa) => !empresa.site);
    } else if (necessidade === "site") {
      empresas = empresas.filter((empresa) => Boolean(empresa.site));
    }

    // Uma busca não deve exibir duplicatas, mesmo se fontes diferentes repetirem o mesmo local.
    const unicas = new Map();
    for (const empresa of empresas) {
      const chave = String(empresa.id || `${empresa.nome || ""}|${empresa.endereco || ""}`)
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!chave) continue;
      if (!unicas.has(chave)) unicas.set(chave, empresa);
      else {
        const existente = unicas.get(chave);
        existente.telefone ||= empresa.telefone;
        existente.site ||= empresa.site;
        existente.whatsapp ||= empresa.whatsapp;
      }
    }
    empresas = Array.from(unicas.values());
    renderizarResultados(empresas);
    if (empresas.length) {
      registrarPesquisa(usuarioAtual.uid);
      const vistosAgora = empresas.map((empresa) => String(empresa.id || `${empresa.nome || ""}|${empresa.endereco || ""}`));
      localStorage.setItem(seenKey, JSON.stringify([...new Set([...vistos, ...vistosAgora])].slice(-500)));
      mensagem(`Busca concluída. ${empresas.length} empresas novas e únicas encontradas.`);
    } else {
      mensagem("Não encontramos empresas novas nesta combinação. Nenhuma pesquisa foi descontada. Tente outro segmento ou cidade.");
    }
  } catch (erro) {
    console.error("Erro ao buscar empresas:", erro);
    if (container) container.innerHTML = `<div class="empty-state"><h3>Não foi possível atualizar os resultados</h3><p>${textoSeguro(erro.message || "Tente novamente.")}</p><button class="btn btn-ghost" type="button" id="tentar-busca-novamente">Tentar novamente</button></div>`;
    mensagem(`A pesquisa falhou e não foi descontada: ${erro.message}`);
    $("#tentar-busca-novamente")?.addEventListener("click", () => executarBusca(origem));
  } finally {
    buscando = false;
  }
}

function atualizarPerfil(dados) {
  const nome = dados?.displayName || dados?.nome || dados?.email?.split("@")[0] || "Visitante";
  const plano = dados?.plano || "FREE";
  window.leadfinderPlan = plano;
  if ($("profile-name")) $("profile-name").textContent = nome;
  const nomePlano = plano === "FREE" ? "Grátis" : (plano === "MAX" ? "Business" : plano);
  if ($("profile-plan")) $("profile-plan").textContent = `Plano ${nomePlano}`;
  if ($("credit-plan")) $("credit-plan").textContent = nomePlano;
  if ($("settings-name")) $("settings-name").textContent = nome;
  if ($("settings-email")) $("settings-email").textContent = dados?.email || "—";
  if ($("settings-plan")) $("settings-plan").textContent = nomePlano;
  atualizarContadorPesquisas();
}

function configurarUsuario() {
  document.addEventListener("leadfinder:user", (evento) => {
    const dados = evento.detail || {};
    usuarioAtual = auth.currentUser;
    atualizarPerfil({
      ...dados,
      displayName: dados.displayName || dados.nome
    });
  });

  authMod.onAuthStateChanged(auth, async (usuario) => {
    usuarioAtual = usuario || null;

    if (!usuario) {
      atualizarPerfil({ nome: "Visitante", plano: "FREE" });
      return;
    }

    let perfil = {};
    try {
      const referencia = fsMod.doc(firestore, "users", usuario.uid);
      const documento = await fsMod.getDoc(referencia);
      if (documento.exists()) perfil = documento.data();
    } catch (erro) {
      console.warn("Não foi possível carregar o perfil:", erro);
    }

    atualizarPerfil({
      nome: perfil.nome || usuario.displayName || usuario.email?.split("@")[0],
      email: usuario.email,
      plano: perfil.plano || "FREE",
    });
  });
}

function configurarBusca() {
  $("#buscar-leads")?.addEventListener("click", () => executarBusca("inicio"));
  $("#buscar-leads-2")?.addEventListener("click", () => executarBusca("buscar"));

  $("#global-search")?.addEventListener("change", (evento) => {
    const termo = evento.target.value.trim();
    if (termo) {
      mostrarView("buscar");
      mensagem("Selecione estado, cidade e segmento para iniciar a busca.");
    }
  });
}


document.addEventListener("DOMContentLoaded", async () => {
  try {
    const firebase = await getFirebase();
    authMod = firebase.authMod;
    fsMod = firebase.fsMod;

    configurarFiltros();
    configurarNavegacao();
    configurarBusca();
    configurarUsuario();
    renderizarSalvos();

    $("#sair")?.addEventListener("click", async () => {
      try {
        await authMod.signOut(auth);
        usuarioAtual = null;
        atualizarPerfil({
          nome: "Visitante",
          plano: "FREE",
        });
        mensagemAuth("Você saiu da sua conta.");
        mostrarView("inicio");
      } catch (erro) {
        console.error(erro);
        mensagemAuth("Não foi possível sair da conta.");
      }
    });
  } catch (erro) {
    console.error("Erro ao iniciar o LeadFinder:", erro);
    mensagem("Não foi possível iniciar o sistema. Confira a configuração do Firebase.");
  }
});


  
