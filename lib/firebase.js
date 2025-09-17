// /lib/firebase.js
// Firebase + Firestore v12 (ESM) — seguro y compatible con shared/db.js

// --- Core ---
import {
  initializeApp,
  getApps,
  getApp,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

// --- Firestore (traemos TODO lo que shared/db.js podría usar) ---
import {
  getFirestore,
  // lecturas / queries
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,

  // escrituras / utilidades
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  runTransaction,

  // valores especiales
  serverTimestamp,
  increment,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// ----------------------------------------------------
// Config pública (asegura reglas de seguridad en Firestore)
// ----------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyAidr-9HSNlfok5BOBer8Te8EflyV8VYi4",
  authDomain: "seven-de-burgers.firebaseapp.com",
  projectId: "seven-de-burgers",
  storageBucket: "seven-de-burgers.appspot.com",
  messagingSenderId: "34089845279",
  appId: "1:34089845279:web:d13440c34e6bb7fa910b2a",
  measurementId: "G-Q8YQJGL2XY",
};

// ----------------------------------------------------
// Init seguro (evita duplicados en hot-reload)
// ----------------------------------------------------
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db  = getFirestore(app);

// ----------------------------------------------------
// (Opcional) Emuladores locales
// ----------------------------------------------------
// import { connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
// try { if (location.hostname === "localhost") connectFirestoreEmulator(db, "127.0.0.1", 8080); } catch {}

// ----------------------------------------------------
// Re-exports crudos (compat exacta con shared/db.js)
// => Así puedes hacer: import { getDocs, Timestamp, … } from '/lib/firebase.js'
// ----------------------------------------------------
export {
  // core firestore
  getFirestore,
  collection, doc, query, where, orderBy, limit, startAfter,
  onSnapshot, getDoc, getDocs,
  addDoc, setDoc, updateDoc, deleteDoc,
  writeBatch, runTransaction,
  serverTimestamp, increment, Timestamp,
};

// ----------------------------------------------------
// Atajos/Helpers “quality-of-life” (opcional usar o no)
// ----------------------------------------------------
export const col    = (path)        => collection(db, path);
export const docRef = (path, id)    => doc(db, path, id);
export const q      = (...parts)    => query(...parts);
export const w      = (...args)     => where(...args);
export const ob     = (...args)     => orderBy(...args);

// Lecturas convenientes
export async function getAll(path, ...clauses) {
  const ref = clauses?.length ? q(col(path), ...clauses) : col(path);
  const snap = await getDocs(ref);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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

// Export agrupado opcional (por si ya lo usabas así)
export const DB = {
  db,
  collection, doc, query, where, orderBy, limit, startAfter,
  onSnapshot, getDoc, getDocs,
  addDoc, setDoc, updateDoc, deleteDoc,
  writeBatch, runTransaction,
  serverTimestamp, increment, Timestamp,
  col, docRef, q, w, ob,
  getAll, getOne, create, upsert, patch, remove, listenCol, listenDoc,
};