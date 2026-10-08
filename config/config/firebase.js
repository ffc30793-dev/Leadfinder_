
const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "leadfinder-378a9.firebaseapp.com",
  projectId: "leadfinder-378a9",
  storageBucket: "leadfinder-378a9.firebasestorage.app",
  messagingSenderId: "694526859687",
  appId: "1:694526859687:web:d25ebd010c673ce85c3e82"
};

export { firebaseConfig };

export const firebaseReady =
  Object.values(firebaseConfig).every(
    value => value && !value.startsWith("SUA_")
  );

export async function getFirebase() {
  if (!firebaseReady) return null;

  const [{ initializeApp }, authMod, fsMod] =
    await Promise.all([
      import("https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js")
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
