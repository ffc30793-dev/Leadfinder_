// Firebase — LeadFinder. A configuração abaixo é a mesma do projeto original (chave pública do app web;
// restrinja-a por domínio no Google Cloud). Nenhum segredo fica no navegador.
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyD1dT_8l2vTBiE_Z1fLoRD3lbMH0Z4T76o",
  authDomain: "leadfinder-378a9.firebaseapp.com",
  projectId: "leadfinder-378a9",
  storageBucket: "leadfinder-378a9.firebasestorage.app",
  messagingSenderId: "694526859687",
  appId: "1:694526859687:web:d25ebd010c673ce85c3e82"
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});

export {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail,
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, orderBy, limit, serverTimestamp
};
