// Buscar empresas: filtros, resultados, paginação ("Carregar mais") e filtros locais.
import { api, ApiError } from "./api.js";
import { estado, aoMudar } from "./estado.js";
import { esc, icon, $, $$, toast, carregando, vazio, erroBox, dataBR } from "./ui.js";
import { ESTADOS, SEGMENTOS, SERVICOS, acharServico } from "../shared/catalog.js";
import { salvarLead, rotuloSituacao } from "./leads-dados.js";
import { linhasInfo, botoesContato, acaoCopiar, prepararGerador } from "./cartao.js";

const CHAVE_SESSAO = "lf_ultima_busca";
let ultimo = lerSessao();
let buscando = false;
let visiveis = [];
let desinscrever = null;

function lerSessao() {
  try { return JSON.parse(sessionStorage.getItem(CHAVE_SESSAO) || "null"); } catch { return null; }
}
function gravarSessao() {
  try { sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(ultimo)); } catch { /* cache de interface apenas */ }
}

// ---------- municípios (IBGE) com cache de 30 dias ----------
async function municipios(uf) {
  const chave = `lf_ibge_${uf}`;
  try {
    const c = JSON.parse(localStorage.getItem(chave) || "null");
    if (c && Date.now() - c.t < 30 * 86400000 && c.nomes?.length) return c.nomes;
  } catch { /* ignora cache inválido */ }
  const r = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(uf)}/municipios?orderBy=nome`);
  if (!r.ok) throw new Error("ibge");
  const nomes = (await r.json()).map((m) => m.nome);
  try { localStorage.setItem(chave, JSON.stringify({ t: Date.now(), nomes })); } catch { /* sem espaço */ }
  return nomes;
}

function opcoesSegmento(servicoId) {
  const s = acharServico(servicoId);
  const lista = SEGMENTOS.filter((x) => !s?.gruposAceitos || s.gruposAceitos.includes(x.grupo));
  const amplo = s?.segmentosPadrao ? `<option value="">Busca ampla do serviço (vários segmentos)</option>` : `<option value="">Escolha um segmento</option>`;
  const livre = s?.gruposAceitos ? "" : `<option value="__outro">Outro (digitar)…</option>`;
  return amplo + lista.map((x) => `<option value="${esc(x.nome)}">${esc(x.nome)}</option>`).join("") + livre;
}

export async function render(el) {
  const p = ultimo?.params || {};
  el.innerHTML = `
    <div class="page-head"><div><h1>Buscar empresas</h1><p class="muted">Encontre negócios reais por cidade, segmento e serviço que você oferece.</p></div></div>
    <ol class="steps" aria-label="Etapas"><li style="display:contents"><span id="st1" class="on">1 · Filtros</span></li><li style="display:contents"><span id="st2">2 · Resultados</span></li><li style="display:contents"><span id="st3">3 · Salvar leads</span></li></ol>
    <form class="card" id="form-busca" novalidate>
      <div class="form-grid">
        <div><label for="f-servico">Serviço que você oferece</label>
          <select id="f-servico">${SERVICOS.map((s) => `<option value="${s.id}" ${p.servico === s.id ? "selected" : ""}>${esc(s.nome)}</option>`).join("")}</select>
          <p class="small muted" id="f-servico-dica" style="margin-top:4px"></p></div>
        <div><label for="f-estado">Estado</label>
          <select id="f-estado" required><option value="">Selecione o estado</option>${ESTADOS.map(([uf, n]) => `<option value="${uf}" ${p.estado === uf ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
        <div><label for="f-cidade">Cidade</label>
          <select id="f-cidade" required disabled><option value="">Selecione primeiro o estado</option></select></div>
        <div><label for="f-segmento">Segmento</label><select id="f-segmento"></select>
          <input id="f-livre" class="hidden" maxlength="80" placeholder="Ex.: loja de instrumentos musicais" aria-label="Segmento digitado" style="margin-top:8px"></div>
      </div>
      <div style="margin-top:18px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <button class="btn btn-primary" id="btn-buscar" type="submit">${icon("search")} Buscar empresas</button>
        <span class="small muted" id="dica-uso"></span>
      </div>
      <p class="small muted" style="margin-top:10px">Cada pesquisa consulta o Google Maps. “Site não identificado” significa que o Google não lista um site — não confirma que a empresa não tenha um.</p>
    </form>
    <p class="small" id="msg-busca" role="status" aria-live="polite" style="margin-top:12px"></p>
    <div id="area-resultados" style="margin-top:18px"></div>`;

  const sv = $("#f-servico"), es = $("#f-estado"), ci = $("#f-cidade"), sg = $("#f-segmento"), lv = $("#f-livre");

  const aplicarServico = () => {
    sg.innerHTML = opcoesSegmento(sv.value);
    if (p.segmento && sv.value === p.servico) sg.value = [...sg.options].some((o) => o.value === p.segmento) ? p.segmento : (p.segmentoLivre ? "__outro" : "");
    lv.classList.toggle("hidden", sg.value !== "__outro");
    if (sg.value === "__outro" && p.segmentoLivre) lv.value = p.segmentoLivre;
    $("#f-servico-dica").textContent = acharServico(sv.value)?.resumo || "";
  };
  const carregarCidades = async (uf, escolhida = "") => {
    if (!uf) { ci.disabled = true; ci.innerHTML = `<option value="">Selecione primeiro o estado</option>`; return; }
    ci.disabled = true; ci.innerHTML = `<option value="">Carregando cidades…</option>`;
    try {
      const nomes = await municipios(uf);
      ci.innerHTML = `<option value="">Selecione a cidade</option>` + nomes.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
      if (escolhida) ci.value = escolhida;
      ci.disabled = false;
    } catch {
      ci.innerHTML = `<option value="">Não foi possível carregar as cidades</option>`;
      toast("Não foi possível carregar a lista de cidades (IBGE). Tente novamente.", "err");
    }
  };

  sv.addEventListener("change", () => { p.servico = ""; aplicarServico(); });
  sg.addEventListener("change", () => lv.classList.toggle("hidden", sg.value !== "__outro"));
  es.addEventListener("change", () => carregarCidades(es.value));
  aplicarServico();
  if (p.estado) await carregarCidades(p.estado, p.cidade);
  atualizarDica();

  $("#form-busca").addEventListener("submit", (e) => { e.preventDefault(); executar(false); });

  desinscrever?.();
  desinscrever = aoMudar(() => { if (location.hash.startsWith("#/buscar")) { atualizarDica(); if (ultimo?.empresas?.length) desenharResultados(); } });
  if (ultimo?.empresas) desenharResultados();
  etapas();
}

function atualizarDica() {
  const el = $("#dica-uso");
  const u = estado.conta?.pesquisas;
  if (el) el.textContent = u ? `${u.disponiveis} de ${u.limite} pesquisas disponíveis hoje` : "";
}

function etapas() {
  const tem = Boolean(ultimo?.empresas?.length);
  $("#st1")?.classList.toggle("on", !tem);
  $("#st2")?.classList.toggle("on", tem);
  $("#st3")?.classList.toggle("on", tem && ultimo.empresas.some((e) => estado.leads.has(e.id)));
}

function lerParametros() {
  const segSel = $("#f-segmento").value;
  const livre = $("#f-livre").value.trim();
  return {
    servico: $("#f-servico").value,
    estado: $("#f-estado").value,
    cidade: $("#f-cidade").value,
    segmento: segSel === "__outro" ? livre : segSel,
    segmentoLivre: segSel === "__outro" ? livre : ""
  };
}

async function executar(continuar) {
  if (buscando) return;
  const params = continuar ? ultimo.params : lerParametros();
  const msg = $("#msg-busca");
  if (!params.estado || !params.cidade) { msg.textContent = "Selecione o estado e a cidade."; return; }
  const s = acharServico(params.servico);
  if (!params.segmento && !s?.segmentosPadrao) { msg.textContent = "Escolha um segmento."; return; }
  if (!navigator.onLine) { msg.textContent = "Você está sem conexão. Conecte-se para pesquisar."; return; }

  buscando = true; msg.textContent = "";
  const botao = $("#btn-buscar"); botao.disabled = true;
  if (!continuar) $("#area-resultados").innerHTML = `<div class="grid">${'<div class="skeleton"></div>'.repeat(3)}</div><p class="muted small" style="text-align:center;margin-top:10px" role="status">Consultando o Google Maps… isso pode levar alguns segundos.</p>`;
  else $("#btn-mais") && ($("#btn-mais").disabled = true);

  try {
    const corpo = { estado: params.estado, cidade: params.cidade, segmento: params.segmento, servico: params.servico };
    if (continuar) { corpo.continuacao = ultimo.continuacao; corpo.excluir = ultimo.empresas.map((e) => e.id); }
    const r = await api("/api/leads", { metodo: "POST", corpo });
    if (r.uso && estado.conta) {
      estado.conta.pesquisas = { ...estado.conta.pesquisas, limite: r.uso.limite, usadas: r.uso.usadas, disponiveis: r.uso.disponiveis };
      document.dispatchEvent(new CustomEvent("lf:uso"));
    }
    const lista = continuar ? [...ultimo.empresas, ...r.empresas] : r.empresas;
    ultimo = { params, empresas: lista, continuacao: r.continuacao || "", parcial: r.parcial, avisos: r.avisos || [], descartados: r.descartados, cidadesVizinhas: r.cidadesVizinhas || [], ultimaCarga: r.total };
    gravarSessao();
    atualizarDica();
    desenharResultados();
    if (!r.total) toast(continuar ? "Não há mais empresas novas para esta busca." : "Nenhuma empresa encontrada. A pesquisa não foi descontada.", "ok");
  } catch (e) {
    const limite = e instanceof ApiError && e.codigo === "limite_diario";
    if (!continuar) {
      $("#area-resultados").innerHTML = limite
        ? vazio("alert", "Limite diário atingido", e.message, `<a class="btn btn-primary btn-sm" href="#/planos">Ver planos</a>`)
        : erroBox(e.message, "retentar");
      $("#retentar")?.addEventListener("click", () => executar(false));
    } else toast(e.message, "err");
    if (limite && e.dados?.uso && estado.conta) { estado.conta.pesquisas = { ...estado.conta.pesquisas, ...e.dados.uso }; document.dispatchEvent(new CustomEvent("lf:uso")); }
  } finally {
    buscando = false;
    const b = $("#btn-buscar"); if (b) b.disabled = false;
  }
}

// Explica, com os números que o servidor devolve, por que a busca não trouxe empresas.
function motivoVazio(d, servicoId) {
  if (!d) return "Tente outra cidade, outro segmento ou outro serviço.";
  const linhas = [];
  if (d.semWhatsapp) linhas.push(`${d.semWhatsapp} sem celular (WhatsApp)`);
  if (d.jaTemSite) linhas.push(`${d.jaTemSite} já têm site próprio`);
  if (d.semSiteParaRedesign) linhas.push(`${d.semSiteParaRedesign} sem site para redesenhar`);
  if (d.semOportunidade) linhas.push(`${d.semOportunidade} sem necessidade do serviço`);
  if (d.naoAnalisados) linhas.push(`${d.naoAnalisados} com site que não deu para analisar`);
  if (d.foraDoSegmento) linhas.push(`${d.foraDoSegmento} de outro tipo de negócio`);
  if (d.entidadesPublicas) linhas.push(`${d.entidadesPublicas} órgãos públicos/instituições`);
  if (d.foraDaCidade) linhas.push(`${d.foraDaCidade} de outra cidade`);
  const dica = servicoId === "redesign-sites"
    ? "Em cidade pequena quase ninguém tem site: tente uma cidade maior ou o serviço “Criação de sites”."
    : "Tente uma cidade maior, outro segmento ou outro serviço.";
  return linhas.length ? `O Google devolveu empresas, mas foram descartadas: ${linhas.join(", ")}. ${dica}` : `O Google não encontrou empresas para esta busca. ${dica}`;
}

function filtrar(lista) {
  const fs = $("#fl-site")?.value || "", fc = $("#fl-contato")?.value || "", fsit = $("#fl-situacao")?.value || "";
  return lista.filter((l) => {
    if (fs === "sem" && l.siteStatus !== "nao_identificado") return false;
    if (fs === "terceiros" && !["terceiros", "plataforma_gratuita"].includes(l.siteStatus)) return false;
    if (fs === "proprio" && l.siteStatus !== "proprio") return false;
    if (fc === "telefone" && !l.telefone) return false;
    if (fc === "whatsapp" && !l.whatsapp) return false;
    const salvo = estado.leads.get(l.id);
    if (fsit === "nao_salvo" && salvo) return false;
    if (fsit === "salvo" && !salvo) return false;
    if (["pendente", "realizado", "interessado", "descartado"].includes(fsit) && salvo?.status !== fsit) return false;
    return true;
  });
}

function desenharResultados() {
  const area = $("#area-resultados");
  if (!area || !ultimo) return;
  const manter = { s: $("#fl-site")?.value, c: $("#fl-contato")?.value, t: $("#fl-situacao")?.value };
  const total = ultimo.empresas.length;
  const nomeServ = acharServico(ultimo.params.servico)?.nome || "";

  if (!total) {
    area.innerHTML = vazio("search", "Nenhuma empresa encontrada", motivoVazio(ultimo.descartados, ultimo.params.servico));
    etapas(); return;
  }

  area.innerHTML = `
    <div class="page-head" style="margin-bottom:8px"><div><h2>${total} empresa${total > 1 ? "s" : ""} · ${esc(ultimo.params.cidade)}/${esc(ultimo.params.estado)}</h2><p class="muted small">${esc(nomeServ)}${ultimo.params.segmento ? " · " + esc(ultimo.params.segmento) : ""}</p></div></div>
    ${ultimo.cidadesVizinhas?.length ? `<div class="notice warn" role="status">${icon("info")} Nenhuma empresa aproveitável em ${esc(ultimo.params.cidade)}. Mostrando cidades vizinhas: ${esc(ultimo.cidadesVizinhas.join(", "))}.</div>` : ""}
    ${ultimo.parcial ? `<div class="notice warn" role="status">${icon("info")} Resultados parciais: a fonte pode ter mais empresas. Use “Carregar mais” para continuar sem repetir as já exibidas.</div>` : ""}
    <div class="filters" role="group" aria-label="Filtros dos resultados">
      <div><label for="fl-site">Presença de site</label><select id="fl-site"><option value="">Todas</option><option value="sem">Site não identificado</option><option value="terceiros">Rede social / plataforma gratuita</option><option value="proprio">Site próprio</option></select></div>
      <div><label for="fl-contato">Contato</label><select id="fl-contato"><option value="">Todos</option><option value="telefone">Com telefone</option><option value="whatsapp">Com WhatsApp (celular)</option></select></div>
      <div><label for="fl-situacao">Situação do lead</label><select id="fl-situacao"><option value="">Todas</option><option value="nao_salvo">Não salvos</option><option value="salvo">Salvos</option><option value="pendente">Pendente</option><option value="realizado">Contato realizado</option><option value="interessado">Interessado</option><option value="descartado">Descartado</option></select></div>
    </div>
    <div class="leads" id="lista-leads"></div>
    <div class="more">${ultimo.continuacao ? `<button class="btn" id="btn-mais" type="button">${icon("refresh")} Carregar mais (usa 1 pesquisa)</button>` : `<span class="small muted">Fim dos resultados disponíveis para esta busca.</span>`}</div>
    <details class="small"><summary>Sobre estes dados</summary><ul class="muted">${(ultimo.avisos || []).map((a) => `<li>${esc(a)}</li>`).join("")}</ul></details>
    <p class="attrib">Dados de empresas: Google Maps</p>`;

  if (manter.s) $("#fl-site").value = manter.s;
  if (manter.c) $("#fl-contato").value = manter.c;
  if (manter.t) $("#fl-situacao").value = manter.t;
  ["#fl-site", "#fl-contato", "#fl-situacao"].forEach((s) => $(s).addEventListener("change", pintarLista));
  $("#btn-mais")?.addEventListener("click", () => executar(true));
  pintarLista();
  etapas();
}

function cartao(l, i) {
  const t = l.temperatura || {}, o = l.oportunidade || {};
  const salvo = estado.leads.get(l.id);
  const conf = { alta: "confiança alta", media: "confiança média", baixa: "confiança baixa" }[o.confianca] || "";
  return `<article class="lead t-${esc(t.nivel)}" aria-label="${esc(l.nome)}">
    <div class="lead-head"><div><h3>${esc(l.nome)}</h3><p class="muted small">${esc(l.categoria || "Categoria não informada")} · encontrado em ${esc(dataBR(l.encontradoEm))}</p></div>
      <div class="chips">${l.cidadeVizinha ? `<span class="chip">${esc(l.cidade)}</span>` : ""}<span class="chip ${esc(t.nivel)}">${esc(({ quente: "Quente", morno: "Morno", frio: "Frio" })[t.nivel] || "—")}${t.preliminar ? " · preliminar" : ""}</span>${salvo ? `<span class="chip">${icon("check")} ${esc(rotuloSituacao(salvo.status))}</span>` : ""}</div></div>
    <div class="info">${linhasInfo(l)}</div>
    <div class="opp"><b>${esc(o.rotulo || "")}</b> <span class="muted small">(${esc(conf)})</span><ul>${(o.motivos || []).map((m) => `<li>${esc(m)}</li>`).join("")}</ul></div>
    <details><summary>Por que esta temperatura?</summary><div class="crit">${(t.criterios || []).map((c) => `<div>${esc(c.rotulo)} <b>+${esc(c.pontos)}</b> <span class="muted">/ ${esc(c.maximo)}</span></div>`).join("")}<div><b>Total: ${esc(t.pontos)} pontos</b> <span class="muted">(quente ≥ 75 · morno ≥ 45)${t.preliminar ? " — avaliação preliminar: parte dos sinais não pôde ser verificada." : ""}</span></div></div></details>
    <div class="actions">${botoesContato(l, i)}
      <button class="btn btn-sm" type="button" data-gerar="${i}">${icon("sparkles")} Gerar prompt</button>
      <button class="btn btn-primary btn-sm" type="button" data-salvar="${i}" ${salvo ? "disabled" : ""}>${icon("bookmark")} ${salvo ? "Salvo" : "Salvar lead"}</button></div>
  </article>`;
}

function pintarLista() {
  visiveis = filtrar(ultimo.empresas);
  const box = $("#lista-leads");
  box.innerHTML = visiveis.length ? visiveis.map(cartao).join("") : vazio("search", "Nenhuma empresa com esses filtros", "Ajuste os filtros acima para ver mais resultados.");
  $$("[data-copiar]", box).forEach((b) => b.addEventListener("click", () => acaoCopiar(visiveis[+b.dataset.copiar])));
  $$("[data-gerar]", box).forEach((b) => b.addEventListener("click", () => prepararGerador(visiveis[+b.dataset.gerar], ultimo.params.servico)));
  $$("[data-salvar]", box).forEach((b) => b.addEventListener("click", async () => {
    const l = visiveis[+b.dataset.salvar];
    b.disabled = true;
    try {
      const novo = await salvarLead(estado.user.uid, l, ultimo.params.servico);
      toast(novo ? "Lead salvo em Meus leads." : "Este lead já estava salvo.");
    } catch (e) {
      b.disabled = false;
      toast(e?.code === "permission-denied" ? "O banco recusou salvar o lead. Confira as regras do Firestore." : e?.code === "unavailable" ? "Sem conexão. Tente salvar novamente." : "Não foi possível salvar o lead.", "err");
    }
  }));
}
