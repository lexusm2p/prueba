// /shared/firebase.js
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  getFirestore,
  collection, doc, getDoc, getDocs, query, where, orderBy, limit,
  onSnapshot,
  addDoc, setDoc, updateDoc, deleteDoc,
  serverTimestamp, increment, Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyAidr-9HSNlfok5BOBer8Te8EflyV8VYi4",
  authDomain: "seven-de-burgers.firebaseapp.com",
  projectId: "seven-de-burgers",
  storageBucket: "seven-de-burgers.appspot.com",
  messagingSenderId: "34089845279",
  appId: "1:34089845279:web:d13440c34e6bb7fa910b2a",
  measurementId: "G-Q8YQJGL2XY",
  databaseURL: "https://seven-de-burgers-default-rtdb.firebaseio.com"
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// Login anónimo automático
onAuthStateChanged(auth, (u) => {
  if (!u) {
    signInAnonymously(auth).catch(() => {});
  }
});

// Helper para quien quiera esperar auth listo
export async function ensureAuth() {
  if (auth.currentUser) return auth.currentUser;
  await signInAnonymously(auth).catch(() => {});
  return await new Promise((resolve, reject) => {
    const off = onAuthStateChanged(auth, u => {
      off();
      u ? resolve(u) : reject(new Error("No auth"));
    }, reject);
  });
}

// Export modular (por si se importa directo desde aquí)
export {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit,
  onSnapshot,
  addDoc, setDoc, updateDoc, deleteDoc,
  serverTimestamp, increment, Timestamp,
};

// 💡 CLAVE: exposiciones globales para shared/db.js y otros
if (typeof window !== "undefined") {
  window.FIREBASE_DB = db;
  window.FIREBASE_FS = {
    collection, doc, getDoc, getDocs, query, where, orderBy, limit,
    onSnapshot,
    addDoc, setDoc, updateDoc, deleteDoc,
    serverTimestamp,
  };
  console.info("[firebase] inicializado OK: seven-de-burgers");
}
