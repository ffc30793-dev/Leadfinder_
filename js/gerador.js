// Gerador de conteúdo: prompts profissionais por serviço, a partir de modelos estruturados (sem IA externa).
import { esc, icon, $, $$, toast, copiar } from "./ui.js";
import { SERVICOS_GERADOR, CAMPOS_COMUNS, gerarPrompt } from "./gerador-modelos.js";
import { SEGMENTOS } from "../shared/catalog.js";

let servico = "criacao-sites";
let dados = {};

function lerPrefill() {
  try {
    const p = JSON.parse(sessionStorage.getItem("lf_prefill_gerador") || "null");
    sessionStorage.removeItem("lf_prefill_gerador");
    return p;
  } catch { return null; }
}

function campoHtml(c) {
  const id = `g-${c.id}`;
  const val = dados[c.id] ?? "";
  const dica = c.dica ? `<p class="small muted" style="margin-top:3px">${esc(c.dica)}</p>` : "";
  if (c.tipo === "area") return `<div><label for="${id}">${esc(c.rotulo)}</label><textarea id="${id}" data-c="${c.id}">${esc(val)}</textarea>${dica}</div>`;
  if (c.tipo === "select") return `<div><label for="${id}">${esc(c.rotulo)}</label><select id="${id}" data-c="${c.id}"><option value="">Não definido</option>${c.opcoes.map((o) => `<option ${val === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>`;
  if (c.tipo === "checks") {
    const marcados = Array.isArray(val) ? val : [];
    return `<fieldset style="border:0;padding:0;margin:14px 0 0"><legend style="font-size:13px;font-weight:600;color:#cfd5f5;margin-bottom:6px">${esc(c.rotulo)}</legend><div class="checks">${c.opcoes.map((o, i) => `<label><input type="checkbox" data-ck="${c.id}" value="${esc(o)}" ${marcados.includes(o) ? "checked" : ""}> ${esc(o)}</label>`).join("")}</div></fieldset>`;
  }
  const extra = c.id === "segmento" ? ` list="lista-segmentos"` : "";
  return `<div><label for="${id}">${esc(c.rotulo)}${c.obrigatorio ? " *" : ""}</label><input id="${id}" data-c="${c.id}" value="${esc(val)}" ${c.curto ? 'maxlength="2"' : ""}${extra}>${dica}</div>`;
}

function coletar() {
  $$("[data-c]").forEach((el) => { dados[el.dataset.c] = el.value; });
  const grupos = {};
  $$("[data-ck]").forEach((el) => { (grupos[el.dataset.ck] ||= []); if (el.checked) grupos[el.dataset.ck].push(el.value); });
  Object.assign(dados, grupos);
}

function desenhar() {
  const s = SERVICOS_GERADOR[servico];
  $("#g-form").innerHTML = `
    <div class="form-grid">${CAMPOS_COMUNS.map(campoHtml).join("")}</div>
    <h3 style="margin:22px 0 4px">Detalhes de ${esc(s.nome.toLowerCase())}</h3>
    <div class="form-grid">${s.campos.map(campoHtml).join("")}</div>
    <div style="margin-top:20px"><button class="btn btn-primary" id="g-gerar" type="button">${icon("sparkles")} Gerar prompt</button></div>`;
  $("#g-gerar").addEventListener("click", gerar);
}

function gerar() {
  coletar();
  if (!String(dados.nome || "").trim() || !String(dados.segmento || "").trim()) {
    toast("Informe pelo menos o nome do negócio e o segmento.", "err");
    return;
  }
  const texto = gerarPrompt(servico, dados);
  $("#g-saida").value = texto;
  $("#g-saida-box").classList.remove("hidden");
  $("#g-contagem").textContent = `${texto.length} caracteres`;
  $("#g-saida").focus();
  $("#g-saida-box").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

export function render(el) {
  const pre = lerPrefill();
  if (pre) {
    if (SERVICOS_GERADOR[pre.servico]) servico = pre.servico;
    dados = { ...dados, nome: pre.nome, segmento: pre.categoria, cidade: pre.cidade, uf: pre.uf, endereco: pre.endereco, telefone: pre.telefone, instagram: pre.site, siteAtual: pre.site };
  }
  el.innerHTML = `
    <div class="page-head"><div><h1>Gerador de conteúdo</h1><p class="muted">Gere prompts profissionais e prontos para copiar, específicos para cada serviço.</p></div></div>
    <div class="notice" style="margin-bottom:16px">${icon("info")} Este gerador monta prompts a partir de <b>modelos estruturados</b>: não chama nenhuma IA e não envia seus dados para fora. Cole o resultado na ferramenta de IA que você usa.</div>
    <datalist id="lista-segmentos">${SEGMENTOS.map((s) => `<option value="${esc(s.nome)}">`).join("")}</datalist>
    <div class="card">
      <label for="g-servico">Serviço</label>
      <select id="g-servico">${Object.entries(SERVICOS_GERADOR).map(([id, s]) => `<option value="${id}" ${id === servico ? "selected" : ""}>${esc(s.nome)}</option>`).join("")}</select>
      <div id="g-form"></div>
    </div>
    <div class="card hidden" id="g-saida-box" style="margin-top:16px">
      <div class="page-head" style="margin-bottom:8px"><h2>Seu prompt</h2><span class="small muted" id="g-contagem"></span></div>
      <textarea class="out" id="g-saida" aria-label="Prompt gerado" readonly></textarea>
      <div class="actions" style="margin-top:12px"><button class="btn btn-primary" id="g-copiar" type="button">${icon("copy")} Copiar prompt</button><button class="btn" id="g-sel" type="button">Selecionar texto</button></div>
    </div>`;
  desenhar();
  $("#g-servico").addEventListener("change", (e) => { coletar(); servico = e.target.value; $("#g-saida-box").classList.add("hidden"); desenhar(); });
  $("#g-copiar").addEventListener("click", async () => {
    (await copiar($("#g-saida").value)) ? toast("Prompt copiado.") : toast("Não foi possível copiar. Use “Selecionar texto”.", "err");
  });
  $("#g-sel").addEventListener("click", () => { $("#g-saida").focus(); $("#g-saida").select(); });
  if (pre) gerar();
}
