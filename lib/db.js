// /prueba/lib/db.js
import { db } from './firebase.js';
import {
  collection, query, where, orderBy, onSnapshot,
  doc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const Status = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  READY: 'READY',
  DELIVERED: 'DELIVERED'
};

// Escucha TODO lo activo y lo categorizamos en el front
export function subscribeActiveOrders(cb) {
  const q = query(
    collection(db, 'orders'),
    where('status', 'in', [Status.PENDING, Status.IN_PROGRESS, Status.READY]),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(q, (snap) => {
    const rows = [];
    snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
    cb(rows);
  });
}

export async function setStatus(id, status) {
  await updateDoc(doc(db, 'orders', id), {
    status,
    updatedAt: serverTimestamp()
  });
}

export async function archiveDelivered(id) {
  await updateDoc(doc(db, 'orders', id), {
    status: Status.DELIVERED,
    deliveredAt: serverTimestamp()
  });
}
