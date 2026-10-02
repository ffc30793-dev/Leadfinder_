// Configure as variáveis no arquivo local antes de ativar Firebase.
// NÃO coloque chaves de APIs externas privadas neste arquivo.
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

export const firebaseReady = Object.values(firebaseConfig).every(Boolean);

// O projeto pode usar Firebase Modular SDK via CDN. Em produção, recomenda-se
// manter estas dependências versionadas ou usar um bundler.
export async function getFirebase() {
  if (!firebaseReady) return null;
  const [{ initializeApp }, authMod, fsMod] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js")
  ]);
  const app = initializeApp(firebaseConfig);
  return {
    app,
    auth: authMod.getAuth(app),
    firestore: fsMod.getFirestore(app),
    authMod,
    fsMod
  };
}