// Firebase — LeadFinder
import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import * as authMod from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import * as fsMod from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyD1dT_8l2vTBiE_Z1fLoRD3lbMH0Z4T76o",
  authDomain: "leadfinder-378a9.firebaseapp.com",
  projectId: "leadfinder-378a9",
  storageBucket: "leadfinder-378a9.firebasestorage.app",
  messagingSenderId: "694526859687",
  appId: "1:694526859687:web:d25ebd010c673ce85c3e82"
};

export const firebaseReady = true;

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = authMod.getAuth(app);
export const firestore = fsMod.getFirestore(app);

export async function getFirebase() {
  return {
    app,
    auth,
    firestore,
    authMod,
    fsMod
  };
}
