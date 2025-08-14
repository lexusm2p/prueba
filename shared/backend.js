
// shared/backend.js
// Abstraction over Firestore or localStorage fallback for orders, purchases, inventory, users
import { initFirebase } from './firebase.js';
import { Status } from './status.js';

const cfg = initFirebase();
let db = null;
let useLS = true;

async function ensureFirestore() {
  if (!cfg) return null;
  if (db) return db;
  // Lazy import Firebase v10+ CDN modular
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js');
  const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js');
  const app = initializeApp(cfg);
  db = getFirestore(app);
  useLS = false;
  return db;
}

function lsGet(key, def) {
  const v = localStorage.getItem(key);
  if (!v) return def;
  try { return JSON.parse(v); } catch { return def; }
}
function lsSet(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

// ---------- ORDERS ----------
export async function createOrder(order) {
  order.id = order.id || crypto.randomUUID();
  order.ts = Date.now();
  order.status = order.status || Status.PENDING;
  if (useLS || !(await ensureFirestore())) {
    const arr = lsGet('orders', []);
    arr.push(order);
    lsSet('orders', arr);
    window.dispatchEvent(new CustomEvent('orders-changed'));
    return order.id;
  } else {
    const { doc, setDoc, collection } = await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js');
    await setDoc(doc(collection(db, 'orders'), order.id), order);
    return order.id;
  }
}

export async function setStatus(id, status) {
  if (useLS || !(await ensureFirestore())) {
    const arr = lsGet('orders', []);
    const i = arr.findIndex(o => o.id === id);
    if (i>=0) { arr[i].status = status; arr[i].tsUpdate = Date.now(); lsSet('orders', arr); }
    window.dispatchEvent(new CustomEvent('orders-changed'));
  } else {
    const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js');
    await updateDoc(doc(db, 'orders', id), { status, tsUpdate: Date.now() });
  }
}

export async function archiveDelivered(id) {
  if (useLS || !(await ensureFirestore())) {
    const arr = lsGet('orders', []);
    const idx = arr.findIndex(o => o.id===id);
    if (idx>=0) {
      const o = arr.splice(idx,1)[0];
      const arch = lsGet('orders_archive', []);
      arch.push(o);
      lsSet('orders', arr);
      lsSet('orders_archive', arch);
      window.dispatchEvent(new CustomEvent('orders-changed'));
    }
  } else {
    const { doc, getDoc, deleteDoc, setDoc, collection } = await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js');
    const ref = doc(db, 'orders', id);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await setDoc(doc(collection(db, 'orders_archive'), id), snap.data());
      await deleteDoc(ref);
    }
  }
}

// Subscribe orders with simple polling for LS; Firestore uses onSnapshot
export async function subscribeOrders(cb, filters={}) {
  if (useLS || !(await ensureFirestore())) {
    const run = () => {
      const arr = lsGet('orders', []);
      cb(arr.filter(o=> {
        let ok = true;
        if (filters.server) ok = ok && o.server===filters.server;
        if (filters.status) ok = ok && o.status===filters.status;
        return ok;
      }));
    };
    run();
    window.addEventListener('orders-changed', run);
    return () => window.removeEventListener('orders-changed', run);
  } else {
    const { collection, onSnapshot, query, where } = await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js');
    let q = collection(db, 'orders');
    const parts = [];
    if (filters.server) parts.push(where('server', '==', filters.server));
    if (filters.status) parts.push(where('status', '==', filters.status));
    if (parts.length) {
      const { query: qf } = await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js');
      q = qf(collection(db,'orders'), ...parts);
    }
    return onSnapshot(q, snap => {
      const arr = [];
      snap.forEach(doc=>arr.push(doc.data()));
      cb(arr);
    });
  }
}

// ---------- USERS (local only simple) ----------
export function getUsers() {
  return lsGet('users', [
    {id:'admin', name:'Admin', role:'admin', pin:'7777'},
    {id:'cocina', name:'Cocina', role:'kitchen', pin:'2222'},
    {id:'mesero', name:'Mesero 1', role:'server', pin:'1111'},
  ]);
}
export function setUsers(list){ lsSet('users', list); }

// ---------- INVENTORY & PURCHASES (basic) ----------
export function getInventory() { return lsGet('inventory', {}); }
export function setInventory(inv) { lsSet('inventory', inv); }

export function addPurchase(p) {
  const arr=lsGet('purchases',[]); p.id=crypto.randomUUID(); p.ts=Date.now(); arr.push(p); lsSet('purchases',arr);
  // Update inventory simple sum
  const inv=getInventory(); inv[p.item]=(inv[p.item]||0)+Number(p.qty||0); setInventory(inv);
}
export function getPurchases(){ return lsGet('purchases',[]); }

// ---------- FINANCE ----------
export function getArchive(){ return lsGet('orders_archive',[]); }
