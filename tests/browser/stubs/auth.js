const LU = "__users", LS = "__session";
const users = () => JSON.parse(localStorage.getItem(LU) || "{}");
const sess = () => JSON.parse(localStorage.getItem(LS) || "null");
const ouvintes = new Set();
const mk = (s) => (s ? { uid: s.uid, email: s.email, displayName: null, getIdToken: async () => "tok-" + s.uid } : null);
const auth = { get currentUser() { return mk(sess()); } };
const avisar = () => ouvintes.forEach((f) => f(auth.currentUser));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
export const getAuth = () => auth;
export const browserLocalPersistence = {};
export const setPersistence = async () => {};
export const onAuthStateChanged = (a, cb) => { ouvintes.add(cb); setTimeout(() => cb(auth.currentUser), 20); return () => ouvintes.delete(cb); };
export const signInWithEmailAndPassword = async (a, email, senha) => {
  await esperar(80);
  const u = users()[email.toLowerCase()];
  if (!u || u.senha !== senha) throw Object.assign(new Error("x"), { code: "auth/invalid-credential" });
  localStorage.setItem(LS, JSON.stringify({ uid: u.uid, email: email.toLowerCase() }));
  avisar();
  return { user: auth.currentUser };
};
export const createUserWithEmailAndPassword = async (a, email, senha) => {
  await esperar(80);
  const us = users(); const e = email.toLowerCase();
  if (us[e]) throw Object.assign(new Error("x"), { code: "auth/email-already-in-use" });
  const uid = "uid_" + Math.random().toString(36).slice(2, 8);
  us[e] = { uid, senha }; localStorage.setItem(LU, JSON.stringify(us));
  localStorage.setItem(LS, JSON.stringify({ uid, email: e }));
  avisar(); // igual ao Firebase real: dispara onAuthStateChanged assim que a conta é criada
  return { user: auth.currentUser };
};
export const signOut = async () => { localStorage.removeItem(LS); avisar(); };
export const sendPasswordResetEmail = async (a, email) => { localStorage.setItem("__reset", email); };
