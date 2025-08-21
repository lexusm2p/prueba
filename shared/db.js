<!-- /shared/db.js -->
<script type="module">
import { db } from './firebase.js';
import {
  collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const ORDERS = 'orders';
const ARCH  = 'orders_archive';

// Crear pedido (Kiosko / Mesero)
export async function createOrder(payload){
  // payload: {customer, qty, subtotal, item{...}, baseIngredients[], baseSauce, extras{...}, notes}
  const ref = await addDoc(collection(db, ORDERS), {
    ...payload,
    status: 'PENDING',
    createdAt: Date.now()
  });
  return ref.id;
}

// Suscripción (Admin/Mesero/Cocina)
export function onOrdersSnapshot(cb){
  return onSnapshot(collection(db, ORDERS), (snap)=>{
    const items = [];
    snap.forEach(d=> items.push({id:d.id, ...d.data()}));
    // Ordena por fecha asc
    items.sort((a,b)=> (a.createdAt||0)-(b.createdAt||0));
    cb(items);
  });
}

export async function setStatus(id, status){
  await updateDoc(doc(db, ORDERS, id), { status });
}

export async function updateOrder(id, patch){
  await updateDoc(doc(db, ORDERS, id), patch);
}

export async function deleteOrder(id){
  await deleteDoc(doc(db, ORDERS, id));
}

export async function archiveDelivered(id){
  const dref = doc(db, ORDERS, id);
  // obtenemos los datos actuales vía onSnapshot upstream; aquí hacemos un “soft move”:
  const move = new Promise((resolve,reject)=>{
    const unsub = onOrdersSnapshot(async (list)=>{
      const found = list.find(x=>x.id===id);
      if(!found){ return; }
      try{
        await setDoc(doc(db, ARCH, id), {...found, archivedAt:Date.now()});
        await deleteDoc(dref);
        unsub();
        resolve(true);
      }catch(err){ reject(err); }
    });
  });
  return move;
}
</script>
