import {
  getFirebase,
  firebaseReady
} } from "../config/config/firebase.js";

const $ = (selector) => document.querySelector(selector);

// Mostrar ou ocultar senha
document.querySelectorAll(".password-toggle").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.target);
    if (!input) return;

    input.type = input.type === "password" ? "text" : "password";
    button.textContent =
      input.type === "password" ? "Mostrar" : "Ocultar";
  });
});

// Mensagens dos formulários
function setMsg(selector, message, success = false) {
  const element = $(selector);

  if (element) {
    element.textContent = message;
    element.style.color = success ? "#20d59a" : "#ff9aad";
  }
}

// LOGIN
$("#login-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = $("#login-email")?.value.trim();
  const password = $("#login-password")?.value;

  if (!email || !password) {
    return setMsg("#login-message", "Preencha o e-mail e a senha.");
  }

  if (!firebaseReady) {
    return setMsg(
      "#login-message",
      "Firebase não configurado. Verifique a conexão."
    );
  }

  try {
    const firebase = await getFirebase();

    await firebase.authMod.signInWithEmailAndPassword(
      firebase.auth,
      email,
      password
    );

    window.location.href = "dashboard.html";
  } catch (error) {
    setMsg("#login-message", friendlyAuthError(error));
  }
});

// CADASTRO
$("#signup-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = $("#signup-name")?.value.trim();
  const email = $("#signup-email")?.value.trim();
  const phone = $("#signup-phone")?.value.trim();
  const password = $("#signup-password")?.value;
  const confirmation = $("#signup-confirm")?.value;

  if (!name || !email || !phone || !password || !confirmation) {
    return setMsg("#signup-message", "Preencha todos os campos.");
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return setMsg("#signup-message", "Informe um e-mail válido.");
  }

  if (phone.replace(/\D/g, "").length < 10) {
    return setMsg("#signup-message", "Informe um celular válido.");
  }

  if (password.length < 8) {
    return setMsg(
      "#signup-message",
      "A senha deve ter pelo menos 8 caracteres."
    );
  }

  if (password !== confirmation) {
    return setMsg("#signup-message", "As senhas não coincidem.");
  }

  if (!firebaseReady) {
    return setMsg(
      "#signup-message",
      "Firebase não configurado. Verifique a conexão."
    );
  }

  try {
    const firebase = await getFirebase();

    const credential =
      await firebase.authMod.createUserWithEmailAndPassword(
        firebase.auth,
        email,
        password
      );

    await firebase.authMod.updateProfile(credential.user, {
      displayName: name
    });

    await firebase.fsMod.setDoc(
      firebase.fsMod.doc(
        firebase.firestore,
        "users",
        credential.user.uid
      ),
      {
        name,
        email,
        phone,
        plan: "FREE",
        credits: 30,
        searches: 0,
        leads: 0,
        status: "active",
        createdAt: firebase.fsMod.serverTimestamp()
      }
    );

    window.location.href = "dashboard.html";
  } catch (error) {
    setMsg("#signup-message", friendlyAuthError(error));
  }
});

// RECUPERAÇÃO DE SENHA
$("#forgot-password")?.addEventListener("click", async (event) => {
  event.preventDefault();

  const email = $("#login-email")?.value.trim();

  if (!email) {
    return setMsg(
      "#login-message",
      "Digite seu e-mail antes de solicitar a recuperação."
    );
  }

  if (!firebaseReady) {
    return setMsg("#login-message", "Firebase não configurado.");
  }

  try {
    const firebase = await getFirebase();

    await firebase.authMod.sendPasswordResetEmail(
      firebase.auth,
      email
    );

    setMsg(
      "#login-message",
      "Se o e-mail estiver cadastrado, você receberá instruções para recuperar a senha.",
      true
    );
  } catch (error) {
    setMsg("#login-message", friendlyAuthError(error));
  }
});

// TRADUZIR ERROS DO FIREBASE
function friendlyAuthError(error) {
  const code = error?.code || "";

  const messages = {
    "auth/invalid-credential":
      "E-mail ou senha inválidos.",
    "auth/email-already-in-use":
      "Este e-mail já está cadastrado.",
    "auth/weak-password":
      "A senha deve ter pelo menos 8 caracteres.",
    "auth/invalid-email":
      "O e-mail informado é inválido.",
    "auth/too-many-requests":
      "Muitas tentativas. Aguarde e tente novamente.",
    "auth/network-request-failed":
      "Falha de conexão. Verifique sua internet.",
    "auth/operation-not-allowed":
      "Ative E-mail/senha nas configurações de autenticação do Firebase.",
    "permission-denied":
      "O banco bloqueou a operação. Verifique as regras do Firestore."
  };

  return messages[code] ||
    "Não foi possível concluir. Verifique os dados e tente novamente.";
      }
