import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { app } from "./firebase.js";
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (id) => document.getElementById(id);
const form = $("auth-form"), mensagem = $("auth-mensagem"), botao = $("auth-submit");
let modoCadastro = new URLSearchParams(location.search).get("modo") === "cadastro";
let enviandoFormulario = false;
function modo(cadastro) {
  modoCadastro = cadastro;
  $("nome").hidden = !cadastro; $("nome").required = cadastro;
  $("telefone").hidden = !cadastro; $("telefone").required = cadastro;
  $("auth-titulo").textContent = cadastro ? "Crie sua conta" : "Entre na sua conta";
  $("auth-descricao").textContent = cadastro ? "Crie sua conta grátis para acessar o painel de prospecção." : "Acesse seu painel e continue encontrando novas oportunidades.";
  botao.textContent = cadastro ? "Criar conta grátis" : "Entrar";
  $("trocar-auth").textContent = cadastro ? "Já tem uma conta? Entrar" : "Ainda não tem conta? Cadastre-se";
  $("senha").autocomplete = cadastro ? "new-password" : "current-password";
  mensagem.textContent = "";
}
$("trocar-auth")?.addEventListener("click", () => modo(!modoCadastro));
onAuthStateChanged(auth, (usuario) => { if (usuario && !enviandoFormulario) location.replace("./index.html"); });
form?.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const email = $("email").value.trim(), senha = $("senha").value;
  const nome = $("nome").value.trim(), telefone = $("telefone").value.trim();
  enviandoFormulario = true; botao.disabled = true; mensagem.textContent = "Aguarde…";
  try {
    if (modoCadastro) {
      const credencial = await createUserWithEmailAndPassword(auth, email, senha);
      try { await setDoc(doc(db, "usuarios", credencial.user.uid), { nome, email, telefone, plano: "FREE", creditos: 30, criadoEm: serverTimestamp() }); }
      catch (erroPerfil) { console.error("Conta criada, mas o perfil não foi salvo:", erroPerfil); mensagem.textContent = "Conta criada, mas não foi possível salvar o perfil. Confira as regras do Firestore."; return; }
    } else {
      await signInWithEmailAndPassword(auth, email, senha);
    }
    location.replace("./index.html");
  } catch (erro) {
    console.error("Erro no Firebase:", erro);
    const erros = {"auth/email-already-in-use":"Este e-mail já está cadastrado.","auth/invalid-email":"Digite um e-mail válido.","auth/weak-password":"A senha precisa ter pelo menos 6 caracteres.","auth/invalid-credential":"E-mail ou senha incorretos.","auth/user-not-found":"Não existe conta com esse e-mail.","auth/wrong-password":"Senha incorreta.","auth/network-request-failed":"Verifique sua conexão.","auth/operation-not-allowed":"Ative o login por e-mail e senha no Firebase.","permission-denied":"O Firestore bloqueou a gravação. Confira as regras do banco."};
    mensagem.textContent = erros[erro.code] || "Não foi possível concluir. Confira os dados e a configuração do Firebase.";
  } finally { enviandoFormulario = false; botao.disabled = false; }
});
modo(modoCadastro);
