// /shared/db-compat.js
// Adaptador que expone la API esperada por app.js: DB.createOrder, DB.trackOrder, etc.

import {
  db,
  collection, addDoc, doc, setDoc, getDoc,
  onSnapshot, query, orderBy, limit, serverTimestamp
} from './firebase.js';

/** Normaliza un doc snapshot a objeto con id */
const toObj = (d) => ({ id: d.id, ...d.data() });

/** Lee últimos N pedidos y deja que la UI los separe por estado */
function listenKitchen(cb, opts = {}) {
  const { max = 200 } = opts;
  const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(max));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map(toObj);
    cb(rows);
  });
}

async function createOrder(payload) {
  // Asegura campos base que la UI suele usar
  const row = {
    ...payload,
    state: payload?.state || 'PENDING',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, 'orders'), row);
  return { id: ref.id };
}

async function updateOrderState(id, state, extra = {}) {
  await setDoc(
    doc(db, 'orders', id),
    { state, updatedAt: serverTimestamp(), ...extra },
    { merge: true }
  );
}

async function setOrder(id, data) {
  await setDoc(doc(db, 'orders', id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

async function getOrder(id) {
  const s = await getDoc(doc(db, 'orders', id));
  return s.exists() ? toObj(s) : null;
}

function trackOrder(id, cb) {
  const ref = doc(db, 'orders', id);
  return onSnapshot(ref, (s) => cb(s.exists() ? toObj(s) : null));
}

// Expone la API esperada por app.js
export const DB = {
  createOrder,
  updateOrderState,
  setOrder,
  getOrder,
  listenKitchen,
  trackOrder,
};

// Para código legado que lo usa como global
if (typeof window !== 'undefined') window.DB = DB;

export default DB;
