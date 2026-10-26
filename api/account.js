// GET /api/account — plano efetivo, uso do dia e dados públicos dos planos.
// Os números vêm do servidor; o navegador apenas exibe.

import { depsReais, autenticar, erro, responder } from "./_lib/deps.js";
import { lerConta, resumoConta } from "./_lib/account.js";
import { planosPublicos } from "./_lib/plans.js";

export function criarHandlerConta(deps) {
  return async function handler(req, res) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return erro(res, 405, "Use GET.", "metodo");
    }
    const usuario = await autenticar(req, deps);
    if (!usuario) return erro(res, 401, "Sessão inválida. Entre novamente.", "nao_autenticado");

    try {
      const agora = deps.now();
      const conta = await lerConta(deps.db, usuario.uid);
      return responder(res, 200, {
        sucesso: true,
        ...resumoConta(conta, agora),
        planos: planosPublicos(deps.env),
        checkoutConfigurado: planosPublicos(deps.env).some((p) => p.checkoutUrl)
      });
    } catch (e) {
      console.error("Erro em /api/account:", e?.message);
      return erro(res, 500, "Não foi possível carregar os dados do plano.", "interno");
    }
  };
}

export default async function handler(req, res) {
  try {
    return await criarHandlerConta(await depsReais())(req, res);
  } catch (e) {
    console.error("Falha ao iniciar /api/account:", e?.message);
    return erro(res, e?.codigo === "config" ? 503 : 500, "Servidor sem configuração do Firebase Admin.", e?.codigo || "interno");
  }
}
