// Visão geral: números reais (leads salvos, pesquisas) e atalhos.
import { estado } from "./estado.js";
import { api } from "./api.js";
import { db, collection, getDocs, query, orderBy, limit } from "./firebase.js";
import { esc, icon, $, dataBR, vazio } from "./ui.js";
import { carregarLeads } from "./leads-dados.js";
import { SERVICOS_NOME } from "./cartao.js";

export async function render(el) {
  el.innerHTML = `
    <div class="page-head"><div><h1>Olá, ${esc((estado.perfil?.nome || estado.user.email || "").split(" ")[0])}</h1><p class="muted">Resumo da sua prospecção.</p></div>
      <a class="btn btn-primary" href="#/buscar">${icon("search")} Nova busca</a></div>
    <div class="grid grid-4" id="vg-stats"></div>
    <div class="section-title"><h2>Atalhos</h2></div>
    <div class="shortcuts">
      <a class="shortcut" href="#/buscar">${icon("search")} Buscar empresas</a>
      <a class="shortcut" href="#/leads">${icon("bookmark")} Meus leads</a>
      <a class="shortcut" href="#/gerador">${icon("sparkles")} Gerador de conteúdo</a>
      <a class="shortcut" href="#/planos">${icon("card")} Planos e uso</a>
    </div>
    <div class="section-title"><h2>Pesquisas recentes</h2></div>
    <div id="vg-buscas"><div class="skeleton" style="height:70px"></div></div>`;
  pintarStats();

  // dados reais, carregados em paralelo e de forma independente
  if (!estado.conta) api("/api/account").then((r) => { estado.conta = r; document.dispatchEvent(new CustomEvent("lf:uso")); pintarStats(); }).catch((e) => { estado.contaErro = e.message; pintarStats(); });
  if (!estado.leadsCarregados) carregarLeads(estado.user.uid).then(pintarStats).catch(() => { estado.leadsErro = "erro"; pintarStats(); });
  carregarBuscas();
}

function pintarStats() {
  const box = $("#vg-stats");
  if (!box) return;
  const leads = [...estado.leads.values()];
  const hoje = new Date().toLocaleDateString("en-CA");
  const interessados = leads.filter((l) => l.status === "interessado").length;
  const acomp = leads.filter((l) => l.acompanhamento && l.acompanhamento <= hoje && l.status !== "descartado").length;
  const u = estado.conta?.pesquisas;
  const card = (ic, titulo, valor, sub) => `<div class="card stat"><span class="t">${icon(ic)} ${esc(titulo)}</span><span class="n">${esc(valor)}</span><span class="small muted">${esc(sub)}</span></div>`;
  box.innerHTML =
    card("search", "Pesquisas hoje", u ? `${u.usadas}/${u.limite}` : "—", u ? `${u.disponiveis} disponíveis` : estado.contaErro || "Carregando…") +
    card("bookmark", "Leads salvos", estado.leadsCarregados ? leads.length : "—", estado.leadsErro ? "Não foi possível carregar" : "Em Meus leads") +
    card("check", "Interessados", estado.leadsCarregados ? interessados : "—", "Leads marcados como interessados") +
    card("calendar", "Acompanhamentos", estado.leadsCarregados ? acomp : "—", "Com data de hoje ou atrasada");
}

async function carregarBuscas() {
  const box = $("#vg-buscas");
  try {
    const snap = await getDocs(query(collection(db, "users", estado.user.uid, "searches"), orderBy("criadoEm", "desc"), limit(5)));
    estado.buscas = snap.docs.map((d) => d.data());
  } catch { estado.buscas = null; }
  if (!$("#vg-buscas")) return;
  if (estado.buscas === null) { box.innerHTML = `<p class="muted small">Não foi possível carregar o histórico agora.</p>`; return; }
  if (!estado.buscas.length) { box.innerHTML = vazio("search", "Nenhuma pesquisa ainda", "Suas buscas recentes aparecerão aqui.", `<a class="btn btn-primary btn-sm" href="#/buscar">Fazer a primeira busca</a>`); return; }
  box.innerHTML = `<div class="list">${estado.buscas.map((b) => `<div class="row-item"><div><b>${esc(b.cidade)}/${esc(b.uf)}</b> <span class="muted">· ${esc(b.segmento || "busca ampla")} · ${esc(SERVICOS_NOME[b.servico] || b.servico)}</span></div><span class="small muted">${esc(b.total)} empresa${b.total === 1 ? "" : "s"} · ${esc(dataBR(b.criadoEm))}</span></div>`).join("")}</div>`;
}
