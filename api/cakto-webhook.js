// POST /api/cakto-webhook — confirmação de pagamento da Cakto.
// O plano só muda aqui, depois de validar o evento. O redirecionamento do navegador nunca libera plano.
//
// Coleções (somente servidor): paymentEvents/{hash} — histórico para auditoria e controle de duplicidade.

import { depsReais, erro, responder } from "./_lib/deps.js";
import { aplicarEvento, chaveIdempotencia, interpretarEvento, resumoParaAuditoria, verificarAutenticidade } from "./_lib/cakto.js";

export function criarHandlerWebhook(deps) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return erro(res, 405, "Use POST.", "metodo");
    }

    // corpo bruto só existe se a plataforma não tiver convertido o JSON; usado apenas para HMAC
    const corpoBruto = Buffer.isBuffer(req.body) ? req.body : typeof req.body === "string" ? Buffer.from(req.body) : null;
    let payload = req.body;
    if (corpoBruto) {
      try { payload = JSON.parse(corpoBruto.toString("utf8")); } catch { return erro(res, 400, "JSON inválido.", "json_invalido"); }
    }
    if (!payload || typeof payload !== "object") return erro(res, 400, "Corpo ausente.", "json_invalido");

    const auth = verificarAutenticidade({ corpo: payload, corpoBruto, cabecalhos: req.headers || {}, env: deps.env });
    if (!auth.ok) {
      if (auth.motivo === "nao_configurado") return erro(res, 503, "Webhook não configurado (CAKTO_WEBHOOK_SECRET ausente).", "config");
      return erro(res, 401, "Assinatura inválida.", "assinatura_invalida");
    }

    const evento = interpretarEvento(payload, deps.env);
    const agora = deps.now();
    const chave = chaveIdempotencia(evento);
    const refEvento = deps.db.collection("paymentEvents").doc(chave);
    const auditoriaBase = { provedor: "cakto", recebidoEm: agora, email: evento.email, ...resumoParaAuditoria(payload, evento) };

    try {
      // Eventos sem efeito (tipo desconhecido, sem id ou sem e-mail) só entram no histórico.
      if (evento.tipo === "ignorar" || !evento.idEvento || !evento.email) {
        await deps.db.runTransaction(async (tx) => {
          const s = await tx.get(refEvento);
          if (!s.exists) tx.set(refEvento, { ...auditoriaBase, status: "ignorado", motivo: evento.tipo === "ignorar" ? "evento_sem_efeito" : "dados_incompletos" });
        });
        return responder(res, 200, { sucesso: true, processado: false, motivo: "ignorado" });
      }

      // Produto desconhecido nunca ativa plano (ativar/renovar).
      if ((evento.tipo === "ativar" || evento.tipo === "renovar") && !evento.plano) {
        await deps.db.runTransaction(async (tx) => {
          const s = await tx.get(refEvento);
          if (!s.exists) tx.set(refEvento, { ...auditoriaBase, status: "produto_desconhecido" });
        });
        return responder(res, 200, { sucesso: true, processado: false, motivo: "produto_desconhecido" });
      }

      // Localiza a conta pelo e-mail do comprador (mesmo e-mail do cadastro no LeadFinder).
      let uid = "";
      try {
        uid = (await deps.getUserByEmail(evento.email))?.uid || "";
      } catch (e) {
        if (e?.code !== "auth/user-not-found") throw e;
      }

      if (!uid) {
        await deps.db.runTransaction(async (tx) => {
          const s = await tx.get(refEvento);
          if (!s.exists) tx.set(refEvento, { ...auditoriaBase, status: "sem_usuario" });
        });
        return responder(res, 200, { sucesso: true, processado: false, motivo: "sem_usuario" });
      }

      const refConta = deps.db.collection("accounts").doc(uid);
      const resultado = await deps.db.runTransaction(async (tx) => {
        const [sEvento, sConta] = await Promise.all([tx.get(refEvento), tx.get(refConta)]);
        if (sEvento.exists) return { duplicado: true };

        const conta = sConta.exists ? sConta.data() : null;
        const novo = aplicarEvento(conta, evento, agora);
        if (!novo) {
          tx.set(refEvento, { ...auditoriaBase, uid, status: "sem_alteracao" });
          return { duplicado: false, alterado: false };
        }
        if (sConta.exists) tx.update(refConta, novo);
        else tx.set(refConta, { plano: "FREE", assinatura: null, uso: { dia: "", contagem: 0 }, createdAt: agora, ...novo });
        tx.set(refEvento, { ...auditoriaBase, uid, status: "aplicado", tipo: evento.tipo, planoResultante: novo.plano || conta?.plano || "FREE" });
        return { duplicado: false, alterado: true };
      });

      return responder(res, 200, { sucesso: true, processado: !resultado.duplicado && resultado.alterado !== false, duplicado: Boolean(resultado.duplicado) });
    } catch (e) {
      // 500 faz a Cakto tentar de novo; a idempotência impede aplicar duas vezes.
      console.error("Erro no webhook da Cakto:", e?.message);
      return erro(res, 500, "Erro ao processar o evento.", "interno");
    }
  };
}

export default async function handler(req, res) {
  try {
    return await criarHandlerWebhook(await depsReais())(req, res);
  } catch (e) {
    console.error("Falha ao iniciar o webhook:", e?.message);
    return erro(res, e?.codigo === "config" ? 503 : 500, "Servidor sem configuração do Firebase Admin.", e?.codigo || "interno");
  }
}
