
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
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { app } from "./firebase.js";

const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);

const form = $("auth-form");
const mensagem = $("auth-mensagem");
const botao = $("auth-submit");

function mostrarTela(tela) {
  $("inicio").hidden = tela !== "inicio";
  $("autenticacao").hidden = tela !== "auth";
  $("painel").hidden = tela !== "painel";
  $("planos").hidden = tela !== "inicio";
}

function mostrarMensagem(texto) {
  mensagem.textContent = texto;
}

onAuthStateChanged(auth, (usuario) => {
  if (usuario) {
    mostrarTela("painel");
  } else {
    mostrarTela("inicio");
  }
});

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const email = $("email").value.trim();
  const senha = $("senha").value;
  const nome = $("nome").value.trim();
  const telefone = $("telefone").value.trim();
  const modoCadastro = !$("nome").hidden;

  botao.disabled = true;
  mostrarMensagem("Aguarde...");

  try {
    if (modoCadastro) {
      const credencial = await createUserWithEmailAndPassword(
        auth,
        email,
        senha
      );

      await setDoc(doc(db, "usuarios", credencial.user.uid), {
        nome,
        email,
        telefone,
        plano: "FREE",
        creditos: 30,
        criadoEm: serverTimestamp()
      });

      mostrarMensagem("Conta criada com sucesso!");
    } else {
      await signInWithEmailAndPassword(auth, email, senha);
      mostrarMensagem("Login realizado com sucesso!");
    }

    mostrarTela("painel");
  } catch (erro) {
    console.error("Erro no Firebase:", erro);

    const erros = {
      "auth/email-already-in-use": "Este e-mail já está cadastrado.",
      "auth/invalid-email": "Digite um e-mail válido.",
      "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
      "auth/invalid-credential": "E-mail ou senha incorretos.",
      "auth/network-request-failed": "Verifique sua conexão.",
      "auth/operation-not-allowed":
        "Ative o login por e-mail e senha no Firebase.",
      "permission-denied":
        "O Firestore bloqueou a gravação. Confira as regras do banco."
    };

    mostrarMensagem(
      erros[erro.code] ||
      "Não foi possível concluir. Confira a configuração do Firebase."
    );
  } finally {
    botao.disabled = false;
  }
});

$("sair").addEventListener("click", async () => {
  try {
    await signOut(auth);
    mostrarTela("inicio");
  } catch (erro) {
    console.error("Erro ao sair:", erro);
    mostrarMensagem("Não foi possível sair da conta.");
  }
});
