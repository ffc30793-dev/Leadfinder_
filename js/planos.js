// Planos e assinatura. Valores, limites e links vêm do servidor (/api/account).
import { estado } from "./estado.js";
import { esc, icon, $, erroBox, urlSegura, dataBR } from "./ui.js";
import { rotuloStatus } from "./conta.js";
import { api } from "./api.js";

export async function render(el) {
  el.innerHTML = `<div class="page-head"><div><h1>Planos e assinatura</h1><p class="muted">Compare os planos e acompanhe o seu uso.</p></div></div><div id="planos-corpo"><div class="skeleton"></div></div>`;
  if (!estado.conta) {
    try { estado.conta = await api("/api/account"); estado.contaErro = ""; }
    catch (e) {
      estado.contaErro = e.message;
      $("#planos-corpo").innerHTML = erroBox(e.message, "planos-retentar");
      $("#planos-retentar").addEventListener("click", () => render(el));
      return;
    }
  }
  const c = estado.conta;
  const pct = Math.min(100, Math.round((c.pesquisas.usadas / c.pesquisas.limite) * 100));
  $("#planos-corpo").innerHTML = `
    <div class="card" style="margin-bottom:18px">
      <div class="page-head" style="margin-bottom:10px"><div><h2>Seu uso hoje</h2><p class="muted small">Plano ${esc(c.nomePlano)} · ${esc(rotuloStatus(c.statusAssinatura))}${c.renovacaoAssinatura ? " · renova em " + esc(dataBR(c.renovacaoAssinatura)) : ""}</p></div>
        <b>${esc(c.pesquisas.usadas)} / ${esc(c.pesquisas.limite)} pesquisas</b></div>
      <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="${esc(c.pesquisas.limite)}" aria-valuenow="${esc(c.pesquisas.usadas)}" aria-label="Pesquisas usadas hoje"><span style="width:${pct}%"></span></div>
      <p class="small muted" style="margin-top:8px">${esc(c.pesquisas.disponiveis)} disponíveis · o limite renova à meia-noite (horário de Brasília).</p>
    </div>
    <div class="plans">${c.planos.map((p) => planoHtml(p, c)).join("")}</div>
    ${c.checkoutConfigurado ? `<div class="notice" style="margin-top:16px">${icon("info")} Após o pagamento, o plano é liberado automaticamente por confirmação do servidor — pode levar alguns minutos. Use <b>o mesmo e-mail</b> da sua conta LeadFinder (${esc(estado.user.email)}) no checkout.</div>`
      : `<div class="notice warn" style="margin-top:16px">${icon("info")} O checkout ainda não foi configurado neste ambiente, por isso os planos pagos não podem ser contratados agora.</div>`}`;
}

function planoHtml(p, c) {
  const atual = p.id === c.plano;
  const preco = p.preco === 0 ? "R$ 0" : `R$ ${p.preco.toFixed(2).replace(".", ",")}`;
  let botao;
  if (atual) botao = `<button class="btn btn-block" disabled>Plano atual</button>`;
  else if (p.id === "FREE") botao = `<button class="btn btn-block" disabled>Plano gratuito</button>`;
  else if (urlSegura(p.checkoutUrl)) botao = `<a class="btn btn-primary btn-block" href="${esc(urlSegura(p.checkoutUrl))}" target="_blank" rel="noopener noreferrer">Assinar ${esc(p.nome)} ${icon("external")}</a>`;
  else botao = `<button class="btn btn-block" disabled aria-disabled="true">Checkout indisponível</button>`;
  return `<article class="card plan ${atual ? "atual" : ""}" aria-label="Plano ${esc(p.nome)}">
    <div><h2>${esc(p.nome)}</h2>${atual ? `<span class="chip" style="margin-top:6px">Seu plano</span>` : ""}</div>
    <div class="price">${esc(preco)} <small>/ mês</small></div>
    <ul><li>${icon("check")} <b>${esc(p.limiteDiario)} pesquisas por dia</b></li>${p.recursos.filter((r) => !/pesquisas por dia/.test(r)).map((r) => `<li>${icon("check")} ${esc(r)}</li>`).join("")}</ul>${botao}</article>`;
}
