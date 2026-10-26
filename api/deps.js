// Dependências reais (Firebase Admin). Os handlers recebem "deps" por injeção para poderem ser testados
// sem rede: { db, verifyToken, getUserByEmail, fetch, env, now }.

let cache = null;

function lerContaDeServico(env) {
  const bruto = String(env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (!bruto) {
    const e = new Error("FIREBASE_SERVICE_ACCOUNT não configurada.");
    e.codigo = "config";
    throw e;
  }
  let texto = bruto;
  if (!bruto.startsWith("{")) texto = Buffer.from(bruto, "base64").toString("utf8"); // aceita JSON em base64
  const json = JSON.parse(texto);
  if (typeof json.private_key === "string") json.private_key = json.private_key.replace(/\\n/g, "\n");
  return json;
}

export async function depsReais() {
  if (cache) return cache;
  const env = process.env;
  const credencial = lerContaDeServico(env);

  const [{ initializeApp, getApps, cert }, { getAuth }, { getFirestore }] = await Promise.all([
    import("firebase-admin/app"),
    import("firebase-admin/auth"),
    import("firebase-admin/firestore")
  ]);

  const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(credencial) });
  const auth = getAuth(app);

  cache = {
    db: getFirestore(app),
    verifyToken: (token) => auth.verifyIdToken(token),
    getUserByEmail: (email) => auth.getUserByEmail(email),
    fetch: globalThis.fetch,
    env,
    now: () => new Date(),
    segredoCursor: String(env.CURSOR_SECRET || credencial.private_key || "")
  };
  return cache;
}

// ---------- helpers HTTP ----------

export function responder(res, status, corpo, cabecalhos = {}) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  for (const [k, v] of Object.entries(cabecalhos)) res.setHeader(k, v);
  return res.status(status).json(corpo);
}

export function erro(res, status, mensagem, codigo) {
  return responder(res, status, { sucesso: false, erro: mensagem, codigo });
}

export function lerCorpoJson(req) {
  const b = req.body;
  if (b == null || b === "") return {};
  if (typeof b === "object" && !Buffer.isBuffer(b)) return b;
  try {
    return JSON.parse(Buffer.isBuffer(b) ? b.toString("utf8") : String(b));
  } catch {
    const e = new Error("JSON inválido.");
    e.codigo = "json_invalido";
    throw e;
  }
}

/** Valida o ID token do Firebase enviado em "Authorization: Bearer ...". */
export async function autenticar(req, deps) {
  const cab = req.headers?.authorization || "";
  const token = cab.startsWith("Bearer ") ? cab.slice(7).trim() : "";
  if (!token) return null;
  try {
    const decodificado = await deps.verifyToken(token);
    return decodificado?.uid ? decodificado : null;
  } catch {
    return null;
  }
}
