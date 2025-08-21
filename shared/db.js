// /shared/db.js
// Abstracciones para Firestore (orders y orders_archive).

import {
  collection, addDoc, onSnapshot, orderBy, query,
  doc, updateDoc, deleteDoc, getDoc, setDoc
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db, serverTimestamp, ensureAnon } from './firebase.js';

// Garantiza auth antes de operar
await ensureAnon();

const colOrders  = collection(db, 'orders');
const colArchive = collection(db, 'orders_archive');

// Crear pedido (desde Kiosko)
export async function createOrder(order) {
  const payload = {
    ...order,
    status: 'PENDING',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(colOrders, payload);
  return ref.id;
}

// Suscripción a orders (tiempo real)
export function onOrdersSnapshot(cb) {
  const q = query(colOrders, orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    cb(list);
  });
}

// Cambiar estado
export async function setStatus(id, status) {
  await updateDoc(doc(db, 'orders', id), { status, updatedAt: serverTimestamp() });
}

// Editar campos puntuales
export async function updateOrder(id, patch) {
  await updateDoc(doc(db, 'orders', id), { ...patch, updatedAt: serverTimestamp() });
}

// Eliminar de orders
export async function deleteOrder(id) {
  await deleteDoc(doc(db, 'orders', id));
}

// Archivar al entregar (mueve a orders_archive)
export async function archiveDelivered(id) {
  const srcRef = doc(db, 'orders', id);
  const snap = await getDoc(srcRef);
  if (!snap.exists()) return;

  const data = snap.data();
  const dstRef = doc(colArchive); // id auto
  await setDoc(dstRef, {
    ...data,
    deliveredAt: serverTimestamp(),
    finalStatus: data.status || 'READY',
  });
  await deleteDoc(srcRef);
}

// Atajo simple: lee lista una sola vez (si lo necesitas en admin/reportes)
export function subscribeOrders(cb) { return onOrdersSnapshot(cb); }
