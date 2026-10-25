import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
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

  const mensagemSettings = $("auth-mensagem-settings");
  if (mensagemSettings) {
    mensagemSettings.textContent = texto;
  }
}

function mostrarView(view) {
  document.querySelectorAll(".view").forEach((elemento) => {
    elemento.classList.toggle("active", elemento.id === `view-${view}`);
  });

  document.querySelectorAll(".nav-item").forEach((elemento) => {
    elemento.classList.toggle("active", elemento.dataset.view === view);
  });
}

function notificarUsuario(usuario, perfil = {}) {
  document.dispatchEvent(
    new CustomEvent("leadfinder:user", {
      detail: {
        uid: usuario?.uid || "",
        email: perfil.email || usuario?.email || "",
        displayName: perfil.nome || usuario?.displayName || "",
        nome: perfil.nome || usuario?.displayName || "",
        telefone: perfil.telefone || "",
        plano: perfil.plano || "FREE",
        creditos: perfil.creditos ?? 30
      }
    })
  );
}

function mensagemErro(erro) {
  const erros = {
    "auth/email-already-in-use":
      "Este e-mail já está cadastrado.",

    "auth/invalid-email":
      "Digite um endereço de e-mail válido.",

    "auth/weak-password":
      "A senha precisa ter pelo menos 6 caracteres.",

    "auth/invalid-credential":
      "E-mail ou senha incorretos.",

    "auth/user-not-found":
      "Não encontramos uma conta com esses dados.",

    "auth/wrong-password":
      "Senha incorreta.",

    "auth/too-many-requests":
      "Muitas tentativas. Aguarde um pouco e tente novamente.",

    "auth/network-request-failed":
      "Falha na conexão. Verifique sua internet.",

    "auth/operation-not-allowed":
      "Ative o login por e-mail e senha no Firebase.",

    "permission-denied":
      "O Firestore bloqueou a operação. Verifique as regras do banco."
  };

  return erros[erro?.code] ||
    "Não foi possível concluir a operação. Confira os dados e tente novamente.";
}

/**
 * Carrega o perfil e cria um documento inicial se ele ainda não existir.
 * Merge preserva os campos existentes.
 */
async function carregarOuCriarPerfil(usuario, dadosCadastro = {}) {
  const referencia = doc(db, "users", usuario.uid);
  const snapshot = await getDoc(referencia);

  if (!snapshot.exists()) {
    const perfilInicial = {
      nome: dadosCadastro.nome || usuario.displayName || "",
      email: usuario.email || dadosCadastro.email || "",
      telefone: dadosCadastro.telefone || "",
      plano: "FREE",
      creditos: 30,
      criadoEm: serverTimestamp()
    };

    await setDoc(referencia, perfilInicial);
    return {
      ...perfilInicial,
      criadoEm: new Date()
    };
  }

  const perfilExistente = snapshot.data();
  const atualizacoes = {};

  // Preenche campos ausentes sem substituir valores já salvos.
  if (!perfilExistente.email && usuario.email) {
    atualizacoes.email = usuario.email;
  }

  if (!perfilExistente.nome && usuario.displayName) {
    atualizacoes.nome = usuario.displayName;
  }

  if (!perfilExistente.plano) {
    atualizacoes.plano = "FREE";
  }

  if (perfilExistente.creditos === undefined) {
    atualizacoes.creditos = 30;
  }

  if (Object.keys(atualizacoes).length > 0) {
    await setDoc(referencia, atualizacoes, { merge: true });
  }

  return {
    ...perfilExistente,
    ...atualizacoes
  };
}

// Mantém o estado de autenticação sincronizado com a interface.
onAuthStateChanged(auth, async (usuario) => {
  if (!usuario) {
    notificarUsuario(null, {});
    mostrarView("inicio");

    if (/painel\.html$/.test(window.location.pathname)) {
      window.location.replace("./index.html");
    }

    return;
  }

  try {
    const perfil = await carregarOuCriarPerfil(usuario);
    notificarUsuario(usuario, perfil);
  } catch (erro) {
    console.error("Erro ao carregar ou criar perfil:", erro);

    // A autenticação continua válida, mas o perfil pode não estar acessível.
    notificarUsuario(usuario, {});
    mostrarMensagem(
      "Você entrou na conta, mas não foi possível carregar seu perfil. Verifique as regras do Firestore."
    );
  }

  mostrarView("inicio");
});

// Cadastro e login.
form?.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const campoEmail = $("email");
  const campoSenha = $("senha");
  const campoNome = $("nome");
  const campoTelefone = $("telefone");

  const email = campoEmail?.value.trim() || "";
  const senha = campoSenha?.value || "";
  const nome = campoNome?.value.trim() || "";
  const telefone = campoTelefone?.value.trim() || "";

  const modoCadastro = campoNome ? !campoNome.hidden : false;

  if (!email || !senha) {
    mostrarMensagem("Preencha o e-mail e a senha.");
    return;
  }

  if (modoCadastro && !nome) {
    mostrarMensagem("Informe seu nome.");
    return;
  }

  if (botao) botao.disabled = true;

  mostrarMensagem("Aguarde...");

  try {
    let usuario;

    if (modoCadastro) {
      const credencial = await createUserWithEmailAndPassword(
        auth,
        email,
        senha
      );

      usuario = credencial.user;

      if (nome) {
        await updateProfile(usuario, {
          displayName: nome
        });
      }

      // Cria o perfil sem perder os dados da conta autenticada.
      const perfil = await carregarOuCriarPerfil(usuario, {
        nome,
        email,
        telefone
      });

      // Garante o salvamento dos dados informados no cadastro.
      await setDoc(
        doc(db, "users", usuario.uid),
        {
          nome,
          email,
          telefone
        },
        { merge: true }
      );

      notificarUsuario(usuario, {
        ...perfil,
        nome,
        email,
        telefone
      });

      mostrarMensagem("Conta criada e perfil salvo com sucesso!");
    } else {
      const credencial = await signInWithEmailAndPassword(
        auth,
        email,
        senha
      );

      usuario = credencial.user;

      const perfil = await carregarOuCriarPerfil(usuario);

      notificarUsuario(usuario, perfil);
      mostrarMensagem("Login realizado com sucesso!");
    }

    mostrarView("inicio");
  } catch (erro) {
    console.error("Erro no login, cadastro ou perfil:", erro);

    if (erro?.code === "permission-denied" ||
        erro?.code === "firestore/permission-denied") {
      mostrarMensagem(
        "A conta foi autenticada, mas o Firestore recusou o salvamento do perfil. Verifique as regras do banco."
      );
    } else {
      mostrarMensagem(mensagemErro(erro));
    }
  } finally {
    if (botao) botao.disabled = false;
  }
});

// Encerrar sessão.
$("sair")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    mostrarView("inicio");
    mostrarMensagem("Você saiu da sua conta.");
  } catch (erro) {
    console.error("Erro ao sair:", erro);
    mostrarMensagem("Não foi possível encerrar a sessão.");
  }
});
