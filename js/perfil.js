// Perfil do usuário em users/{uid}. Plano e limites NÃO ficam aqui (ficam em accounts/{uid}, só servidor).
import { db, doc, getDoc, setDoc, updateDoc, serverTimestamp } from "./firebase.js";
import { normalizarTelefoneBR } from "../shared/phone.js";

export function validarPerfil({ nome, telefone }) {
  const n = String(nome || "").trim();
  const t = String(telefone || "").trim();
  if (n.length < 2) return "Informe seu nome (mínimo 2 letras).";
  if (n.length > 100) return "O nome pode ter no máximo 100 caracteres.";
  if (t && !normalizarTelefoneBR(t).valido) return "Telefone inválido. Use DDD + número, ex.: (86) 99999-0000.";
  if (t.length > 20) return "Telefone muito longo.";
  return "";
}

const nomePadrao = (u) => (u.displayName || (u.email || "").split("@")[0] || "Usuário").slice(0, 100);
const paraPerfil = (d) => ({ nome: d.nome || "", email: d.email || "", telefone: d.telefone || "", createdAt: d.createdAt || d.criadoEm || null });

/** Cadastro novo: grava o documento ANTES de qualquer redirecionamento. */
export async function criarPerfil(user, { nome, telefone }) {
  const ref = doc(db, "users", user.uid);
  await setDoc(ref, { nome: nome.trim(), email: user.email, telefone: (telefone || "").trim(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

/**
 * Conta antiga (já existia no Authentication): cria o documento se faltar, ou completa createdAt.
 * Nunca toca em plano/créditos legados.
 */
export async function garantirPerfil(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { nome: nomePadrao(user), email: user.email, telefone: "", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return { ...(paraPerfil({ nome: nomePadrao(user), email: user.email })), novo: true };
  }
  const d = snap.data();
  if (!d.createdAt || !d.nome) {
    await updateDoc(ref, { nome: d.nome || nomePadrao(user), createdAt: d.createdAt || serverTimestamp(), updatedAt: serverTimestamp() });
    const depois = await getDoc(ref);
    return paraPerfil(depois.data());
  }
  return paraPerfil(d);
}

export async function salvarPerfil(user, { nome, telefone }) {
  const erro = validarPerfil({ nome, telefone });
  if (erro) throw Object.assign(new Error(erro), { validacao: true });
  const ref = doc(db, "users", user.uid);
  await updateDoc(ref, { nome: nome.trim(), telefone: (telefone || "").trim(), updatedAt: serverTimestamp() });
  return paraPerfil((await getDoc(ref)).data());
}
