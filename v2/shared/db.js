// shared/db.js · Seven V2
// Fuente unificada para Kiosko, Cocina y Admin.
// Compatible con Firestore real y con modo SIM (localStorage).

/* ======================= Base prefix ======================= */
/**
 * Ejemplos de rutas:
 *   /prueba/v2/kiosk/...
 *   /prueba/v2/cocina/...
 * Resultado deseado:
 *   BASE_PREFIX = /prueba/v2/
 */
const parts = (location.pathname || "/").split("/").filter(Boolean);
const idxV2 = parts.indexOf("v2");

export const BASE_PREFIX =
  idxV2 >= 0 ? "/" + parts.slice(0, idxV2 + 1).join("/") + "/" : "/";

const LS_NAMESPACE =
  (BASE_PREFIX.replace(/\W+/g, "-") || "seven") + "-orders-sim";
const ORDERS_KEY = LS_NAMESPACE;

console.info("[db] BASE_PREFIX =", BASE_PREFIX, "LS namespace =", LS_NAMESPACE);

/* ======================= Firestore helpers ======================= */

/**
 * Obtiene la instancia de Firestore creada en firebase.js
 * Debes asegurarte en firebase.js de hacer:
 *   window.FIREBASE_DB = db;
 *   window.FIREBASE_FS = { collection, addDoc, ... }
 */
function getDb() {
  return (
    window.FIREBASE_DB || // recomendado (getFirestore(app))
    window.firebaseDb || // alias posible
    window.db || // compatibilidad vieja
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
      serverTimestamp: mod.serverTimestamp || (() => Date.now()),
    };
    console.info("[db] Firestore SDK dinámico listo");
  } catch (e) {
    console.warn("[db] No se pudo cargar Firestore dinámico, modo SIM", e);
    _firestorePkg = null;
  }
  return _firestorePkg;
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
    source: order.source || "kiosk-v2-sim",
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
  const i = all.findIndex((o) => o.id === id);
  if (i === -1) return;
  all[i] = {
    ...all[i],
    status,
    ...extra,
    updatedAt: Date.now(),
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
    ...order,
  };

  const db = getDb();

  // Si no hay instancia Firestore → SIM
  if (!db) {
    return createOrderSim(base);
  }

  const fs = await ensureFirestorePkg();
  if (!fs) {
    return createOrderSim(base);
  }

  try {
    const col = fs.collection(db, `${BASE_PREFIX}orders`);
    const docRef = await fs.addDoc(col, {
      ...base,
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
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

  const col = fs.collection(db, `${BASE_PREFIX}orders`);
  const q = fs.query(col, fs.orderBy("createdAt", "asc"));

  const unsub = fs.onSnapshot(
    q,
    (snap) => {
      const items = [];
      snap.forEach((docSnap) =>
        items.push({ id: docSnap.id, ...docSnap.data() })
      );
      onChange(items);
    },
    (err) => {
      console.error("[db] onSnapshot error, cambiando a SIM", err);
      unsub();
      subscribeSim(onChange);
    }
  );

  return unsub;
}

/**
 * Actualizar estado de pedido
 */
export async function updateOrderStatus(id, status, extra = {}) {
  const db = getDb();
  const fs = db ? await ensureFirestorePkg() : null;

  if (!db || !fs) {
    // En modo SIM actualizamos en localStorage
    updateStatusSim(id, status, extra);
    return;
  }

  try {
    const ref = fs.doc(db, `${BASE_PREFIX}orders/${id}`);
    await fs.updateDoc(ref, {
      status,
      ...extra,
      updatedAt: Date.now(),
    });
  } catch (e) {
    console.error("[db] updateOrderStatus error, usando SIM", e);
    updateStatusSim(id, status, extra);
  }
}

/* ======================= Exports para compatibilidad ======================= */

/**
 * Muchos módulos antiguos esperan poder hacer:
 *   import { db } from './db.js'
 * Esto siempre lee la instancia actual (o null si no hay).
 */
export const db = getDb();

/**
 * Wrappers mínimos para compatibilidad con theme.js u otros.
 * Si aún no hay Firestore cargado, lanzan error controlable.
 */

export const doc = (...args) => {
  if (!_firestorePkg?.doc) {
    throw new Error("[db] doc() no disponible (Firestore no cargado)");
  }
  return _firestorePkg.doc(...args);
};

export const getDoc = (...args) => {
  if (!_firestorePkg?.getDoc) {
    throw new Error("[db] getDoc() no disponible (Firestore no cargado)");
  }
  return _firestorePkg.getDoc(...args);
};

export const setDoc = (...args) => {
  if (!_firestorePkg?.setDoc) {
    throw new Error("[db] setDoc() no disponible (Firestore no cargado)");
  }
  return _firestorePkg.setDoc(...args);
};

export const onSnapshot = (...args) => {
  if (!_firestorePkg?.onSnapshot) {
    throw new Error(
      "[db] onSnapshot() no disponible (Firestore no cargado)"
    );
  }
  return _firestorePkg.onSnapshot(...args);
};

/**
 * Helper opcional por si algún módulo quiere forzar la carga del SDK
 */
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
  db,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  ensureFs,
};

export default defaultExport;
