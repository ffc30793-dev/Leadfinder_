// Integração com a Cakto (pagamentos) — SOMENTE no servidor.
//
// ATENÇÃO: este módulo foi escrito SEM acesso à documentação oficial da Cakto (ambiente sem internet).
// Os nomes de eventos e campos abaixo são a melhor suposição e ficam concentrados neste arquivo para
// serem conferidos com a documentação oficial e com um payload real de teste ANTES de ativar vendas.
// Nada aqui foi testado contra a Cakto de verdade.

import crypto from "node:crypto";
import { CICLO_DIAS, planoValido } from "./plans.js";

// ---- Suposições a conferir na documentação oficial ----
export const EVENTOS = {
  ativar: ["purchase_approved", "subscription_created"],
  renovar: ["subscription_renewed"],
  cancelar: ["subscription_canceled", "subscription_cancelled"],
  reembolsar: ["refund", "chargeback", "purchase_refunded"]
};

function comparacaoSegura(a, b) {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

/**
 * Verifica a autenticidade. Aceita (qualquer uma):
 *  1) campo "secret" no corpo igual ao CAKTO_WEBHOOK_SECRET;
 *  2) cabeçalho (CAKTO_SIGNATURE_HEADER, padrão x-cakto-signature) com HMAC-SHA256 hex do corpo bruto.
 * Sem CAKTO_WEBHOOK_SECRET configurado, nenhum evento é aceito.
 */
export function verificarAutenticidade({ corpo, corpoBruto, cabecalhos, env }) {
  const segredo = String(env.CAKTO_WEBHOOK_SECRET || "");
  if (!segredo) return { ok: false, motivo: "nao_configurado" };

  if (corpo && typeof corpo === "object" && comparacaoSegura(corpo.secret, segredo)) return { ok: true, metodo: "secret_no_corpo" };

  const nomeCab = String(env.CAKTO_SIGNATURE_HEADER || "x-cakto-signature").toLowerCase();
  const assinatura = String(cabecalhos?.[nomeCab] || "").replace(/^sha256=/i, "");
  if (assinatura && corpoBruto) {
    const esperado = crypto.createHmac("sha256", segredo).update(corpoBruto).digest("hex");
    if (comparacaoSegura(assinatura.toLowerCase(), esperado)) return { ok: true, metodo: "hmac" };
  }
  return { ok: false, motivo: "assinatura_invalida" };
}

function lista(valor) {
  return String(valor || "").split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Extrai do payload o que importa. Campos ausentes viram "" (nunca são inventados).
 * O mapeamento de produto -> plano usa CAKTO_PRODUCT_PRO / CAKTO_PRODUCT_MAX (ids separados por vírgula);
 * produto desconhecido NUNCA ativa plano.
 */
export function interpretarEvento(payload, env) {
  const nome = String(payload?.event ?? payload?.evento ?? payload?.type ?? "").toLowerCase();
  const d = payload?.data ?? payload ?? {};
  const produtoIds = [d.product?.id, d.offer?.id, d.product_id, d.offer_id, d.productId].filter(Boolean).map(String);

  let plano = "";
  if (produtoIds.some((id) => lista(env.CAKTO_PRODUCT_PRO).includes(id))) plano = "PRO";
  else if (produtoIds.some((id) => lista(env.CAKTO_PRODUCT_MAX).includes(id))) plano = "MAX";

  let tipo = "ignorar";
  if (EVENTOS.ativar.includes(nome)) tipo = "ativar";
  else if (EVENTOS.renovar.includes(nome)) tipo = "renovar";
  else if (EVENTOS.cancelar.includes(nome)) tipo = "cancelar";
  else if (EVENTOS.reembolsar.includes(nome)) tipo = "reembolsar";

  const status = String(d.status ?? "").toLowerCase();
  // compra "aprovada" precisa vir como paga quando o campo de status existir
  if (tipo === "ativar" && status && !["paid", "approved", "active", "authorized"].includes(status)) tipo = "ignorar";

  const idEvento = String(d.id ?? d.refId ?? d.order?.id ?? d.subscription?.id ?? payload?.id ?? "");
  const email = String(d.customer?.email ?? d.customer_email ?? d.email ?? "").trim().toLowerCase();

  return { nome, tipo, idEvento, email, produtoIds, plano };
}

export function chaveIdempotencia(evento) {
  return crypto.createHash("sha256").update(`cakto|${evento.nome}|${evento.idEvento}|${evento.email}`).digest("hex");
}

/**
 * Aplica o evento a uma conta e devolve os campos novos (função pura).
 * - ativar/renovar: plano ativo por CICLO_DIAS a partir de agora (a tolerância é aplicada na leitura).
 * - cancelar: mantém o acesso até o fim do período já pago.
 * - reembolsar: volta imediatamente para o plano gratuito.
 */
export function aplicarEvento(conta, evento, agora) {
  const base = { updatedAt: agora };
  const ultimoEvento = evento.idEvento;

  if (evento.tipo === "ativar" || evento.tipo === "renovar") {
    if (!evento.plano) return null;
    const renovaEm = new Date(agora.getTime() + CICLO_DIAS * 86400000);
    return { ...base, plano: planoValido(evento.plano), assinatura: { status: "ativa", provedor: "cakto", renovaEm, ultimoEvento } };
  }
  if (evento.tipo === "cancelar") {
    if (!conta?.assinatura) return null;
    return { ...base, assinatura: { ...conta.assinatura, status: "cancelada", ultimoEvento } };
  }
  if (evento.tipo === "reembolsar") {
    return { ...base, plano: "FREE", assinatura: { ...(conta?.assinatura || {}), status: "reembolsada", provedor: "cakto", ultimoEvento } };
  }
  return null;
}

/** Resumo do payload para auditoria. NUNCA guarda o campo "secret". */
export function resumoParaAuditoria(payload, evento) {
  return {
    evento: evento.nome,
    idEvento: evento.idEvento,
    produtoIds: evento.produtoIds,
    status: String(payload?.data?.status ?? payload?.status ?? ""),
    valor: payload?.data?.amount ?? payload?.data?.baseAmount ?? null
  };
}
