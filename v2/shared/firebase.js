// /shared/firebase.js
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore,
  collection, doc, getDoc, getDocs, query, where, orderBy, limit,
  onSnapshot,
  addDoc, setDoc, updateDoc, deleteDoc,
  serverTimestamp, increment, Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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

onAuthStateChanged(auth, (u) => { if (!u) signInAnonymously(auth).catch(() => {}); });

export async function ensureAuth() {
  const user = auth.currentUser;
  if (user) return user;
  await new Promise(r => setTimeout(r, 10));
  if (auth.currentUser) return auth.currentUser;
  await signInAnonymously(auth);
  return await new Promise((resolve, reject) => {
    const off = onAuthStateChanged(auth, (u) => { off(); u ? resolve(u) : reject(new Error("No auth")); }, reject);
  });
}

export {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit, onSnapshot,
  addDoc, setDoc, updateDoc, deleteDoc,
  serverTimestamp, increment, Timestamp,
};
