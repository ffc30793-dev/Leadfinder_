
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { auth, firestore, getFirebase } from "./firebase.js";

onAuthStateChanged(auth, (user) => {
  if (!user) window.location.replace("./index.html");
});

let authMod;
let fsMod;
let usuarioAtual = null;
let buscando = false;
let modoCadastro = false;

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

function chaveUso(uid) {
  return `lf_daily_searches_${uid || "visitante"}`;
}

function usoDiario(uid) {
  try {
    const dados = JSON.parse(localStorage.getItem(chaveUso(uid)) || "{}");
    const hoje = new Date().toLocaleDateString("sv-SE");
    return dados.data === hoje ? Number(dados.total || 0) : 0;
  } catch {
    return 0;
  }
}

function registrarPesquisa(uid) {
  const hoje = new Date().toLocaleDateString("sv-SE");
  const total = usoDiario(uid) + 1;

  localStorage.setItem(
    chaveUso(uid),
    JSON.stringify({ data: hoje, total })
  );

  atualizarContadorPesquisas();
}

function atualizarContadorPesquisas() {
  if (!usuarioAtual) return;

  const plano = window.leadfinderPlan || "FREE";
  const limite = limitePlano(plano);
  const usados = usoDiario(usuarioAtual.uid);
  const restante = Math.max(0, limite - usados);

  ["credit-count", "credit-count-search", "credit-count-page"].forEach((id) => {
    const elemento = document.getElementById(id);
    if (elemento) elemento.textContent = `${restante} pesquisas hoje`;
  });
}

function limitePlano(plano) {
  const limites = {
    FREE: 6,
    BASICO: 15,
    PRO: 15,
    MAX: 50,
    BUSINESS: 50
  };

  return limites[String(plano || "FREE").toUpperCase()] || limites.FREE;
}

function mensagem(texto) {
  const elemento = $("#resultado-status");
  if (elemento) elemento.textContent = texto;

  const global = $("#global-status");
  if (global) global.textContent = texto;
}

function mensagemAuth(texto) {
  const elemento = $("#auth-message");
  if (elemento) elemento.textContent = texto;
}

function preencherEstados(id) {
  const select = document.getElementById(id);
  if (!select) return;

  const valorAtual = select.value;
  select.innerHTML =
    '<option value="">Selecione o estado</option>' +
    estados.map(([uf, nome]) =>
      `<option value="${uf}">${nome}</option>`
    ).join("");

  if (valorAtual) select.value = valorAtual;
}

async function carregarCidades(uf, id) {
  const select = document.getElementById(id);
  if (!select || !uf) return;

  select.disabled = true;
  select.innerHTML = '<option value="">Carregando cidades...</option>';

  try {
    const resposta = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(uf)}/municipios`,
      { cache: "force-cache" }
    );

    if (!resposta.ok) throw new Error("Falha ao carregar cidades.");

    const cidades = await resposta.json();

    select.innerHTML =
      '<option value="">Selecione a cidade</option>' +
      cidades.map((cidade) =>
        `<option value="${textoSeguro(cidade.nome)}">${textoSeguro(cidade.nome)}</option>`
      ).join("");

    select.disabled = false;
  } catch (erro) {
    console.error("Erro ao carregar municípios:", erro);
    select.innerHTML = '<option value="">Erro ao carregar cidades</option>';
  } finally {
    select.disabled = false;
  }
}

function sincronizarFiltros(origem) {
  const sufixoDestino = origem.endsWith("-search") ? "" : "-search";

  ["estado", "cidade", "nicho", "necessidade"].forEach((campo) => {
    const fonte = document.getElementById(`${campo}${origem.endsWith("-search") ? "-search" : ""}`);
    const destino = document.getElementById(`${campo}${sufixoDestino}`);

    if (!fonte || !destino) return;

    if (campo === "cidade" && fonte.value && ![...destino.options].some((opcao) => opcao.value === fonte.value)) {
      return;
    }

    destino.value = fonte.value;
  });
}

function configurarFiltros() {
  preencherEstados("estado");
  preencherEstados("estado-search");

  $("#estado")?.addEventListener("change", async (evento) => {
    await carregarCidades(evento.target.value, "cidade");
    sincronizarFiltros("estado");
  });

  $("#estado-search")?.addEventListener("change", async (evento) => {
    await carregarCidades(evento.target.value, "cidade-search");
    sincronizarFiltros("estado-search");
  });

  for (const id of ["cidade", "nicho", "necessidade"]) {
    $(`#${id}`)?.addEventListener("change", () => sincronizarFiltros(id));
  }

  for (const id of ["cidade-search", "nicho-search", "necessidade-search"]) {
    $(`#${id}`)?.addEventListener("change", () => sincronizarFiltros(id));
  }

  for (const id of ["nicho", "nicho-search"]) {
    const select = document.getElementById(id);
    if (!select || select.options.length > 1) continue;

    select.innerHTML =
      '<option value="">Selecione o segmento</option>' +
      segmentos.map((segmento) =>
        `<option value="${textoSeguro(segmento)}">${textoSeguro(segmento)}</option>`
      ).join("");
  }
}

function mostrarView(nome) {
  document.querySelectorAll("[data-view-panel]").forEach((painel) => {
    painel.hidden = painel.dataset.viewPanel !== nome;
  });

  document.querySelectorAll("[data-view]").forEach((botao) => {
    botao.classList.toggle("active", botao.dataset.view === nome);
  });

  if (nome === "buscar") {
    document.querySelector("#estado-search")?.focus({ preventScroll: true });
  }
}

function configurarNavegacao() {
  document.querySelectorAll("[data-view]").forEach((botao) => {
    botao.addEventListener("click", () => mostrarView(botao.dataset.view));
  });

  $("#comecar")?.addEventListener("click", () => mostrarView("auth"));
  $("#abrir-cadastro")?.addEventListener("click", () => abrirAuth(true));
  $("#abrir-login")?.addEventListener("click", () => abrirAuth(false));
  $("#trocar-auth")?.addEventListener("click", () => abrirAuth(!modoCadastro));

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

  if (alternar) {
    alternar.textContent = cadastro
      ? "Já tem uma conta? Entrar"
      : "Ainda não tem conta? Cadastre-se";
  }

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
