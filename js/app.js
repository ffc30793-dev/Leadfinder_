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
let mapaLeads = null;
let camadaMarcadores = null;

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
  sincronizarSalvosFirestore(lista).catch((erro) => console.warn("Falha ao sincronizar leads salvos:", erro));
}

async function sincronizarSalvosFirestore(lista) {
  if (!usuarioAtual || !fsMod || !firestore) return;
  const existentes = await fsMod.getDocs(fsMod.query(fsMod.collection(firestore, "leads"), fsMod.where("userId", "==", usuarioAtual.uid)));
  const desejados = new Set(lista.map((item) => String(item.id || item.nome)));
  const porChave = new Map(existentes.docs.map((doc) => [String(doc.data().leadId || doc.id), doc]));
  for (const [chave, docSnap] of porChave) {
    if (!desejados.has(chave)) await fsMod.deleteDoc(docSnap.ref);
  }
  for (const lead of lista) {
    const chave = String(lead.id || lead.nome || "lead").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
    const docId = `${usuarioAtual.uid}_${chave}`;
    await fsMod.setDoc(fsMod.doc(firestore, "leads", docId), {
      ...lead, userId: usuarioAtual.uid, leadId: String(lead.id || lead.nome), savedAt: new Date().toISOString()
    }, { merge: true });
  }
}

