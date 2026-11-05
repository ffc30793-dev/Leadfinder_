const KEY = "__fs";
const load = () => JSON.parse(localStorage.getItem(KEY) || "{}");
const save = (d) => localStorage.setItem(KEY, JSON.stringify(d));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const uid0 = () => JSON.parse(localStorage.getItem("__session") || "null")?.uid;

export const serverTimestamp = () => ({ __sentinel: true });
export const getFirestore = () => ({});
export const doc = (db, ...p) => ({ path: p.join("/"), id: p[p.length - 1] });
export const collection = (db, ...p) => ({ path: p.join("/") });
export const orderBy = (campo, dir) => ({ ordem: [campo, dir] });
export const limit = (n) => ({ lim: n });
export const query = (c, ...r) => Object.assign({ ...c }, ...r);

const resolver = (v) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x && x.__sentinel ? { __ts: Date.now() } : x]));
const embrulhar = (o) => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, x && x.__ts ? { seconds: Math.floor(x.__ts / 1000), toDate: () => new Date(x.__ts) } : x]));
const negar = () => Object.assign(new Error("permission-denied"), { code: "permission-denied" });

async function falhaInjetada() {
  const f = localStorage.getItem("__fsFail");
  if (f) throw Object.assign(new Error(f), { code: f });
}
const dentro = (chaves, lista) => chaves.every((k) => lista.includes(k));
const alterados = (antes, depois) => [...new Set([...Object.keys(antes), ...Object.keys(depois)])].filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(depois[k]));
const STATUS = ["pendente", "realizado", "interessado", "descartado"];
const LEAD_CHAVES = ["placeId", "nome", "categoria", "endereco", "cidade", "uf", "telefone", "whatsapp", "site", "siteStatus", "mapa", "nota", "avaliacoes", "servico", "oportunidade", "temperatura", "encontradoEm", "status", "observacoes", "acompanhamento", "createdAt", "updatedAt"];

// Espelha firestore.rules (resumido)
function checar(op, path, antes, depois) {
  const p = path.split("/");
  const dono = uid0();
  if (!dono) throw negar();
  if (p[0] === "users" && p.length === 2) {
    if (p[1] !== dono) throw negar();
    if (op === "create") {
      const k = Object.keys(depois);
      if (!dentro(k, ["nome", "email", "telefone", "createdAt", "updatedAt"]) || !["nome", "email", "createdAt", "updatedAt"].every((x) => k.includes(x))) throw negar();
      if (!(depois.nome.length >= 1 && depois.nome.length <= 100)) throw negar();
      if ((depois.telefone || "").length > 20) throw negar();
    } else if (op === "update") {
      if (!dentro(alterados(antes, depois), ["nome", "telefone", "createdAt", "updatedAt"])) throw negar();
      if (!(depois.nome && depois.nome.length >= 1 && depois.nome.length <= 100)) throw negar();
      if (antes.createdAt && JSON.stringify(antes.createdAt) !== JSON.stringify(depois.createdAt)) throw negar();
    } else throw negar();
    return;
  }
  if (p[0] === "users" && p[2] === "leads" && p.length === 4) {
    if (p[1] !== dono) throw negar();
    if (op === "create") {
      if (!dentro(Object.keys(depois), LEAD_CHAVES) || depois.placeId !== p[3] || !STATUS.includes(depois.status)) throw negar();
    } else if (op === "update") {
      if (!dentro(alterados(antes, depois), ["status", "observacoes", "acompanhamento", "updatedAt"]) || !STATUS.includes(depois.status) || (depois.observacoes || "").length > 2000) throw negar();
    }
    return;
  }
  if (p[0] === "users" && p[2] === "searches") { if (p[1] !== dono || op !== "read") throw negar(); return; }
  throw negar();
}

export async function getDoc(ref) {
  await esperar(30); await falhaInjetada();
  const d = load();
  if (!ref.path.includes("/leads/")) { if (!ref.path.startsWith("users/" + uid0())) throw negar(); }
  return { exists: () => ref.path in d, data: () => (ref.path in d ? embrulhar(d[ref.path]) : undefined), id: ref.id };
}
export async function setDoc(ref, valor) {
  await esperar(300); await falhaInjetada(); // latência: se a página sair antes, a gravação se perde
  const d = load();
  const existe = ref.path in d;
  const novo = resolver(valor);
  checar(existe ? "update" : "create", ref.path, existe ? d[ref.path] : {}, novo);
  d[ref.path] = novo; save(d);
}
export async function updateDoc(ref, campos) {
  await esperar(150); await falhaInjetada();
  const d = load();
  if (!(ref.path in d)) throw Object.assign(new Error("not-found"), { code: "not-found" });
  const novo = { ...d[ref.path], ...resolver(campos) };
  checar("update", ref.path, d[ref.path], novo);
  d[ref.path] = novo; save(d);
}
export async function deleteDoc(ref) {
  await esperar(100); await falhaInjetada();
  const d = load(); const p = ref.path.split("/");
  if (p[1] !== uid0()) throw negar();
  delete d[ref.path]; save(d);
}
export async function getDocs(q) {
  await esperar(60); await falhaInjetada();
  const d = load(); const base = q.path + "/";
  const p = q.path.split("/");
  if (p[1] !== uid0()) throw negar();
  let itens = Object.entries(d).filter(([k]) => k.startsWith(base) && !k.slice(base.length).includes("/")).map(([k, v]) => ({ id: k.split("/").pop(), v }));
  if (q.ordem) { const [c, dir] = q.ordem; itens.sort((a, b) => ((a.v[c]?.__ts || 0) - (b.v[c]?.__ts || 0)) * (dir === "desc" ? -1 : 1)); }
  if (q.lim) itens = itens.slice(0, q.lim);
  const docs = itens.map((i) => ({ id: i.id, data: () => embrulhar(i.v) }));
  return { docs, forEach: (f) => docs.forEach(f), size: docs.length };
}
