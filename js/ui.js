// Utilidades de interface: escape, ícones, avisos, estados (carregando / vazio / erro).
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Só aceita http(s) em links vindos de dados externos. */
export function urlSegura(u) {
  try {
    const x = new URL(String(u));
    return x.protocol === "https:" || x.protocol === "http:" ? x.toString() : "";
  } catch { return ""; }
}

export const icon = (n, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;

export function toast(msg, tipo = "ok") {
  const box = $("#toasts");
  if (!box) return;
  const t = document.createElement("div");
  t.className = `toast ${tipo}`;
  t.setAttribute("role", tipo === "err" ? "alert" : "status");
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), tipo === "err" ? 7000 : 3500);
}

export const carregando = (txt = "Carregando…") =>
  `<div class="state" role="status"><div class="spinner"></div><p class="muted">${esc(txt)}</p></div>`;

export const vazio = (ic, titulo, texto, acao = "") =>
  `<div class="state">${icon(ic)}<h3>${esc(titulo)}</h3><p class="muted">${esc(texto)}</p>${acao}</div>`;

export const erroBox = (msg, idRetry = "") =>
  `<div class="state err" role="alert">${icon("alert")}<h3>Algo deu errado</h3><p class="muted">${esc(msg)}</p>${idRetry ? `<button class="btn btn-sm" id="${idRetry}" type="button">${icon("refresh")} Tentar novamente</button>` : ""}</div>`;

export function dataBR(v) {
  const d = v?.toDate ? v.toDate() : v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("pt-BR") : "—";
}

export async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); return true; }
  catch {
    const ta = document.createElement("textarea");
    ta.value = texto; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export function mensagemFirebase(e) {
  const c = e?.code || "";
  const m = {
    "permission-denied": "O banco de dados recusou a operação. Confira se as regras do Firestore foram publicadas (firestore.rules).",
    unavailable: "Sem conexão com o servidor. Verifique sua internet e tente novamente.",
    "auth/network-request-failed": "Sem conexão. Verifique sua internet.",
    "auth/email-already-in-use": "Este e-mail já está cadastrado. Entre na sua conta.",
    "auth/invalid-email": "Digite um e-mail válido.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/wrong-password": "E-mail ou senha incorretos.",
    "auth/user-not-found": "Conta não encontrada.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente novamente.",
    "auth/operation-not-allowed": "Ative o login por e-mail e senha no Firebase Authentication."
  };
  return m[c] || "Não foi possível concluir. Tente novamente.";
}
