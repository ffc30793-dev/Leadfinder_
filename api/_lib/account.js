import { PLANOS, planoValido, TOLERANCIA_DIAS } from "./plans.js";

const FUSO = "America/Sao_Paulo";

const MODO_TESTE =
  process.env.LEADFINDER_TEST_MODE === "true";

export function diaLocal(data) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
  }).format(data);
}

export function proximaRenovacaoDiaria(agora) {
  const [a, m, d] = diaLocal(agora).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + 1, 3, 0, 0));
}

function paraData(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return valor;
  if (typeof valor.toDate === "function") return valor.toDate();

  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

export function planoEfetivo(conta, agora) {
  const plano = planoValido(conta?.plano);

  // Modo de teste: libera o plano gravado na conta sem exigir Cakto.
  if (MODO_TESTE) {
    return {
      plano,
      status: "teste",
      renovaEm: null,
    };
  }

  if (plano === "FREE") {
    return {
      plano: "FREE",
      status: "gratuito",
      renovaEm: null,
    };
  }

  const assinatura = conta?.assinatura;
  const renovaEm = paraData(assinatura?.renovaEm);

  if (!assinatura || !renovaEm) {
    return {
      plano: "FREE",
      status: "sem_assinatura",
      renovaEm: null,
    };
  }

  const limite = new Date(
    renovaEm.getTime() + TOLERANCIA_DIAS * 86400000
  );

  if (
    assinatura.status === "ativa" &&
    agora.getTime() <= limite.getTime()
  ) {
    return { plano, status: "ativa", renovaEm };
  }

  if (
    assinatura.status === "cancelada" &&
    agora.getTime() <= renovaEm.getTime()
  ) {
    return {
      plano,
      status: "cancelada_ate_fim_do_periodo",
      renovaEm,
    };
  }

  if (assinatura.status === "reembolsada") {
    return {
      plano: "FREE",
      status: "reembolsada",
      renovaEm: null,
    };
  }

  return { plano: "FREE", status: "expirada", renovaEm };
}

export function usoDoDia(conta, agora) {
  const hoje = diaLocal(agora);

  return conta?.uso?.dia === hoje
    ? Number(conta.uso.contagem || 0)
    : 0;
}

export async function lerConta(db, uid) {
  const snap = await db.collection("accounts").doc(uid).get();
  return snap.exists ? snap.data() : null;
}

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
      return {
        ok: false,
        plano: efetivo.plano,
        limite,
        usadas,
        restantes: Math.max(0, limite - usadas),
        dia,
      };
    }

    const novo = {
      uso: { dia, contagem: usadas + custo },
      updatedAt: agora,
    };

    if (snap.exists) {
      tx.update(ref, novo);
    } else {
      tx.set(ref, {
        plano: "FREE",
        assinatura: null,
        ...novo,
        createdAt: agora,
      });
    }

    return {
      ok: true,
      plano: efetivo.plano,
      limite,
      usadas: usadas + custo,
      restantes: limite - usadas - custo,
      dia,
    };
  });
}

export async function devolverPesquisa(db, uid, { custo, dia, agora }) {
  const ref = db.collection("accounts").doc(uid);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;

    const uso = snap.data().uso;
    if (!uso || uso.dia !== dia) return;

    tx.update(ref, {
      uso: {
        dia,
        contagem: Math.max(
          0,
          Number(uso.contagem || 0) - custo
        ),
      },
      updatedAt: agora,
    });
  });
}

export function resumoConta(conta, agora) {
  const efetivo = planoEfetivo(conta, agora);
  const limite = PLANOS[efetivo.plano].limiteDiario;
  const usadas = usoDoDia(conta, agora);

  return {
    plano: efetivo.plano,
    nomePlano: PLANOS[efetivo.plano].nome,
    statusAssinatura: efetivo.status,
    renovacaoAssinatura: efetivo.renovaEm
      ? efetivo.renovaEm.toISOString()
      : null,
    pesquisas: {
      limite,
      usadas,
      disponiveis: Math.max(0, limite - usadas),
      renovaEm: proximaRenovacaoDiaria(agora).toISOString(),
    },
  };
}
