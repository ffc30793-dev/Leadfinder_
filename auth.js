import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { app } from "./firebase.js";

const auth = getAuth(app);
const db = getFirestore(app);
const $ = (id) => document.getElementById(id);
const form = $("auth-form");
const mensagem = $("auth-mensagem");
const botao = $("auth-submit");

function mostrarMensagem(texto) {
  if (mensagem) mensagem.textContent = texto;
  const settingsMessage = $("auth-mensagem-settings");
  if (settingsMessage) settingsMessage.textContent = texto;
}
function mostrarView(view) {
  document.querySelectorAll(".view").forEach((el) => {
    el.classList.toggle("active", el.id === `view-${view}`);
  });
  document.querySelectorAll(".nav-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.view === view);
  });
}
function notificarUsuario(usuario, perfil = {}) {
  document.dispatchEvent(new CustomEvent("leadfinder:user", {
    detail: {
      uid: usuario?.uid || "",
      email: usuario?.email || "",
      displayName: perfil.nome || usuario?.displayName || "",
      nome: perfil.nome || "",
      telefone: perfil.telefone || "",
      plano: perfil.plano || "FREE",
      creditos: perfil.creditos ?? 30
    }
  }));
}

onAuthStateChanged(auth, async (usuario) => {
  if (usuario) {
    let perfil = {};
    try {
      const snap = await getDoc(doc(db, "usuarios", usuario.uid));
      if (snap.exists()) perfil = snap.data();
    } catch (erro) {
      console.warn("Não foi possível carregar o perfil:", erro);
    }
    notificarUsuario(usuario, perfil);
    mostrarView("inicio");
  } else {
    notificarUsuario(null, {});
    mostrarView("inicio");
  }
});

form?.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const email = $("email").value.trim();
  const senha = $("senha").value;
  const nome = $("nome").value.trim();
  const telefone = $("telefone").value.trim();
  const modoCadastro = !$("nome").hidden;

  botao.disabled = true;
  mostrarMensagem("Aguarde…");
  try {
    if (modoCadastro) {
      const credencial = await createUserWithEmailAndPassword(auth, email, senha);
      await setDoc(doc(db, "usuarios", credencial.user.uid), {
        nome, email, telefone, plano: "FREE", creditos: 30,
        criadoEm: serverTimestamp()
      });
      notificarUsuario(credencial.user, {nome, email, telefone, plano:"FREE", creditos:30});
      mostrarMensagem("Conta criada com sucesso!");
    } else {
      const credencial = await signInWithEmailAndPassword(auth, email, senha);
      let perfil = {};
      try {
        const snap = await getDoc(doc(db, "usuarios", credencial.user.uid));
        if (snap.exists()) perfil = snap.data();
      } catch {}
      notificarUsuario(credencial.user, perfil);
      mostrarMensagem("Login realizado com sucesso!");
    }
    mostrarView("inicio");
  } catch (erro) {
    console.error("Erro no Firebase:", erro);
    const erros = {
      "auth/email-already-in-use": "Este e-mail já está cadastrado.",
      "auth/invalid-email": "Digite um e-mail válido.",
      "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
      "auth/invalid-credential": "E-mail ou senha incorretos.",
      "auth/network-request-failed": "Verifique sua conexão.",
      "auth/operation-not-allowed": "Ative o login por e-mail e senha no Firebase.",
      "permission-denied": "O Firestore bloqueou a gravação. Confira as regras do banco."
    };
    mostrarMensagem(erros[erro.code] || "Não foi possível concluir. Confira os dados e a configuração do Firebase.");
  } finally {
    botao.disabled = false;
  }
});

$("sair")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    mostrarView("inicio");
  } catch (erro) {
    console.error("Erro ao sair:", erro);
    mostrarMensagem("Não foi possível sair da conta.");
  }
});
