// /shared/db.js
// Módulo de acceso a Firestore: órdenes activas del día, reportes por rango,
// settings (ETA/HappyHour/Theme), inventario, artículos, recetas.
// Dividido por secciones con comentarios para ubicar rápido.
// ----------------------------------------------------------------

import {
  db, ensureAuth,
  serverTimestamp, doc, getDoc, setDoc, updateDoc, addDoc, collection,
  onSnapshot, query, where, orderBy, limit, Timestamp
} from './firebase.js';

/* =============== Utilidades de fecha =============== */
// Regresa un Date a las 00:00:00 de hoy (local)
export function startOfToday() {
  const d = new Date(); d.setHours(0,0,0,0); return d;
}
// Convierte Date→Timestamp Firestore
export function toTs(d) {
  return Timestamp.fromDate(d);
}

/* =============== Órdenes =============== */

// 📡 Solo órdenes ACTIVAS de HOY (menor costo + velocidad en cocina/mesero/kiosko)
export function subscribeActiveOrders(cb) {
  // Estados que realmente importan en operación
  const active = ['PENDING','COOKING','IN_PROGRESS','READY'];

  const qy = query(
    collection(db, 'orders'),
    where('createdAt', '>=', toTs(startOfToday())),
    where('status', 'in', active),
    orderBy('createdAt', 'asc')
  );
  // IMPORTANTE: necesitarás un índice compuesto en Firestore Console:
  // collection: orders | fields: status (Asc), createdAt (Asc)
  return onSnapshot(qy, (snap) => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    cb(list);
  });
}

// 📥 Crear orden (kiosko/mesero)
export async function createOrder(payload) {
  await ensureAuth();
  const ref = await addDoc(collection(db, 'orders'), {
    ...payload,
    status: 'PENDING',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

// 🔁 Cambiar estado (cocina/admin)
export async function setOrderStatus(id, status) {
  await ensureAuth();
  await updateDoc(doc(db, 'orders', id), {
    status,
    updatedAt: serverTimestamp()
  });
}

// 🔎 Reporte por rango (admin)
export async function getOrdersRange({ from, to, includeArchive = false, type = null }) {
  // from/to son Date o string ISO. Convertimos a Timestamp.
  const _from = toTs(new Date(from));
  const _to   = toTs(new Date(to));

  // Nota: Para rangos largos, conviene paginar y/o precalcular agregados diarios.
  const colName = includeArchive ? 'orders_archive' : 'orders';
  const pieces = [
    where('createdAt', '>=', _from),
    where('createdAt', '<', _to),
    orderBy('createdAt', 'asc')
  ];
  if (type) pieces.unshift(where('orderMeta.type', '==', type));

  const qy = query(collection(db, colName), ...pieces);
  const snap = await (await import('https://cdn.skypack.dev/idb-keyval')).then(async () => {
    // sin caché: leemos directo
    return await (await import('https://cdn.skypack.dev/@firebase/firestore')).getDocs(qy);
  }).catch(async () => {
    // fallback: import dinámico falló -> solo getDocs si está en bundle
    const { getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    return await getDocs(qy);
  });

  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* =============== Settings (ETA, HappyHour, Theme) =============== */

const SETTINGS = 'settings';

// ⏱️ ETA
export async function setETA(minutes) {
  await ensureAuth();
  await setDoc(doc(db, SETTINGS, 'eta'), { minutes, updatedAt: serverTimestamp() }, { merge: true });
}
export function subscribeETA(cb) {
  return onSnapshot(doc(db, SETTINGS, 'eta'), (d) => cb(d.data()?.minutes ?? null));
}

// 🎉 Happy Hour
export async function setHappyHour(payload) {
  await ensureAuth();
  await setDoc(doc(db, SETTINGS, 'happyHour'), { ...payload, updatedAt: serverTimestamp() }, { merge: true });
}
export function subscribeHappyHour(cb) {
  return onSnapshot(doc(db, SETTINGS, 'happyHour'), (d) => cb(d.data() ?? null));
}

// 🎨 THEME (nuevo): guarda nombre del tema activo opcionalmente con overrides
export async function setTheme({ name, overrides = {} }) {
  await ensureAuth();
  await setDoc(doc(db, SETTINGS, 'theme'), { name, overrides, updatedAt: serverTimestamp() }, { merge: true });
}
export function subscribeTheme(cb) {
  return onSnapshot(doc(db, SETTINGS, 'theme'), (d) => cb(d.data() ?? null));
}

/* =============== Inventario / Compras / Proveedores =============== */

export function subscribeInventory(cb) {
  const qy = query(collection(db, 'inventory'), orderBy('name','asc'));
  return onSnapshot(qy, (snap)=> cb(snap.docs.map(d=>({ id:d.id, ...d.data() }))));
}
export async function upsertInventoryItem(item) {
  await ensureAuth();
  const ref = item.id ? doc(db,'inventory', item.id) : doc(collection(db,'inventory'));
  await setDoc(ref, { ...item, updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
}

export function subscribeSuppliers(cb) {
  const qy = query(collection(db, 'suppliers'), orderBy('name','asc'));
  return onSnapshot(qy, (snap)=> cb(snap.docs.map(d=>({ id:d.id, ...d.data() }))));
}
export async function upsertSupplier(supp) {
  await ensureAuth();
  const ref = supp.id ? doc(db,'suppliers', supp.id) : doc(collection(db,'suppliers'));
  await setDoc(ref, { ...supp, updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
}

export async function recordPurchase(purchase) {
  await ensureAuth();
  await addDoc(collection(db,'purchases'), { ...purchase, createdAt: serverTimestamp() });
}

/* =============== Recetario / Producción =============== */

export function subscribeRecipes(cb) {
  const qy = query(collection(db, 'recipes'), orderBy('name','asc'));
  return onSnapshot(qy, (snap)=> cb(snap.docs.map(d=>({ id:d.id, ...d.data() }))));
}
export async function produceBatch({ recipeId, mlPrepare, costRequired, supplierId }) {
  // ✅ Validación obligatoria (pendiente en tu backlog): costo y proveedor son requeridos
  if (!(costRequired > 0)) throw new Error('Debes capturar costo > 0');
  if (!supplierId) throw new Error('Debes seleccionar proveedor');

  await ensureAuth();
  // Aquí harías: calcular insumos según mlPrepare, crear movimiento de stock,
  // actualizar inventario y registrar lote producido con costo promedio ponderado.
  await addDoc(collection(db, 'productions'), {
    recipeId, mlPrepare, costRequired, supplierId,
    createdAt: serverTimestamp()
  });
}

/* =============== Artículos (nuevo módulo CRUD) =============== */

export function subscribeArticles(cb) {
  const qy = query(collection(db, 'articles'), orderBy('updatedAt','desc'), limit(100));
  return onSnapshot(qy, (snap)=> cb(snap.docs.map(d=>({ id:d.id, ...d.data() }))));
}
export async function upsertArticle(article) {
  await ensureAuth();
  const ref = article.id ? doc(db,'articles', article.id) : doc(collection(db,'articles'));
  await setDoc(ref, { ...article, updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
}
export async function deleteArticle(id) {
  await ensureAuth();
  await updateDoc(doc(db,'articles', id), { deletedAt: serverTimestamp() });
}
