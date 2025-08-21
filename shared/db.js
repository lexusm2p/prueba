// ✅ db.js
import {
  db, ensureAuth, collection, doc,
  addDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, query, orderBy
} from "./firebase.js";

const ORDERS = "orders";
const ARCHIVE = "orders_archive";

// 📝 Crear pedido
export async function createOrder(payload) {
  await ensureAuth();
  const ref = await addDoc(collection(db, ORDERS), {
    ...payload,
    status: "PENDING",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

// 🔔 Escuchar pedidos
export function onOrdersSnapshot(cb) {
  ensureAuth().then(() => {
    const q = query(collection(db, ORDERS), orderBy("createdAt", "asc"));
    onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      cb(list);
    });
  });
}

// 🔄 Cambiar estado
export async function setStatus(id, status) {
  await ensureAuth();
  await updateDoc(doc(db, ORDERS, id), {
    status,
    updatedAt: serverTimestamp()
  });
}

// 📦 Archivar pedidos entregados
export async function archiveDelivered(id) {
  await ensureAuth();
  const ref = doc(db, ORDERS, id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await setDoc(doc(db, ARCHIVE, id), snap.data());
    await deleteDoc(ref);
  }
}
