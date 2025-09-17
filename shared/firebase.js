// /shared/firebase.js
// Firebase + Firestore ESM — una sola inicialización y TODOS los exports
// que requiere shared/db.js y admin/app.js

// Core
import { initializeApp, getApps, getApp }
  from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js';

// Auth (anónimo silencioso para no chocar con reglas)
import { getAuth, signInAnonymously, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js';

// Firestore (todo lo que podrías usar)
import {
  getFirestore,
  // lecturas / queries
  collection, doc, getDoc, getDocs,
  query, where, orderBy, limit, startAfter, onSnapshot,
  // escrituras / helpers
  addDoc, setDoc, updateDoc, deleteDoc, writeBatch, runTransaction,
  // valores especiales
  serverTimestamp, increment, Timestamp,
} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';

// ---- Config pública (usa reglas de seguridad en Firestore) ----
const firebaseConfig = {
  apiKey: "AIzaSyAidr-9HSNlfok5BOBer8Te8EflyV8VYi4",
  authDomain: "seven-de-burgers.firebaseapp.com",
  projectId: "seven-de-burgers",
  storageBucket: "seven-de-burgers.appspot.com", // dominio estándar
  messagingSenderId: "34089845279",
  appId: "1:34089845279:web:d13440c34e6bb7fa910b2a",
  measurementId: "G-Q8YQJGL2XY",
};

// ---- Init seguro (sin duplicados) ----
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db  = getFirestore(app);

// Auth anónimo silencioso (si tus reglas lo piden)
export const auth = (() => {
  try {
    const a = getAuth(app);
    onAuthStateChanged(a, (u) => { if (!u) signInAnonymously(a).catch(() => {}); });
    return a;
  } catch { return null; }
})();

// ---- Re-exports crudos (compat total con shared/db.js) ----
export {
  getFirestore,
  collection, doc, getDoc, getDocs,
  query, where, orderBy, limit, startAfter, onSnapshot,
  addDoc, setDoc, updateDoc, deleteDoc, writeBatch, runTransaction,
  serverTimestamp, increment, Timestamp,
  getAuth, signInAnonymously, onAuthStateChanged,
};

// ---- Helpers opcionales ----
export const col    = (path)        => collection(db, path);
export const docRef = (path, id)    => doc(db, path, id);
export const q      = (...parts)    => query(...parts);
export const w      = (...args)     => where(...args);
export const ob     = (...args)     => orderBy(...args);

// Lecturas convenientes
export async function getAll(path, ...clauses) {
  const ref  = clauses?.length ? q(col(path), ...clauses) : col(path);
  const snap = await getDocs(ref);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getOne(path, id) {
  const snap = await getDoc(docRef(path, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// CRUD mínimo
export async function create(path, data) {
  const ref = await addDoc(col(path), {
    ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return ref.id;
}
export async function upsert(path, id, data) {
  await setDoc(docRef(path, id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
  return id;
}
export async function patch(path, id, data) {
  await updateDoc(docRef(path, id), { ...data, updatedAt: serverTimestamp() });
  return id;
}
export async function remove(path, id) {
  await deleteDoc(docRef(path, id));
  return id;
}

// Suscripciones (devuelven unsubscribe)
export function listenCol(path, { clauses = [], next, error } = {}) {
  const ref = clauses?.length ? q(col(path), ...clauses) : col(path);
  return onSnapshot(ref, (snap) => {
    next?.(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, (err) => error?.(err));
}
export function listenDoc(path, id, { next, error } = {}) {
  return onSnapshot(docRef(path, id), (snap) => {
    next?.(snap.exists() ? ({ id: snap.id, ...snap.data() }) : null);
  }, (err) => error?.(err));
}