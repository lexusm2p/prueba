// lib/ffirebase.js
// Firebase + Firestore (v12 modular) — robusto y con helpers prácticos.

import {
  initializeApp,
  getApps,
  getApp,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import {
  getFirestore,
  serverTimestamp,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  doc,
  where,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  limit,
  startAfter,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// --- Config ---
// ⚠️ Clave pública, asegura reglas de seguridad estrictas en Firestore.
// Nota: storageBucket usa el dominio estándar *.appspot.com
const firebaseConfig = {
  apiKey: "AIzaSyAidr-9HSNlfok5BOBer8Te8EflyV8VYi4",
  authDomain: "seven-de-burgers.firebaseapp.com",
  projectId: "seven-de-burgers",
  storageBucket: "seven-de-burgers.appspot.com",
  messagingSenderId: "34089845279",
  appId: "1:34089845279:web:d13440c34e6bb7fa910b2a",
  measurementId: "G-Q8YQJGL2XY",
};

// --- Init seguro (no duplicar app en hot-reload) ---
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db  = getFirestore(app);

// --- (Opcional) Emuladores locales ---
// Descomenta si usas emuladores durante desarrollo local:
// import { connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
// try { if (location.hostname === "localhost") connectFirestoreEmulator(db, "127.0.0.1", 8080); } catch {}

// ----------------------------------------------------
// Export base Firestore (API cruda — por si la prefieres modular)
// ----------------------------------------------------
export const DB = {
  serverTimestamp,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  doc,
  where,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  limit,
  startAfter,
};

// ----------------------------------------------------
// Helpers “quality-of-life” (azúcar sintáctico)
// ----------------------------------------------------

// Atajos de referencia
export const col = (path) => collection(db, path);
export const docRef = (path, id) => doc(db, path, id);

// Azúcar para query: q(col, w(…), ob(…), limit(…))
export const q  = (...args) => query(...args);
export const w  = (...args) => where(...args);
export const ob = (...args) => orderBy(...args);

// Lecturas
export async function getAll(path, ...clauses) {
  const qs = await getDocs(clauses?.length ? q(col(path), ...clauses) : col(path));
  return qs.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getOne(path, id) {
  const snap = await getDoc(docRef(path, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Escrituras CRUD mínimas
export async function create(path, data) {
  const ref = await addDoc(col(path), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function upsert(path, id, data) {
  await setDoc(docRef(path, id), {
    ...data,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return id;
}

export async function patch(path, id, data) {
  await updateDoc(docRef(path, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
  return id;
}

export async function remove(path, id) {
  await deleteDoc(docRef(path, id));
  return id;
}

// Suscripciones (cierre seguro: devuelve función de unsubscribe)
export function listenCol(path, { clauses = [], next, error } = {}) {
  const ref = clauses?.length ? q(col(path), ...clauses) : col(path);
  return onSnapshot(ref, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    next?.(list);
  }, (err) => error?.(err));
}

export function listenDoc(path, id, { next, error } = {}) {
  const ref = docRef(path, id);
  return onSnapshot(ref, (snap) => {
    next?.(snap.exists() ? ({ id: snap.id, ...snap.data() }) : null);
  }, (err) => error?.(err));
}
