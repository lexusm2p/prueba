// shared/db.js · Seven V2
// ÚNICA fuente de verdad para Kiosko V2 y Cocina V2
// - Si hay Firestore disponible -> usa colección real
// - Si NO hay Firestore -> usa modo SIM compartido (localStorage)
// - BASE_PREFIX atado a /v2/ para que no choque con la versión anterior

/* ======================= Base prefix ======================= */
const parts = (location.pathname || '/').split('/').filter(Boolean);
const idxV2 = parts.indexOf('v2');

// /prueba/v2/  (incluye última barra)
export const BASE_PREFIX =
  idxV2 >= 0 ? '/' + parts.slice(0, idxV2 + 1).join('/') + '/' : '/';

const LS_NAMESPACE = (BASE_PREFIX.replace(/\W+/g, '-') || 'seven') + '-orders-sim';
const ORDERS_KEY = LS_NAMESPACE;

console.info('[db] BASE_PREFIX =', BASE_PREFIX, 'LS namespace =', LS_NAMESPACE);

/* ======================= Firestore helpers ======================= */

function getDb() {
  // adapta a cómo inicializas Firebase en firebase.js
  // intenta varias opciones seguras:
  return (
    window.FIREBASE_DB ||          // recomendada
    window.firebaseDb ||
    window.db ||
    null
  );
}

let _firestorePkg = null;
async function ensureFirestorePkg() {
  if (_firestorePkg) return _firestorePkg;
  // Si tu bundler ya incluye firebase/firestore, puedes eliminar este import dinámico
  try {
    const mod = await import(
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'
    );
    _firestorePkg = {
      collection: mod.collection,
      addDoc: mod.addDoc,
      onSnapshot: mod.onSnapshot,
      query: mod.query,
      orderBy: mod.orderBy,
      updateDoc: mod.updateDoc,
      doc: mod.doc,
      serverTimestamp: mod.serverTimestamp || (() => Date.now())
    };
  } catch (e) {
    console.warn('[db] No se pudo cargar firebase/firestore, usando SIM', e);
    _firestorePkg = null;
  }
  return _firestorePkg;
}

function hasRealDb() {
  return !!getDb();
}

/* ======================= SIM (localStorage compartido) ======================= */

function readSimOrders() {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeSimOrders(list) {
  try {
    localStorage.setItem(ORDERS_KEY, JSON.stringify(list || []));
  } catch {
    // ignore
  }
}

function createOrderSim(order) {
  const all = readSimOrders();
  const id = `SIM-${Date.now()}-${Math.floor(Math.random() * 999)}`;
  const now = Date.now();
  const full = {
    id,
    ...order,
    createdAt: order.createdAt || now,
    updatedAt: now,
    status: order.status || 'pending',
    source: order.source || 'kiosk-v2-sim'
  };
  all.push(full);
  writeSimOrders(all);
  console.info('[db] order created SIM', id);
  return id;
}

function subscribeSim(onChange) {
  // polling liviano compartido entre pestañas
  let last = JSON.stringify(readSimOrders());
  onChange(readSimOrders());

  const iv = setInterval(() => {
    const now = JSON.stringify(readSimOrders());
    if (now !== last) {
      last = now;
      onChange(readSimOrders());
    }
  }, 1500);

  return () => clearInterval(iv);
}

function updateStatusSim(id, status, extra = {}) {
  const all = readSimOrders();
  const i = all.findIndex(o => o.id === id);
  if (i === -1) return;
  all[i] = {
    ...all[i],
    status,
    ...extra,
    updatedAt: Date.now()
  };
  writeSimOrders(all);
}

/* ======================= API pública ======================= */

/**
 * Crea un pedido.
 * - Si hay Firestore real -> escribe en `${BASE_PREFIX}orders`
 * - Si no hay -> modo SIM compartido
 */
export async function createOrder(order) {
  // normaliza un poco
  const base = {
    createdAt: order.createdAt || Date.now(),
    updatedAt: Date.now(),
    status: order.status || 'pending',
    source: order.source || 'kiosk-v2',
    ...order
  };

  const db = getDb();
  if (!db) {
    // SIM
    return createOrderSim(base);
  }

  const fs = await ensureFirestorePkg();
  if (!fs) {
    // no firestore lib -> SIM
    return createOrderSim(base);
  }

  try {
    const col = fs.collection(db, `${BASE_PREFIX}orders`);
    const docRef = await fs.addDoc(col, {
      ...base,
      createdAt: base.createdAt,
      updatedAt: base.updatedAt
    });
    console.info('[db] order created', docRef.id);
    return docRef.id;
  } catch (e) {
    console.error('[db] createOrder Firestore falló, usando SIM', e);
    return createOrderSim(base);
  }
}

/**
 * Suscripción de cocina:
 * Llama onChange(listaOrdenesOrdenadas)
 */
export async function subscribeOrders(onChange) {
  const db = getDb();
  const fs = db ? await ensureFirestorePkg() : null;

  if (!db || !fs) {
    console.warn('[db] subscribeOrders en modo SIM');
    return subscribeSim(onChange);
  }

  const col = fs.collection(db, `${BASE_PREFIX}orders`);
  const q = fs.query(col, fs.orderBy('createdAt', 'asc'));

  const unsub = fs.onSnapshot(
    q,
    snap => {
      const items = [];
      snap.forEach(doc => {
        items.push({ id: doc.id, ...doc.data() });
      });
      onChange(items);
    },
    err => {
      console.error('[db] onSnapshot error, cambiando a SIM', err);
      // fallback a SIM si se cae Firestore
      unsub();
      subscribeSim(onChange);
    }
  );

  return unsub;
}

/**
 * Actualizar estado de un pedido (desde cocina).
 */
export async function updateOrderStatus(id, status, extra = {}) {
  const db = getDb();
  const fs = db ? await ensureFirestorePkg() : null;

  if (!db || !fs) {
    updateStatusSim(id, status, extra);
    return;
  }

  try {
    const ref = fs.doc(db, `${BASE_PREFIX}orders/${id}`);
    await fs.updateDoc(ref, {
      status,
      ...extra,
      updatedAt: Date.now()
    });
  } catch (e) {
    console.error('[db] updateOrderStatus error, usando SIM', e);
    updateStatusSim(id, status, extra);
  }
}