async function carregarSalvosFirestore(usuario) {
  if (!usuario || !fsMod || !firestore) return;
  try {
    const snapshot = await fsMod.getDocs(fsMod.query(fsMod.collection(firestore, "leads"), fsMod.where("userId", "==", usuario.uid)));
    const remotos = snapshot.docs.map((d) => d.data()).filter((d) => d.nome);
    if (remotos.length) {
      const locais = lerSalvos();
      const combinados = new Map([...locais, ...remotos].map((lead) => [String(lead.id || lead.nome), lead]));
      localStorage.setItem("lf_saved_leads", JSON.stringify([...combinados.values()]));
      renderizarSalvos();
    }
  } catch (erro) { console.warn("Não foi possível carregar leads salvos do Firestore:", erro); }
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
  const mapa = empresa.mapa || "";

  return `
    <article class="lead-card result-card">
      <div class="lead-card-content">
        <h3>${textoSeguro(empresa.nome || "Empresa sem nome")}</h3>
        <p>${textoSeguro(endereco)}</p>
        ${telefone ? `<p>Telefone: ${textoSeguro(empresa.telefone)}</p>` : ""}
        ${site ? `<p>Site: <a href="${textoSeguro(site)}" target="_blank" rel="noopener noreferrer">${textoSeguro(site)}</a></p>` : ""}
        ${mapa ? `<p><a href="${textoSeguro(mapa)}" target="_blank" rel="noopener noreferrer">Ver no mapa</a></p>` : ""}
        <div class="lead-score-row"><span class="lead-temperature temp-${String(empresa.temperatura || "MORNO").toLowerCase()}">${textoSeguro(empresa.temperatura || "MORNO")}</span><span class="lead-score">Oportunidade: ${Number(empresa.pontuacaoOportunidade || 0)}/75</span></div>
        <p class="muted">${textoSeguro(empresa.situacao || "Informações públicas disponíveis")}</p>
        <p class="muted">Instagram: ${empresa.seguidoresInstagram == null ? "seguidores não verificados" : `${Number(empresa.seguidoresInstagram).toLocaleString("pt-BR")} seguidores`}</p>
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
        <p>Tente outro segmento ou cidade. O mapa mostra apenas coordenadas retornadas pela fonte de empresas.</p>
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
  const site = empresa.site || "não identificado na consulta; não afirmar que não existe";
  const segmento = empresa.nicho || empresa.segmento || document.querySelector("#nicho-search")?.value || document.querySelector("#nicho")?.value || "segmento a confirmar";
  const servico = document.querySelector("#servico-search")?.value || document.querySelector("#servico")?.value || "todos";
  const foco = ({ cardapio: "cardápio digital rápido e fácil de atualizar", catalogo: "catálogo digital organizado por categorias", design: "identidade visual e imagens profissionais", loja: "loja virtual com fluxo de compra simples", automacao: "automação de atendimento e agendamentos", site: "site institucional profissional" })[servico] || "site profissional com opção de catálogo ou cardápio conforme o segmento";
  return `ATUE COMO: uma equipe sênior de estratégia digital, UX/UI, copywriting, acessibilidade e desenvolvimento web.

PROJETO
Crie uma experiência digital completa e personalizada para ${nome}, do segmento ${segmento}, em ${cidade} - ${estado}. O foco principal é ${foco}. Não crie um template genérico: a identidade deve combinar com o setor e com o público real do negócio.

DADOS DISPONÍVEIS (trate como referência, não como fatos adicionais)
- Empresa: ${nome}
- Segmento: ${segmento}
- Localização: ${endereco}, ${cidade} - ${estado}
- Telefone: ${telefone}
- Site informado na fonte: ${site}
- Mapa: ${empresa.mapa || "não informado"}

OBJETIVO E CONVERSÃO
Criar confiança, explicar claramente o que a empresa oferece e facilitar o contato ou pedido. Defina uma chamada principal clara, com botões de contato visíveis e caminhos curtos para conversão.

ENTREGÁVEIS E ESTRUTURA
1. Cabeçalho com marca, navegação objetiva e CTA.
2. Hero com título específico do segmento, benefício claro e CTA.
3. Apresentação da empresa usando apenas informações fornecidas; use campos editáveis para o que faltar.
4. Seção de produtos/serviços em cartões bem organizados. Para restaurantes, incluir cardápio digital com categorias, descrições e preços editáveis; para lojas, catálogo com busca/filtros e CTA; para outros segmentos, adaptar a estrutura ao negócio.
5. Galeria com imagens de alta qualidade, relevantes e otimizadas; usar placeholders identificados quando não houver fotos reais, sem fingir que são fotos da empresa.
6. Prova de confiança apenas com dados reais fornecidos; não inventar avaliações, clientes ou certificações.
7. Contato com WhatsApp apenas se o telefone for válido, formulário acessível e localização se confirmada.
8. Rodapé completo, política de privacidade quando houver coleta de dados e estados de sucesso/erro dos formulários.

DIREÇÃO VISUAL
Crie sistema visual próprio: paleta coerente com o setor, tipografia com hierarquia, espaçamento consistente, ícones vetoriais profissionais, imagens bem tratadas, contraste acessível, microinterações discretas e acabamento premium. Evite aparência genérica de template de IA.

REQUISITOS TÉCNICOS
- Responsivo de verdade para celular, tablet e desktop.
- HTML/CSS/JavaScript ou stack solicitada pela ferramenta; componentes reutilizáveis e código completo.
- Acessibilidade por teclado, labels, foco visível e semântica correta.
- SEO local básico, metadados, títulos, descrição, Open Graph e dados estruturados apenas para informações confirmadas.
- Imagens otimizadas, carregamento rápido e links/botões funcionais.
- Não inventar endereço, horários, preços, serviços, avaliações, seguidores ou certificações. Marcar lacunas como [CONFIRMAR].
- Se houver código, entregar todos os arquivos necessários e instruções claras para executar, editar textos, trocar imagens e publicar. Antes de concluir, revisar links, formulários, responsividade e erros de console.

RESULTADO ESPERADO
Entregue uma solução pronta para personalizar e publicar, com aparência profissional e orientada a conversão, e explique brevemente as decisões visuais e os dados que ainda precisam ser confirmados.`;
}

function abrirGeradorPrompt(empresa) {
  let modal = document.getElementById("lf-site-prompt-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "lf-site-prompt-modal";
    modal.className = "lf-prompt-overlay";
    modal.innerHTML = `<section class="lf-prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="lf-prompt-title"><button type="button" class="lf-prompt-close" aria-label="Fechar">×</button><span class="eyebrow">SITE CREATOR · LEADFINDER</span><h2 id="lf-prompt-title">Gerador de prompt de site</h2><p class="muted">Revise os dados e copie o prompt para sua ferramenta de criação de sites por IA.</p><textarea id="lf-site-prompt-text" aria-label="Prompt do site"></textarea><div class="lf-prompt-actions"><button type="button" class="btn btn-primary" id="lf-copy-site-prompt">Copiar prompt</button><button type="button" class="btn btn-ghost" id="lf-select-site-prompt">Selecionar texto</button></div><p id="lf-site-prompt-status" class="muted" role="status" aria-live="polite"></p></section>`;
    document.body.appendChild(modal);
    modal.querySelector(".lf-prompt-close").addEventListener("click", () => { modal.classList.remove("open"); document.body.classList.remove("lf-prompt-open"); });
    modal.addEventListener("click", (event) => { if (event.target === modal) { modal.classList.remove("open"); document.body.classList.remove("lf-prompt-open"); } });
    modal.querySelector("#lf-select-site-prompt").addEventListener("click", () => { const area = modal.querySelector("#lf-site-prompt-text"); area.focus(); area.select(); });
    modal.querySelector("#lf-copy-site-prompt").addEventListener("click", async () => {
      const area = modal.querySelector("#lf-site-prompt-text"); const status = modal.querySelector("#lf-site-prompt-status");
      try { await navigator.clipboard.writeText(area.value); status.textContent = "Prompt copiado. Agora cole na sua ferramenta de IA."; }
      catch { area.focus(); area.select(); status.textContent = "A cópia automática foi bloqueada. O texto está selecionado para copiar manualmente."; }
    });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") { modal.classList.remove("open"); document.body.classList.remove("lf-prompt-open"); } });
  }
  modal.querySelector("#lf-prompt-title").textContent = `Prompt para ${empresa.nome || "esta empresa"}`;
  modal.querySelector("#lf-site-prompt-text").value = montarPromptSite(empresa);
  modal.querySelector("#lf-site-prompt-status").textContent = "";
  modal.classList.add("open");
  document.body.classList.add("lf-prompt-open");
  requestAnimationFrame(() => modal.querySelector("#lf-site-prompt-text")?.focus());
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

