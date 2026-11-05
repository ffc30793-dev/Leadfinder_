// Chamadas às funções do servidor (/api). O token do Firebase vai no cabeçalho; limites e plano são decididos lá.
import { auth } from "./firebase.js";

export class ApiError extends Error {
  constructor(msg, status, dados) { super(msg); this.status = status; this.dados = dados || {}; this.codigo = dados?.codigo || ""; }
}

export async function api(caminho, { metodo = "GET", corpo, timeoutMs = 45000 } = {}) {
  const u = auth.currentUser;
  if (!u) throw new ApiError("Sessão expirada. Entre novamente.", 401);
  const token = await u.getIdToken();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let resp;
  try {
    resp = await fetch(caminho, {
      method: metodo,
      signal: ctl.signal,
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, ...(corpo ? { "Content-Type": "application/json" } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined
    });
  } catch (e) {
    throw new ApiError(e?.name === "AbortError" ? "A busca demorou demais. Tente novamente." : "Sem conexão com o servidor.", 0);
  } finally { clearTimeout(timer); }
  let dados = {};
  try { dados = await resp.json(); } catch { /* resposta sem JSON */ }
  if (!resp.ok || dados.sucesso === false) throw new ApiError(dados.erro || `Erro ${resp.status}.`, resp.status, dados);
  return dados;
}
