import { depsReais, autenticar, erro, responder } from "./_lib/deps.js";
import { planoValido } from "./_lib/plans.js";

export function criarHandlerTestPlan(deps) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return erro(res, 405, "Use POST.", "metodo");
    }

    if (deps.env.LEADFINDER_TEST_MODE !== "true") {
      return erro(res, 404, "Rota indisponível.", "indisponivel");
    }

    const usuario = await autenticar(req, deps);
    if (!usuario) {
      return erro(res, 401, "Sessão inválida. Entre novamente.", "nao_autenticado");
    }

    const plano = String(req.body?.plano || "").toUpperCase();

    if (!["FREE", "PRO", "MAX"].includes(plano) || planoValido(plano) !== plano) {
      return erro(res, 400, "Plano inválido. Use FREE, PRO ou MAX.", "plano_invalido");
    }

    try {
      const ref = deps.db.collection("accounts").doc(usuario.uid);

      await deps.db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);

        const dados = {
          plano,
          assinatura: plano === "FREE"
            ? null
            : {
                status: "ativa",
                renovaEm: new Date(Date.now() + 30 * 86400000),
                modoTeste: true,
              },
          updatedAt: deps.now(),
        };

        if (snap.exists) {
          tx.update(ref, dados);
        } else {
          tx.set(ref, {
            ...dados,
            uso: { dia: "", contagem: 0 },
            createdAt: deps.now(),
          });
        }
      });

      return responder(res, 200, {
        sucesso: true,
        plano,
        mensagem: `Plano ${plano} ativado para testes.`,
      });
    } catch (e) {
      console.error("Erro ao alterar plano de teste:", e?.message);
      return erro(res, 500, "Não foi possível alterar o plano.", "interno");
    }
  };
}

export default async function handler(req, res) {
  try {
    return await criarHandlerTestPlan(await depsReais())(req, res);
  } catch (e) {
    console.error("Falha ao iniciar rota de teste:", e?.message);
    return erro(
      res,
      e?.codigo === "config" ? 503 : 500,
      "Servidor sem configuração do Firebase Admin.",
      e?.codigo || "interno"
    );
  }
      }
