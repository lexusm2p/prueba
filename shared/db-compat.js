// /shared/db-compat.js
// Adaptador unificado: expone API nueva y alias legacy usados en app.js

import {
  db,
  collection, addDoc, doc, setDoc, getDoc,
  onSnapshot, query, orderBy, limit, serverTimestamp
} from './firebase.js';

const toObj = (d) => ({ id: d.id, ...d.data() });

/* ------------ Core API (nueva) ------------ */
function listenKitchen(cb, opts = {}) {
  const { max = 200 } = opts;
  const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(max));
  return onSnapshot(q, (snap) => cb(snap.docs.map(toObj)));
}

async function createOrder(payload) {
  const row = {
    ...payload,
    status: payload?.status || payload?.state || 'PENDING', // status preferido
    state:  payload?.state  || payload?.status || 'PENDING', // compat
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, 'orders'), row);
  return { id: ref.id };
}

async function updateOrderState(id, next, extra = {}) {
  // Mantén ambos campos por compatibilidad (status/state)
  const patch = {
    status: next,
    state: next,
    updatedAt: serverTimestamp(),
    ...extra
  };
  await setDoc(doc(db, 'orders', id), patch, { merge: true });
}

async function setOrder(id, data) {
  const patch = {
    ...data,
    // si viene solo status/state, rellena el otro
    ...(data?.status && !data?.state ? { state: data.status } : {}),
    ...(data?.state  && !data?.status ? { status: data.state } : {}),
    updatedAt: serverTimestamp(),
  };
  await setDoc(doc(db, 'orders', id), patch, { merge: true });
}

async function getOrder(id) {
  const s = await getDoc(doc(db, 'orders', id));
  return s.exists() ? toObj(s) : null;
}

function trackOrder(id, cb) {
  const ref = doc(db, 'orders', id);
  return onSnapshot(ref, (s) => cb(s.exists() ? toObj(s) : null));
}

/* ------------ Aliases legacy (los que usa cocina/mesero/kiosko) ------------ */
// Suscripción de órdenes
const subscribeOrders       = (cb, opts) => listenKitchen(cb, opts);
const onOrdersSnapshot      = subscribeOrders;
const subscribeActiveOrders = subscribeOrders;

// Set de estado
const setOrderStatus = (id, status, extra) => updateOrderState(id, status, extra);
const setStatus      = setOrderStatus;

// Actualizar/“upsert”
const updateOrder = (id, patch, _opts) => setOrder(id, patch);
const upsertOrder = ({ id, ...rest }, _opts) => setOrder(id, rest);

// Archivar entregados (tu app lo usa después de cobrar/cancelar)
const archiveDelivered = (id, _opts) => updateOrderState(id, 'DONE');

// Inventario (opcional; si no existe, no falla)
async function applyInventoryForOrder(/*order, opts*/) {
  // no-op por ahora; deja el hook para el futuro
}

/* ------------ Objeto público ------------ */
export const DB = {
  // Core
  createOrder, updateOrderState, setOrder, getOrder, listenKitchen, trackOrder,
  // Aliases legacy
  subscribeOrders, onOrdersSnapshot, subscribeActiveOrders,
  setOrderStatus, setStatus, updateOrder, upsertOrder,
  archiveDelivered, applyInventoryForOrder,
};

// Globals para código suelto
if (typeof window !== 'undefined') window.DB = DB;

export default DB;
