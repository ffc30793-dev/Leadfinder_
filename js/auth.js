
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import { app } from "./firebase.js";

const auth = getAuth(app);
const db = getFirestore(app);

const PAINEL = document.getElementById("painel");
const INICIO = document.getElementById("inicio");
const AUTH = document.getElementById("autenticacao");
const FORM = document.getElementById("auth-form");
const MENSAGEM = document.getElementById("auth-mensagem");

function mostrarTela(tela) {
  if (INICIO) INICIO.hidden = tela !== "inicio";
  if (AUTH) AUTH.hidden = tela !== "auth";
  if (PAINEL) PAINEL.hidden = tela !== "painel";
  const planos = document.getElementById("planos");
  if (planos) planos.hidden = tela !== "inicio";
}

function mensagem(texto) {
  if (MENSAGEM) MENSAGEM.textContent = texto;
}

onAuthStateChanged(auth, async (usuario) => {
  if (usuario) {
    mostrarTela("painel");
    mensagem("");
  } else {
    mostrarTela("inicio");
  }
});

if (FORM) {
  FORM.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const email = document.getElementById("email").value.trim();
    const senha = document.getElementById("senha").value;
    const nome = document.getElementById("nome")?.value.trim() || "";
    const telefone =
      document.getElementById("telefone")?.value.trim() || "";

    const modoCadastro =
      document.getElementById("nome") &&
      !document.getElementById("nome").hidden;

    const botao = document.getElementById("auth-submit");
    if (botao) botao.disabled = true;

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

        mensagem("Conta criada com sucesso!");
      } else {
        await signInWithEmailAndPassword(auth, email, senha);
        mensagem("Login realizado com sucesso!");
      }

      mostrarTela("painel");
    } catch (erro) {
      console.error("Erro na autenticação:", erro);

      const erros = {
        "auth/email-already-in-use": "Este e-mail já está cadastrado.",
        "auth/invalid-email": "Digite um e-mail válido.",
        "auth/weak-password": "A senha deve ter pelo menos 6 caracteres.",
        "auth/invalid-credential": "E-mail ou senha incorretos.",
        "auth/network-request-failed": "Verifique sua conexão."
      };

      mensagem(
        erros[erro.code] ||
        "Não foi possível concluir. Verifique a configuração do Firebase e as regras do Firestore."
      );
    } finally {
      if (botao) botao.disabled = false;
    }
  });
}

const sair = document.getElementById("sair");
if (sair) {
  sair.addEventListener("click", async () => {
    try {
      await signOut(auth);
      mostrarTela("inicio");
    } catch (erro) {
      console.error(erro);
      mensagem("Não foi possível sair da conta.");
    }
  });
}
