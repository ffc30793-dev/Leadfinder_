import {
  getFirebase,
  firebaseReady
} from "../config/config/firebase.js";

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

// Exibir mensagens
function setMsg(selector, message, success = false) {
  const element = $(selector);

  if (!element) return;

  element.textContent = message;
  element.style.color = success ? "#20d59a" : "#ff9aad";
}

// Verificar se o Firebase está configurado
async function connectFirebase(selector) {
  if (!firebaseReady) {
    setMsg(selector, "Firebase não configurado. Verifique a configuração.");
    return null;
  }

  try {
    const firebase = await getFirebase();

    if (!firebase) {
      setMsg(selector, "Não foi possível conectar ao Firebase.");
      return null;
    }

    return firebase;
  } catch (error) {
    console.error("Erro ao conectar ao Firebase:", error);
    setMsg(selector, "Erro de conexão. Confira sua internet e tente novamente.");
    return null;
  }
}

// LOGIN
$("#login-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = $("#login-email")?.value.trim();
  const password = $("#login-password")?.value;

  if (!email || !password) {
    setMsg("#login-message", "Preencha o e-mail e a senha.");
    return;
  }

  const firebase = await connectFirebase("#login-message");
  if (!firebase) return;

  try {
    await firebase.authMod.signInWithEmailAndPassword(
      firebase.auth,
      email,
      password
    );

    window.location.href = "dashboard.html";
  } catch (error) {
    console.error("Erro no login:", error);
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
    setMsg("#signup-message", "Preencha todos os campos.");
    return;
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    setMsg("#signup-message", "Informe um e-mail válido.");
    return;
  }

  if (phone.replace(/\D/g, "").length < 10) {
    setMsg("#signup-message", "Informe um número de celular válido.");
    return;
  }

  if (password.length < 8) {
    setMsg("#signup-message", "A senha deve ter pelo menos 8 caracteres.");
    return;
  }

  if (password !== confirmation) {
    setMsg("#signup-message", "As senhas não coincidem.");
    return;
  }

  const terms = $("#terms");

  if (terms && !terms.checked) {
    setMsg("#signup-message", "Aceite os termos para continuar.");
    return;
  }

  const firebase = await connectFirebase("#signup-message");
  if (!firebase) return;

  let credential;

  try {
    // Criar a conta no Firebase Authentication
    credential = await firebase.authMod.createUserWithEmailAndPassword(
      firebase.auth,
      email,
      password
    );

    // Salvar o nome no perfil do usuário
    await firebase.authMod.updateProfile(credential.user, {
      displayName: name
    });

  } catch (error) {
    console.error("Erro ao criar a conta:", error);
    setMsg("#signup-message", friendlyAuthError(error));
    return;
  }

  // Salvar os dados adicionais no Firestore
  try {
    await firebase.fsMod.setDoc(
      firebase.fsMod.doc(
        firebase.firestore,
        "users",
        credential.user.uid
      ),
      {
        name: name,
        email: email,
        phone: phone,
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
    console.error("Conta criada, mas houve erro ao salvar no Firestore:", error);

    setMsg(
      "#signup-message",
      "Sua conta foi criada no Firebase Authentication, mas não conseguimos salvar seu perfil no banco. Verifique as regras do Firestore."
    );
  }
});

// RECUPERAÇÃO DE SENHA
$("#forgot-password")?.addEventListener("click", async (event) => {
  event.preventDefault();

  const email = $("#login-email")?.value.trim();

  if (!email) {
    setMsg(
      "#login-message",
      "Digite seu e-mail antes de solicitar a recuperação."
    );
    return;
  }

  const firebase = await connectFirebase("#login-message");
  if (!firebase) return;

  try {
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
    console.error("Erro ao solicitar recuperação:", error);
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
      "Ative o método E-mail/senha nas configurações do Firebase.",

    "auth/invalid-api-key":
      "A chave de API do Firebase é inválida. Confira a configuração.",

    "permission-denied":
      "O Firestore bloqueou a operação. Verifique as regras do banco."
  };

  return messages[code] ||
    "Não foi possível concluir. Confira os dados e tente novamente.";
}
