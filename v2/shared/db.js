// shared/db.js · Seven V2
// Fuente unificada para Kiosko, Cocina y Admin.
// Compatible con Firestore real y con modo SIM (localStorage).

/* ======================= Base prefix & colección ======================= */
/**
 * Ejemplos en GitHub Pages:
 *   https://lexusm2p.github.io/prueba/v2/kiosk/...
 *   https://lexusm2p.github.io/prueba/v2/cocina/...
 *
 * parts  = ["prueba","v2","kiosk"]
 * baseSeg= ["prueba","v2"]
 *
 * BASE_PREFIX       = "/prueba/v2/"
 * ORDERS_COLLECTION = "prueba/v2/orders"
 *
 * En un dominio propio tipo:
 *   https://midominio.com/kiosk/...
 * parts=["kiosk"], no hay "v2" -> base vacía:
 * BASE_PREFIX       = "/"
 * ORDERS_COLLECTION = "orders"
 *
 * Así ambos (kiosko/cocina) comparten la MISMA colección siempre.
 */

const parts = (location.pathname || "/").split("/").filter(Boolean);
const idxV2 = parts.indexOf("v2");
const baseSeg = idxV2 >= 0 ? parts.slice(0, idxV2 + 1) : [];

// Prefijo sólo para logs/tema, NO se usa directo en collection() porque ahí no acepta "/" inicial.
export const BASE_PREFIX = baseSeg.length ? "/" + baseSeg.join("/") + "/" : "/";

// Colección real en Firestore (sin "/" inicial, formato válido)
export const ORDERS_COLLECTION =
  (baseSeg.length ? baseSeg.join("/") + "/" : "") + "orders";

// Namespace de SIM (localStorage) alineado al path real
const LS_NAMESPACE =
  (ORDERS_COLLECTION.replace(/\W+/g, "-") || "seven-orders") + "-sim";

const ORDERS_KEY = LS_NAMESPACE;

console.info(
  "[db] BASE_PREFIX =", BASE_PREFIX,
  "ORDERS_COLLECTION =", ORDERS_COLLECTION,
  "LS namespace =", LS_NAMESPACE
);

/* ======================= Firestore helpers ======================= */

/**
 * Obtiene la instancia de Firestore creada en firebase.js.
 * Asegúrate en firebase.js de hacer:
 *   window.FIREBASE_DB = db;
 *   window.FIREBASE_FS = { collection, addDoc, onSnapshot, query, orderBy, updateDoc, doc, getDoc, setDoc, serverTimestamp }
 */
function getDb() {
  return (
    window.FIREBASE_DB ||    // recomendado (getFirestore(app))
    window.firebaseDb ||     // alias posible
    window.db ||             // compat viejo
    null
  );
}

let _firestorePkg = null;

/**
 * Carga perezosa del SDK de Firestore.
 * 1) Si firebase.js expuso window.FIREBASE_FS -> lo usamos.
 * 2) Si hay db real pero no FIREBASE_FS -> import dinámico (10.12.5).
 * 3) Si no hay nada -> seguimos en modo SIM.
 */
async function ensureFirestorePkg() {
  if (_firestorePkg) return _firestorePkg;

  // Preferir lo que dejó firebase.js
  if (window.FIREBASE_FS) {
    _firestorePkg = window.FIREBASE_FS;
    console.info("[db] Firestore SDK desde firebase.js");
    return _firestorePkg;
  }

  const db = getDb();
  if (!db) {
    console.warn("[db] Sin instancia Firestore, modo SIM");
    return null;
  }

  try {
    const mod = await import(
      "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js"
    );
    _firestorePkg = {
      collection: mod.collection,
      addDoc: mod.addDoc,
      onSnapshot: mod.onSnapshot,
      query: mod.query,
      orderBy: mod.orderBy,
      updateDoc: mod.updateDoc,
      doc: mod.doc,
      getDoc: mod.getDoc,
      setDoc: mod.setDoc,
      serverTimestamp: mod.serverTimestamp || (() => Date.now())
    };
    console.info("[db] Firestore SDK dinámico listo");
  } catch (e) {
    console.warn("[db] No se pudo cargar Firestore dinámico, modo SIM", e);
    _firestorePkg = null;
  }
  return _firestorePkg;
}

// Versión síncrona para los wrappers (theme.js, etc)
function getFsSync() {
  if (_firestorePkg) return _firestorePkg;
  if (window.FIREBASE_FS) {
    _firestorePkg = window.FIREBASE_FS;
    return _firestorePkg;
  }
  return null;
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
    status: order.status || "pending",
    source: order.source || "kiosk-v2-sim"
  };
  all.push(full);
  writeSimOrders(all);
  console.info("[db] order created SIM", id);
  return id;
}

