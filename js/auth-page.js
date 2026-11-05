// Login, cadastro e recuperação de senha.
// CORREÇÃO DO PERFIL: antes, onAuthStateChanged redirecionava para o painel assim que a conta era criada,
// interrompendo a gravação do documento em users/{uid} (a escrita ficava pendente e se perdia).
// Agora o redirecionamento só acontece depois que o perfil foi gravado (ou que a falha foi tratada).
import { auth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from "./firebase.js";
import { criarPerfil, garantirPerfil, validarPerfil } from "./perfil.js";
import { mensagemFirebase } from "./ui.js";

const $ = (id) => document.getElementById(id);
let modo = "login"; // login | cadastro | reset
let ocupado = false;

function msg(texto, tipo = "") { const m = $("msg"); m.textContent = texto; m.className = `msg ${tipo}`; }

function definirModo(novo) {
  modo = novo;
  const cad = novo === "cadastro", rst = novo === "reset";
  $("titulo").textContent = cad ? "Crie sua conta grátis" : rst ? "Recuperar senha" : "Entre na sua conta";
  $("subtitulo").textContent = cad ? "Cadastre-se para começar a prospectar." : rst ? "Enviaremos um link para o seu e-mail." : "Acesse seu painel de prospecção.";
  $("bloco-nome").classList.toggle("hidden", !cad);
  $("bloco-tel").classList.toggle("hidden", !cad);
  $("bloco-senha").classList.toggle("hidden", rst);
  $("senha").required = !rst;
  $("senha").autocomplete = cad ? "new-password" : "current-password";
  $("enviar").textContent = cad ? "Criar conta grátis" : rst ? "Enviar link" : "Entrar";
  $("trocar").textContent = cad ? "Já tenho conta" : "Criar conta grátis";
  msg("");
}

onAuthStateChanged(auth, (user) => {
  if (user && !ocupado) location.replace("./painel.html"); // sessão já existente
});

$("trocar").addEventListener("click", () => definirModo(modo === "cadastro" ? "login" : "cadastro"));
$("esqueci").addEventListener("click", () => definirModo(modo === "reset" ? "login" : "reset"));

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (ocupado) return;
  const email = $("email").value.trim();
  const senha = $("senha").value;
  if (!email) return msg("Digite seu e-mail.", "err");

  ocupado = true;
  $("enviar").disabled = true;
  msg("Aguarde…");
  try {
    if (modo === "reset") {
      await sendPasswordResetEmail(auth, email);
      msg("Se houver uma conta com este e-mail, enviamos o link de recuperação.", "ok");
      return;
    }
    if (modo === "cadastro") {
      const dados = { nome: $("nome").value, telefone: $("telefone").value };
      const invalido = validarPerfil(dados);
      if (invalido) return msg(invalido, "err");
      if (senha.length < 6) return msg("A senha precisa ter pelo menos 6 caracteres.", "err");
      const cred = await createUserWithEmailAndPassword(auth, email, senha);
      try {
        await criarPerfil(cred.user, dados); // aguarda a gravação antes de sair da página
      } catch (err) {
        // A conta existe; o perfil será completado no painel (garantirPerfil). Não bloqueia o acesso.
        console.error("Perfil não gravado no cadastro:", err);
      }
    } else {
      const cred = await signInWithEmailAndPassword(auth, email, senha);
      try { await garantirPerfil(cred.user); } catch (err) { console.error("Perfil não completado no login:", err); }
    }
    location.replace("./painel.html");
  } catch (err) {
    console.error(err);
    msg(mensagemFirebase(err), "err");
  } finally {
    ocupado = false;
    $("enviar").disabled = false;
  }
});
