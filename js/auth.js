import { getFirebase, firebaseReady } from "./firebase.js";

const $ = (s) => document.querySelector(s);
document.querySelectorAll(".password-toggle").forEach(btn => btn.addEventListener("click", () => {
  const el = document.getElementById(btn.dataset.target);
  el.type = el.type === "password" ? "text" : "password";
  btn.textContent = el.type === "password" ? "Mostrar" : "Ocultar";
}));

const setMsg = (id, msg, ok=false) => { const el=$(id); if(el){el.textContent=msg;el.style.color=ok?"#20d59a":"#ff9aad";} };

$("#login-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email=$("#login-email").value.trim(), password=$("#login-password").value;
  if(!email || !password) return setMsg("#login-message","Preencha e-mail e senha.");
  try {
    if (!firebaseReady) {
      localStorage.setItem("lf_demo_user", JSON.stringify({name:email.split("@")[0],email,plan:"FREE",credits:30,searches:0,leads:0}));
      location.href="dashboard.html"; return;
    }
    const fb=await getFirebase();
    const {signInWithEmailAndPassword}=fb.authMod;
    await signInWithEmailAndPassword(fb.auth,email,password);
    location.href="dashboard.html";
  } catch(err) {
    setMsg("#login-message", friendlyAuthError(err));
  }
});

$("#signup-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name=$("#signup-name").value.trim(), email=$("#signup-email").value.trim(), phone=$("#signup-phone").value.trim();
  const pass=$("#signup-password").value, confirm=$("#signup-confirm").value;
  if(pass!==confirm) return setMsg("#signup-message","As senhas não coincidem.");
  if(!/^\S+@\S+\.\S+$/.test(email)) return setMsg("#signup-message","Informe um e-mail válido.");
  if(phone.replace(/\D/g,"").length<10) return setMsg("#signup-message","Informe um celular válido.");
  try {
    if(!firebaseReady){
      localStorage.setItem("lf_demo_user",JSON.stringify({name,email,phone,plan:"FREE",credits:30,searches:0,leads:0}));
      location.href="dashboard.html"; return;
    }
    const fb=await getFirebase();
    const {createUserWithEmailAndPassword,updateProfile}=fb.authMod;
    const cred=await createUserWithEmailAndPassword(fb.auth,email,pass);
    await updateProfile(cred.user,{displayName:name});
    const {doc,setDoc,serverTimestamp}=fb.fsMod;
    await setDoc(doc(fb.firestore,"users",cred.user.uid),{name,email,phone,plan:"FREE",credits:30,searches:0,leads:0,status:"active",createdAt:serverTimestamp()});
    location.href="dashboard.html";
  } catch(err) { setMsg("#signup-message",friendlyAuthError(err)); }
});

$("#forgot-password")?.addEventListener("click", async (e)=>{
  e.preventDefault(); const email=$("#login-email").value.trim();
  if(!email) return setMsg("#login-message","Informe seu e-mail primeiro.");
  try{
    if(!firebaseReady) return setMsg("#login-message","O Firebase ainda não foi configurado.");
    const fb=await getFirebase(); await fb.authMod.sendPasswordResetEmail(fb.auth,email);
    setMsg("#login-message","Se o e-mail existir, o link de recuperação foi enviado.",true);
  }catch(err){setMsg("#login-message",friendlyAuthError(err))}
});

function friendlyAuthError(err){
  const code=err?.code||"";
  const map={"auth/invalid-credential":"E-mail ou senha inválidos.","auth/email-already-in-use":"Este e-mail já está cadastrado.","auth/weak-password":"A senha deve ter pelo menos 8 caracteres.","auth/invalid-email":"E-mail inválido.","auth/too-many-requests":"Muitas tentativas. Aguarde e tente novamente."};
  return map[code]||"Não foi possível concluir a operação. Verifique os dados e tente novamente.";
}