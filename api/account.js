// Conta do usuário (coleção "accounts", escrita SOMENTE pelo servidor via Admin SDK).
// O cliente só pode LER o próprio documento; plano, assinatura e uso nunca são gravados pelo navegador.
//
// accounts/{uid} = {
//   plano: "FREE" | "PRO" | "MAX",
//   assinatura: { status, provedor, renovaEm, ultimoEvento } | null,
//   uso: { dia: "YYYY-MM-DD", contagem: number },
//   createdAt, updatedAt
// }

import { PLANOS, planoValido, TOLERANCIA_DIAS } from "./plans.js";

const FUSO = "America/Sao_Paulo";

/** Data civil (YYYY-MM-DD) no fuso de Brasília. O limite diário renova à meia-noite local. */
export function diaLocal(data) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(data);
}

/** Próxima meia-noite de Brasília (UTC-3, sem horário de verão atualmente). */
export function proximaRenovacaoDiaria(agora) {
  const dia = diaLocal(agora);
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + 1, 3, 0, 0));
}

function paraData(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return valor;
  if (typeof valor.toDate === "function") return valor.toDate(); // Timestamp do Firestore
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Plano que realmente vale agora. Plano pago só vale com assinatura ativa (ou cancelada,
 * mas ainda dentro do período já pago) e dentro da data de renovação + tolerância.
 */
export function planoEfetivo(conta, agora) {
  const plano = planoValido(conta?.plano);
  if (plano === "FREE") return { plano: "FREE", status: "gratuito", renovaEm: null };

  const ass = conta?.assinatura;
  const renovaEm = paraData(ass?.renovaEm);
  if (!ass || !renovaEm) return { plano: "FREE", status: "sem_assinatura", renovaEm: null };

  const limite = new Date(renovaEm.getTime() + TOLERANCIA_DIAS * 86400000);
  const dentroDoPrazo = agora.getTime() <= limite.getTime();

  if (ass.status === "ativa" && dentroDoPrazo) return { plano, status: "ativa", renovaEm };
  if (ass.status === "cancelada" && agora.getTime() <= renovaEm.getTime()) {
    return { plano, status: "cancelada_ate_fim_do_periodo", renovaEm };
  }
  if (ass.status === "reembolsada") return { plano: "FREE", status: "reembolsada", renovaEm: null };
  return { plano: "FREE", status: "expirada", renovaEm };
}

export function usoDoDia(conta, agora) {
  const hoje = diaLocal(agora);
  return conta?.uso?.dia === hoje ? Number(conta.uso.contagem || 0) : 0;
}

export async function lerConta(db, uid) {
  const snap = await db.collection("accounts").doc(uid).get();
  return snap.exists ? snap.data() : null;
}

/**
 * Reserva `custo` pesquisas de forma atômica. Se o limite diário estourar, nada é gravado.
 * Retorna { ok, plano, limite, usadas, restantes, dia }.
 */
export async function reservarPesquisa(db, uid, { custo, agora }) {
  const ref = db.collection("accounts").doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const conta = snap.exists ? snap.data() : null;
    const efetivo = planoEfetivo(conta, agora);
    const limite = PLANOS[efetivo.plano].limiteDiario;
    const dia = diaLocal(agora);
    const usadas = usoDoDia(conta, agora);

    if (usadas + custo > limite) {
      return { ok: false, plano: efetivo.plano, limite, usadas, restantes: Math.max(0, limite - usadas), dia };
    }

    const novo = { uso: { dia, contagem: usadas + custo }, updatedAt: agora };
    if (snap.exists) {
      tx.update(ref, novo);
    } else {
      tx.set(ref, { plano: "FREE", assinatura: null, ...novo, createdAt: agora });
    }
    return { ok: true, plano: efetivo.plano, limite, usadas: usadas + custo, restantes: limite - usadas - custo, dia };
  });
}

/** Devolve pesquisas reservadas quando a busca falha ou não traz nada novo. */
export async function devolverPesquisa(db, uid, { custo, dia, agora }) {
  const ref = db.collection("accounts").doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const uso = snap.data().uso;
    if (!uso || uso.dia !== dia) return; // virou o dia: nada a devolver
    tx.update(ref, { uso: { dia, contagem: Math.max(0, Number(uso.contagem || 0) - custo) }, updatedAt: agora });
  });
}

/** Resumo para a interface (/api/account). */
export function resumoConta(conta, agora) {
  const efetivo = planoEfetivo(conta, agora);
  const limite = PLANOS[efetivo.plano].limiteDiario;
  const usadas = usoDoDia(conta, agora);
  return {
    plano: efetivo.plano,
    nomePlano: PLANOS[efetivo.plano].nome,
    statusAssinatura: efetivo.status,
    renovacaoAssinatura: efetivo.renovaEm ? efetivo.renovaEm.toISOString() : null,
    pesquisas: {
      limite,
      usadas,
      disponiveis: Math.max(0, limite - usadas),
      renovaEm: proximaRenovacaoDiaria(agora).toISOString()
    }
  };
}
