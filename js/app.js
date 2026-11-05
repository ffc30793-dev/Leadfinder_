// Painel: proteção de rota, carregamento do perfil/plano e navegação por #/rota.
import { auth, onAuthStateChanged } from "./firebase.js";
import { estado } from "./estado.js";
import { api } from "./api.js";
import { garantirPerfil } from "./perfil.js";
import { migrarLeadsLocais, carregarLeads } from "./leads-dados.js";
import { $, $$, toast, erroBox, mensagemFirebase } from "./ui.js";

const ROTAS = {
  "visao-geral": () => import("./visao-geral.js"),
  buscar: () => import("./buscar.js"),
  leads: () => import("./leads.js"),
  gerador: () => import("./gerador.js"),
  conta: () => import("./conta.js"),
  planos: () => import("./planos.js")
};
const TITULOS = { "visao-geral": "Visão geral", buscar: "Buscar empresas", leads: "Meus leads", gerador: "Gerador de conteúdo", conta: "Minha conta", planos: "Planos e assinatura" };

let rotaAtiva = "";
let sequencia = 0;

function rotaDoHash() {
  const r = location.hash.replace(/^#\/?/, "").split(/[?/]/)[0];
  return ROTAS[r] ? r : "visao-geral";
}

async function navegar() {
  const rota = rotaDoHash();
  const meu = ++sequencia;
  rotaAtiva = rota;
  $$("#nav a").forEach((a) => (a.dataset.rota === rota ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  document.title = `${TITULOS[rota]} — LeadFinder`;
  const el = $("#conteudo");
  try {
    const modulo = await ROTAS[rota]();
    if (meu !== sequencia) return; // outra navegação começou
    await modulo.render(el);
    if (meu === sequencia) { window.scrollTo(0, 0); el.querySelector("h1")?.setAttribute("tabindex", "-1"); el.querySelector("h1")?.focus({ preventScroll: true }); }
  } catch (e) {
    console.error(e);
    el.innerHTML = erroBox("Não foi possível abrir esta página. Verifique a conexão e tente novamente.", "rota-retentar");
    $("#rota-retentar")?.addEventListener("click", navegar);
  }
}

function pintarTopo() {
  const nome = estado.perfil?.nome || estado.user?.email?.split("@")[0] || "";
  $("#nome-topo").textContent = nome;
  $("#avatar").textContent = (nome[0] || "L").toUpperCase();
  const u = estado.conta?.pesquisas;
  $("#uso-txt").textContent = u ? `${u.usadas}/${u.limite} pesquisas` : "Pesquisas hoje: —";
}

document.addEventListener("lf:uso", pintarTopo);
document.addEventListener("lf:perfil", pintarTopo);
window.addEventListener("hashchange", navegar);
const sinalizarOffline = () => $("#offline").classList.toggle("hidden", navigator.onLine);
window.addEventListener("online", () => { sinalizarOffline(); toast("Conexão restabelecida."); });
window.addEventListener("offline", sinalizarOffline);
sinalizarOffline();

// Nunca deixa a tela de carregamento presa: se o Firebase ou a API demorarem, abre o painel mesmo assim.
const comTempo = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r("tempo"), ms))]);

let iniciado = false;
onAuthStateChanged(auth, async (user) => {
  if (!user) { location.replace("./index.html"); return; } // rota privada
  if (iniciado && estado.user?.uid === user.uid) return;
  iniciado = true;
  estado.user = user;

  // Perfil: cria/completa se faltar (contas antigas) — falha não bloqueia o painel.
  const perfilP = garantirPerfil(user).then((p) => { estado.perfil = p; estado.perfilErro = ""; })
    .catch((e) => { estado.perfilErro = mensagemFirebase(e); toast(`Perfil não carregado: ${estado.perfilErro}`, "err"); });
  // Plano e uso: vêm do servidor.
  const contaP = api("/api/account").then((c) => { estado.conta = c; estado.contaErro = ""; })
    .catch((e) => { estado.contaErro = e.message; });
  const r = await comTempo(Promise.all([perfilP, contaP]), 12000);
  if (r === "tempo") toast("Conexão lenta: alguns dados ainda estão carregando.", "err");
  pintarTopo();
  $("#splash").remove();
  await navegar();

  // Importa leads salvos antes só neste navegador (uma vez).
  try {
    if (localStorage.getItem("lf_saved_leads")) {
      await carregarLeads(user.uid);
      const n = await migrarLeadsLocais(user.uid);
      if (n) toast(n > 1 ? `${n} leads antigos importados para a sua conta.` : "1 lead antigo importado para a sua conta.");
    }
  } catch (e) { console.warn("Importação de leads antigos adiada:", e?.code || e?.message); }
});
