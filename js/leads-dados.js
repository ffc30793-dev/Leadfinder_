// Leads salvos: users/{uid}/leads/{placeId}. O id do documento é o place_id, então não há duplicatas.
import { db, doc, setDoc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp } from "./firebase.js";
import { estado, notificar } from "./estado.js";

export const SITUACOES = [
  ["pendente", "Pendente"], ["realizado", "Contato realizado"], ["interessado", "Interessado"], ["descartado", "Descartado"]
];
export const rotuloSituacao = (s) => SITUACOES.find(([v]) => v === s)?.[1] || "Pendente";

const idSeguro = (id) => String(id).replace(/[\/\s]/g, "_").slice(0, 200);
const limpar = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const col = (uid) => collection(db, "users", uid, "leads");

export async function carregarLeads(uid) {
  const snap = await getDocs(col(uid));
  estado.leads = new Map();
  snap.forEach((d) => estado.leads.set(d.id, { id: d.id, ...d.data() }));
  estado.leadsCarregados = true;
  estado.leadsErro = "";
  notificar();
}

/** Converte um resultado da busca no documento salvo. Só copia dados que realmente vieram da fonte. */
export function paraDocumento(l, servico) {
  const id = idSeguro(l.id);
  return limpar({
    placeId: id,
    nome: String(l.nome || "Empresa").slice(0, 200),
    categoria: l.categoria || "",
    endereco: l.endereco || "",
    cidade: l.cidade || "",
    uf: l.uf || "",
    telefone: l.telefone || "",
    whatsapp: l.whatsapp || "",
    site: l.site || "",
    siteStatus: l.siteStatus || "",
    mapa: l.mapa || "",
    nota: typeof l.nota === "number" ? l.nota : null,
    avaliacoes: Number(l.avaliacoes || 0),
    servico: servico || l.oportunidade?.servico || "",
    oportunidade: l.oportunidade?.rotulo || "",
    temperatura: l.temperatura?.nivel || "",
    encontradoEm: l.encontradoEm || "",
    status: "pendente",
    observacoes: "",
    acompanhamento: ""
  });
}

export async function salvarLead(uid, resultado, servico) {
  const d = paraDocumento(resultado, servico);
  if (estado.leads.has(d.placeId)) return false; // já salvo: evita duplicar
  await setDoc(doc(db, "users", uid, "leads", d.placeId), { ...d, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  estado.leads.set(d.placeId, { id: d.placeId, ...d });
  notificar();
  return true;
}

export async function atualizarLead(uid, id, campos) {
  const permitido = {};
  for (const k of ["status", "observacoes", "acompanhamento"]) if (k in campos) permitido[k] = campos[k];
  const atual = estado.leads.get(id);
  if (!atual) throw new Error("Lead não encontrado.");
  const novo = { status: atual.status || "pendente", ...permitido };
  await updateDoc(doc(db, "users", uid, "leads", id), { ...novo, updatedAt: serverTimestamp() });
  estado.leads.set(id, { ...atual, ...novo });
  notificar();
}

export async function removerLead(uid, id) {
  await deleteDoc(doc(db, "users", uid, "leads", id));
  estado.leads.delete(id);
  notificar();
}

/** Importa leads que o usuário salvou antes no navegador (localStorage "lf_saved_leads"). */
export async function migrarLeadsLocais(uid) {
  let antigos = [];
  try { antigos = JSON.parse(localStorage.getItem("lf_saved_leads") || "[]"); } catch { antigos = []; }
  if (!Array.isArray(antigos) || !antigos.length) return 0;
  let n = 0;
  for (const a of antigos) {
    const id = a?.id || a?.nome;
    if (!id) continue;
    const doc1 = paraDocumento({
      id, nome: a.nome, endereco: a.endereco, telefone: a.telefone, site: a.site, mapa: a.mapa || a.maps,
      whatsapp: a.whatsapp && String(a.whatsapp).startsWith("https://wa.me/") ? a.whatsapp : ""
    }, "");
    if (estado.leads.has(doc1.placeId)) continue;
    await setDoc(doc(db, "users", uid, "leads", doc1.placeId), { ...doc1, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    estado.leads.set(doc1.placeId, { id: doc1.placeId, ...doc1 });
    n++;
  }
  localStorage.removeItem("lf_saved_leads"); // só chega aqui se nenhuma gravação falhou
  notificar();
  return n;
}