function subscribeSim(onChange) {
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
 * Crear pedido (Firestore o SIM)
 */
export async function createOrder(order) {
  const base = {
    createdAt: order?.createdAt || Date.now(),
    updatedAt: Date.now(),
    status: (order && order.status) || "pending",
    source: (order && order.source) || "kiosk-v2",
    ...order
  };

  const db = getDb();
  if (!db) {
    // Sin Firestore real -> SIM compartido (entre pestañas mismas origen)
    return createOrderSim(base);
  }

  const fs = await ensureFirestorePkg();
  if (!fs) {
    return createOrderSim(base);
  }

  try {
    const col = fs.collection(db, ORDERS_COLLECTION);
    const docRef = await fs.addDoc(col, {
      ...base,
      createdAt: base.createdAt,
      updatedAt: base.updatedAt
    });
    console.info("[db] order created", docRef.id);
    return docRef.id;
  } catch (e) {
    console.error("[db] createOrder Firestore falló, usando SIM", e);
    return createOrderSim(base);
  }
}

/**
 * Suscripción de pedidos (para cocina/admin)
 */
export async function subscribeOrders(onChange) {
  const db = getDb();
  const fs = db ? await ensureFirestorePkg() : null;

  if (!db || !fs) {
    console.warn("[db] subscribeOrders en modo SIM");
    return subscribeSim(onChange);
  }

  try {
    const col = fs.collection(db, ORDERS_COLLECTION);
    const q = fs.query(col, fs.orderBy("createdAt", "asc"));

    const unsub = fs.onSnapshot(
      q,
      snap => {
        const items = [];
        snap.forEach(docSnap => items.push({ id: docSnap.id, ...docSnap.data() }));
        onChange(items);
      },
      err => {
        console.error("[db] onSnapshot error, cambiando a SIM", err);
        unsub();
        subscribeSim(onChange);
      }
    );

    return unsub;
  } catch (e) {
    console.error("[db] subscribeOrders error, usando SIM", e);
    return subscribeSim(onChange);
  }
}

/**
 * Actualizar estado de pedido
 */
export async function updateOrderStatus(id, status, extra = {}) {
  const db = getDb();
  const fs = db ? await ensureFirestorePkg() : null;

  if (!db || !fs) {
    updateStatusSim(id, status, extra);
    return;
  }

  try {
    const ref = fs.doc(db, `${ORDERS_COLLECTION}/${id}`);
    await fs.updateDoc(ref, {
      status,
      ...extra,
      updatedAt: Date.now()
    });
  } catch (e) {
    console.error("[db] updateOrderStatus error, usando SIM", e);
    updateStatusSim(id, status, extra);
  }
}

/* ======================= Exports para compatibilidad ======================= */

// Para imports antiguos: import { db } from './db.js'
export const db = getDb();

/**
 * Wrappers sincronizados para theme.js / otros módulos.
 * Si aún no hay Firestore cargado y no existe FIREBASE_FS,
 * lanzan error controlable (que tu código ya captura).
 */

export const doc = (...args) => {
  const fs = getFsSync();
  if (!fs?.doc) throw new Error("[db] doc() no disponible (Firestore no cargado)");
  return fs.doc(...args);
};

export const getDoc = (...args) => {
  const fs = getFsSync();
  if (!fs?.getDoc) throw new Error("[db] getDoc() no disponible (Firestore no cargado)");
  return fs.getDoc(...args);
};

export const setDoc = (...args) => {
  const fs = getFsSync();
  if (!fs?.setDoc) throw new Error("[db] setDoc() no disponible (Firestore no cargado)");
  return fs.setDoc(...args);
};

export const onSnapshot = (...args) => {
  const fs = getFsSync();
  if (!fs?.onSnapshot) {
    throw new Error("[db] onSnapshot() no disponible (Firestore no cargado)");
  }
  return fs.onSnapshot(...args);
};

// Helper opcional por si algún módulo quiere forzar la carga del SDK explícitamente
export function ensureFs() {
  return ensureFirestorePkg();
}

/**
 * Export default para imports sin destructuring:
 *   import DB from './db.js'
 */
const defaultExport = {
  createOrder,
  subscribeOrders,
  updateOrderStatus,
  BASE_PREFIX,
  ORDERS_COLLECTION,
  db,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  ensureFs
};

export default defaultExport;
