// /shared/firebase.js  (versión robusta para OFFLINE/READONLY)
// Firebase v10.12 ESM — App, Auth anónima (opcional), Firestore + wrappers SEGUROS.

import { initializeApp, getApps, getApp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';

import {
  getAuth, signInAnonymously, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

// Importa el módulo de Firestore para tener las funciones reales:
import * as FS
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// --- Config y app ---
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

// --- Servicios base ---
export const auth = getAuth(app);

// ⚠️ En offline puede fallar getFirestore si el módulo no carga bien.
// Lo envolvemos con try para no romper:
let dbTmp = null;
try { dbTmp = FS.getFirestore(app); } catch { dbTmp = null; }
export const db = dbTmp;

// --- Login anónimo silencioso (best-effort) ---
onAuthStateChanged(auth, (u) => { if (!u) signInAnonymously(auth).catch(()=>{}); });

export async function ensureAuth() {
  if (auth.currentUser) return auth.currentUser;
  try { await signInAnonymously(auth); } catch {}
  return new Promise((resolve) => {
    const off = onAuthStateChanged(auth, (u)=>{ off(); resolve(u||null); });
  });
}

/* ========= Wrappers SEGUROS =========
   Si db/ref no existe, devolvemos “dummies” que no truenan.
   Mantengo los mismos nombres que usas en el resto de la app.
*/
const _dummy = {};
export const serverTimestamp = FS.serverTimestamp ?? (() => ({ __local: Date.now() }));
export const increment       = FS.increment       ?? ((n)=>n);

export const doc = (...args) => {
  if (!args?.[0]) return _dummy;
  try { return FS.doc(...args); } catch { return _dummy; }
};

export const collection = (...args) => {
  if (!args?.[0]) return _dummy;                 // <-- evita _freezeSettings con db undefined
  try { return FS.collection(...args); } catch { return _dummy; }
};

export const onSnapshot = (ref, next, err) => {
  // si ref es dummy/invalid, no nos suscribimos
  if (!ref || ref === _dummy) return () => {};
  try { return FS.onSnapshot(ref, next, err); } catch { return () => {}; }
};

// Lecturas/escrituras con fallback (no arrojan si falla el SDK)
export const getDoc    = FS.getDoc    ? ((r)=>FS.getDoc(r).catch(()=>({ exists:()=>false, data:()=>null }))) : (async()=>({ exists:()=>false, data:()=>null }));
export const getDocs   = FS.getDocs   ? ((q)=>FS.getDocs(q).catch(()=>({ docs:[] }))) : (async()=>({ docs:[] }));
export const setDoc    = FS.setDoc    ?? (async()=>{});
export const updateDoc = FS.updateDoc ?? (async()=>{});
export const addDoc    = FS.addDoc    ? (async (c, v)=>{ try { return await FS.addDoc(c, v); } catch { return { id:`TRAIN-${Math.random().toString(36).slice(2,8)}` }; } }) : (async()=>({ id:`TRAIN-${Math.random().toString(36).slice(2,8)}` }));
export const deleteDoc = FS.deleteDoc ?? (async()=>{});

export const query   = FS.query   ?? ((...a)=>a);
export const where   = FS.where   ?? ((...a)=>a);
export const orderBy = FS.orderBy ?? ((...a)=>a);
export const limit   = FS.limit   ?? ((...a)=>a);
export const Timestamp = FS.Timestamp ?? { fromDate: d => ({ toMillis: ()=> new Date(d).getTime() }) };
