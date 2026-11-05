// Meus leads: busca, filtros, situação, observações, acompanhamento e remoção (dados em Firestore).
import { estado, aoMudar } from "./estado.js";
import { esc, icon, $, $$, toast, carregando, vazio, erroBox, dataBR } from "./ui.js";
import { carregarLeads, atualizarLead, removerLead, SITUACOES, rotuloSituacao } from "./leads-dados.js";
import { linhasInfo, botoesContato, acaoCopiar, prepararGerador, SERVICOS_NOME } from "./cartao.js";

let lista = [];
let desinscrever = null;

export async function render(el) {
  el.innerHTML = `
    <div class="page-head"><div><h1>Meus leads</h1><p class="muted">Empresas salvas, com situação, observações e acompanhamento.</p></div>
      <a class="btn btn-primary" href="#/buscar">${icon("search")} Buscar empresas</a></div>
    <div id="leads-corpo">${carregando("Carregando seus leads…")}</div>`;

  desinscrever?.();
  desinscrever = null;
  if (!estado.leadsCarregados) {
    try { await carregarLeads(estado.user.uid); }
    catch (e) {
      estado.leadsErro = e?.code === "permission-denied" ? "O banco recusou a leitura. Confira se as regras do Firestore foram publicadas." : "Não foi possível carregar seus leads. Verifique sua conexão.";
      $("#leads-corpo").innerHTML = erroBox(estado.leadsErro, "retentar-leads");
      $("#retentar-leads")?.addEventListener("click", () => render(el));
      return;
    }
  }
  desenhar();
}

function desenhar() {
  const corpo = $("#leads-corpo");
  if (!corpo) return;
  const todos = [...estado.leads.values()];
  if (!todos.length) {
    corpo.innerHTML = vazio("bookmark", "Nenhum lead salvo ainda", "Faça uma busca e salve as empresas que quer abordar.", `<a class="btn btn-primary btn-sm" href="#/buscar">Buscar empresas</a>`);
    return;
  }
  const servicos = [...new Set(todos.map((l) => l.servico).filter(Boolean))];
  const cats = [...new Set(todos.map((l) => l.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  corpo.innerHTML = `
    <div class="filters" role="group" aria-label="Filtros dos leads">
      <div><label for="lf-q">Pesquisar</label><input id="lf-q" type="search" placeholder="Nome, cidade, observação…"></div>
      <div><label for="lf-sit">Situação</label><select id="lf-sit"><option value="">Todas</option>${SITUACOES.map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join("")}</select></div>
      <div><label for="lf-serv">Serviço</label><select id="lf-serv"><option value="">Todos</option>${servicos.map((s) => `<option value="${esc(s)}">${esc(SERVICOS_NOME[s] || s)}</option>`).join("")}</select></div>
      <div><label for="lf-cat">Segmento</label><select id="lf-cat"><option value="">Todos</option>${cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}</select></div>
    </div>
    <p class="small muted" id="lf-cont" role="status"></p>
    <div class="leads" id="lf-lista"></div>`;
  ["#lf-q", "#lf-sit", "#lf-serv", "#lf-cat"].forEach((s) => $(s).addEventListener("input", pintar));
  pintar();
}

function pintar() {
  const q = ($("#lf-q")?.value || "").toLowerCase().trim();
  const sit = $("#lf-sit")?.value, serv = $("#lf-serv")?.value, cat = $("#lf-cat")?.value;
  lista = [...estado.leads.values()].filter((l) => {
    if (sit && (l.status || "pendente") !== sit) return false;
    if (serv && l.servico !== serv) return false;
    if (cat && l.categoria !== cat) return false;
    if (q && ![l.nome, l.cidade, l.endereco, l.observacoes, l.categoria].join(" ").toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => Number(b.createdAt?.seconds || 0) - Number(a.createdAt?.seconds || 0) || a.nome.localeCompare(b.nome, "pt-BR"));

  $("#lf-cont").textContent = `${lista.length} de ${estado.leads.size} lead${estado.leads.size > 1 ? "s" : ""}`;
  const box = $("#lf-lista");
  if (!lista.length) { box.innerHTML = vazio("search", "Nenhum lead com esses filtros", "Limpe a pesquisa ou mude os filtros."); return; }
  box.innerHTML = lista.map(cartaoLead).join("");

  $$("[data-copiar]", box).forEach((b) => b.addEventListener("click", () => acaoCopiar(lista[+b.dataset.copiar])));
  $$("[data-gerar]", box).forEach((b) => b.addEventListener("click", () => prepararGerador(lista[+b.dataset.gerar])));
  $$("[data-remover]", box).forEach((b) => b.addEventListener("click", async () => {
    const l = lista[+b.dataset.remover];
    if (!confirm(`Remover "${l.nome}" dos seus leads?`)) return;
    try { await removerLead(estado.user.uid, l.id); toast("Lead removido."); pintar(); }
    catch { toast("Não foi possível remover. Tente novamente.", "err"); }
  }));
  $$("[data-salvar-lead]", box).forEach((b) => b.addEventListener("click", async () => {
    const l = lista[+b.dataset.salvarLead];
    const art = b.closest("article");
    b.disabled = true;
    try {
      await atualizarLead(estado.user.uid, l.id, {
        status: $("[data-campo=status]", art).value,
        observacoes: $("[data-campo=obs]", art).value.trim().slice(0, 2000),
        acompanhamento: $("[data-campo=data]", art).value
      });
      toast("Alterações salvas.");
    } catch (e) {
      toast(e?.code === "permission-denied" ? "O banco recusou a alteração. Confira as regras do Firestore." : "Não foi possível salvar. Tente novamente.", "err");
    } finally { b.disabled = false; }
  }));
}

function cartaoLead(l, i) {
  const status = l.status || "pendente";
  return `<article class="lead" aria-label="${esc(l.nome)}">
    <div class="lead-head"><div><h3>${esc(l.nome)}</h3><p class="muted small">${esc(l.categoria || "Categoria não informada")} · salvo em ${esc(dataBR(l.createdAt))}${l.servico ? " · " + esc(SERVICOS_NOME[l.servico] || l.servico) : ""}</p></div>
      <div class="chips"><span class="chip">${esc(rotuloSituacao(status))}</span>${l.oportunidade ? `<span class="chip">${esc(l.oportunidade)}</span>` : ""}</div></div>
    <div class="info">${linhasInfo(l)}</div>
    <div class="form-grid">
      <div><label for="st-${i}">Situação</label><select id="st-${i}" data-campo="status">${SITUACOES.map(([v, n]) => `<option value="${v}" ${v === status ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
      <div><label for="dt-${i}">${icon("calendar")} Acompanhamento</label><input id="dt-${i}" type="date" data-campo="data" value="${esc(l.acompanhamento || "")}"></div>
    </div>
    <div><label for="ob-${i}">Observações de prospecção</label><textarea id="ob-${i}" data-campo="obs" maxlength="2000" placeholder="Ex.: falei com o dono, pediu proposta até sexta.">${esc(l.observacoes || "")}</textarea></div>
    <div class="actions">${botoesContato(l, i)}
      <button class="btn btn-sm" type="button" data-gerar="${i}">${icon("sparkles")} Gerar prompt</button>
      <button class="btn btn-primary btn-sm" type="button" data-salvar-lead="${i}">${icon("check")} Salvar alterações</button>
      <button class="btn btn-danger btn-sm" type="button" data-remover="${i}">${icon("trash")} Remover</button></div>
  </article>`;
}