function atualizarMapa(empresas) {
  const el = document.getElementById("lead-map");
  if (!el || !window.L) return;
  const Leaflet = window.L;
  const geolocalizadas = empresas.filter((e) => Number.isFinite(Number(e.latitude)) && Number.isFinite(Number(e.longitude)) && e.latitude !== null && e.longitude !== null);
  if (!mapaLeads) {
    mapaLeads = Leaflet.map(el, { zoomControl: true, scrollWheelZoom: false }).setView([-14.2, -51.9], 4);
    Leaflet.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: "abcd", maxZoom: 19 }).addTo(mapaLeads);
    camadaMarcadores = Leaflet.layerGroup().addTo(mapaLeads);
  }
  camadaMarcadores.clearLayers();
  geolocalizadas.forEach((empresa) => {
    const marker = Leaflet.circleMarker([Number(empresa.latitude), Number(empresa.longitude)], { radius: 6, color: "#ff365f", weight: 2, fillColor: "#ff1744", fillOpacity: .92 }).bindPopup(`<strong>${textoSeguro(empresa.nome)}</strong><br>${textoSeguro(empresa.endereco || "Endereço não informado")}`);
    marker.addTo(camadaMarcadores);
  });
  if (geolocalizadas.length === 1) mapaLeads.setView([Number(geolocalizadas[0].latitude), Number(geolocalizadas[0].longitude)], 14);
  else if (geolocalizadas.length > 1) mapaLeads.fitBounds(Leaflet.latLngBounds(geolocalizadas.map((e) => [Number(e.latitude), Number(e.longitude)])), { padding: [24, 24], maxZoom: 14 });
  const status = document.getElementById("lead-map-status");
  if (status) status.textContent = geolocalizadas.length ? `${geolocalizadas.length} empresas com localização no mapa` : "A pesquisa não retornou coordenadas para exibir pontos neste mapa.";
  setTimeout(() => mapaLeads.invalidateSize(), 80);
}

async function executarBusca(origem) {
  if (buscando) return;

  const sufixo = origem === "inicio" ? "" : "-search";
  const estado = $(`#estado${sufixo}`)?.value;
  const cidade = $(`#cidade${sufixo}`)?.value;
  const nicho = $(`#nicho${sufixo}`)?.value;
  const necessidade = $(`#necessidade${sufixo}`)?.value || "todos";
  const servico = $(`#servico${sufixo}`)?.value || "todos";
  const temperaturaFiltro = $(`#temperatura${sufixo}`)?.value || "todas";
  const instagramFiltro = $(`#instagram${sufixo}`)?.value || "todos";

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
  if (container) container.innerHTML = "";

  try {
    const token = await usuarioAtual.getIdToken();

    const resposta = await fetch("/api/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ estado, cidade, nicho, oportunidade: necessidade })
    });

    let dados = {};
    try {
      dados = await resposta.json();
    } catch {}

    if (!resposta.ok) {
      throw new Error(dados.erro || dados.mensagem || `Erro na pesquisa (${resposta.status}).`);
    }

    let empresas = Array.isArray(dados.empresas) ? dados.empresas : [];

    if (necessidade === "sem-site") {
      empresas = empresas.filter((empresa) => !empresa.site);
    } else if (necessidade === "site") {
      empresas = empresas.filter((empresa) => Boolean(empresa.site));
    }
    if (temperaturaFiltro !== "todas") empresas = empresas.filter((empresa) => empresa.temperatura === temperaturaFiltro);
    if (instagramFiltro === "poucos") {
      // Esta fonte não entrega seguidores. Não inventar números: manter apenas perfis verificados futuramente.
      empresas = empresas.filter((empresa) => Number.isFinite(Number(empresa.seguidoresInstagram)) && Number(empresa.seguidoresInstagram) <= 1000 && empresa.instagramStatus === "VERIFICADO");
    }
    if (servico !== "todos") empresas = empresas.map((empresa) => ({ ...empresa, servicoRecomendado: servico }));

    registrarPesquisa(usuarioAtual.uid);
    renderizarResultados(empresas);
    atualizarMapa(empresas);
    mensagem(instagramFiltro === "poucos" && !empresas.length
      ? "Nenhum perfil com até 1.000 seguidores pôde ser confirmado. O Google Places não fornece contagem de seguidores; não exibimos números inventados."
      : empresas.length
      ? `Busca concluída. Foram encontradas ${empresas.length} empresas. Os dados podem estar incompletos.`
      : "A consulta terminou, mas não retornou empresas com esses filtros. Tente outro segmento ou cidade.");
  } catch (erro) {
    console.error("Erro ao buscar empresas:", erro);
    mensagem(`Não foi possível realizar a busca: ${erro.message}`);
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
    await carregarSalvosFirestore(usuario);
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


  
