// shared/db.js · Seven V2
// Fuente unificada para Kiosko, Cocina y Admin.
// Compatible con Firestore real y con modo SIM (localStorage).

/* ======================= Base prefix & colección ======================= */
/**
 * Ejemplos en GitHub Pages:
 *   /prueba/v2/kiosk/...
 *   /prueba/v2/cocina/...
 *
 * parts  = ["prueba","v2","kiosk"]
 * baseSeg= ["prueba","v2"]
 *
 * BASE_PREFIX       = "/prueba/v2/"
 * ORDERS_COLLECTION = "prueba/v2/orders"
 *
 * En un dominio propio, p.ej. /kiosk/ (sin "v2"):
 * BASE_PREFIX       = "/"
 * ORDERS_COLLECTION = "orders"
 */

const locPath =
  typeof window !== "undefined" && window.location && window.location.pathname
    ? window.location.pathname
    : "/";

const parts = locPath.split("/").filter(Boolean);
const idxV2 = parts.indexOf("v2");
const baseSeg = idxV2 >= 0 ? parts.slice(0, idxV2 + 1) : [];

// Solo para referencias en UI / logs
export const BASE_PREFIX = baseSeg.length ? "/" + baseSeg.join("/") + "/" : "/";

// Nombre de colección en Firestore (IMPORTANTE: sin "/" inicial)
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

function getDb() {
  if (typeof window === "undefined") return null;
  return (
    window.FIREBASE_DB ||      // recomendado (set en firebase.js)
    window.firebaseDb ||       // alias posible
    window.db ||               // compat antiguo
    null
  );
}

let _firestorePkg = null;

/**
 * Carga perezosa del SDK de Firestore.
 * 1) Usa window.FIREBASE_FS si existe (inyectado por firebase.js).
 * 2) Si hay DB pero no FIREBASE_FS → import dinámico.
 * 3) Si no hay nada → null → modo SIM.
 */
async function ensureFirestorePkg() {
  if (_firestorePkg) return _firestorePkg;

  if (typeof window !== "undefined" && window.FIREBASE_FS) {
    _firestorePkg = window.FIREBASE_FS;
    console.info("[db] Firestore SDK desde firebase.js");
    return _firestorePkg;
  }

  const db = getDb();
  if (!db) {
    console.warn("[db] Sin instancia Firestore, usando modo SIM");
    return null;
  }

  try {
    const mod = await import(
      "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js"
    );
    _firestorePkg = {
      collection:      mod.collection,
      addDoc:          mod.addDoc,
      onSnapshot:      mod.onSnapshot,
      query:           mod.query,
      orderBy:         mod.orderBy,
      updateDoc:       mod.updateDoc,
      doc:             mod.doc,
      getDoc:          mod.getDoc,
      setDoc:          mod.setDoc,
      getDocs:         mod.getDocs,
      where:           mod.where,
      limit:           mod.limit,
      serverTimestamp: mod.serverTimestamp || (() => Date.now())
    };
    console.info("[db] Firestore SDK dinámico listo");
  } catch (e) {
    console.warn("[db] No se pudo cargar Firestore dinámico, modo SIM", e);
    _firestorePkg = null;
  }
  return _firestorePkg;
}

// Versión síncrona para wrappers (theme.js, etc.)
function getFsSync() {
  if (_firestorePkg) return _firestorePkg;
  if (typeof window !== "undefined" && window.FIREBASE_FS) {
    _firestorePkg = window.FIREBASE_FS;
    return _firestorePkg;
  }
  return null;
}

/* ======================= SIM (localStorage compartido) ======================= */

function readSimOrders() {
  if (typeof window === "undefined" || !window.localStorage) return [];
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
  if (typeof window === "undefined" || !window.localStorage) return;
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
    createdAt: order?.createdAt || now,
    updatedAt: now,
    status: (order && order.status) || "pending",
    source: (order && order.source) || "kiosk-v2-sim"
  };
  all.push(full);
  writeSimOrders(all);
  console.info("[db] [SIM] order created", id);
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
  console.info("[db] [SIM] status update", id, "=>", status);
}

/* ======================= Normalizadores útiles ======================= */

function normPhone(p) {
  return String(p || "")
    .replace(/[^\d]+/g, "") // solo dígitos
    .replace(/^52(\d{10})$/, "$1") // limpia 52 si viene junto
    .trim();
}

/* ======================= API pública ======================= */

/**
 * Crear pedido (Firestore o SIM)
 */
export async function createOrder(order = {}) {
  const base = {
    createdAt: order.createdAt || Date.now(),
    updatedAt: Date.now(),
    status:    order.status || "pending",
    source:    order.source || "kiosk-v2",
    ...order
  };

  const db = getDb();
  const fs = db ? await ensureFirestorePkg() : null;

  if (!db || !fs) {
    return createOrderSim(base);
  }

  try {
    const colRef = fs.collection(db, ORDERS_COLLECTION);
    const docRef = await fs.addDoc(colRef, {
      ...base,
      createdAt: base.createdAt,
      updatedAt: base.updatedAt
    });
    console.info("[db] [FS] order created", docRef.id);
    return docRef.id;
  } catch (e) {
    console.error("[db] [FS] createOrder falló, usando SIM", e);
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
    const colRef = fs.collection(db, ORDERS_COLLECTION);
    const q = fs.query(colRef, fs.orderBy("createdAt", "asc"));

    const unsub = fs.onSnapshot(
      q,
      snap => {
        const items = [];
        snap.forEach(docSnap => items.push({ id: docSnap.id, ...docSnap.data() }));
        onChange(items);
      },
      err => {
        console.error("[db] [FS] onSnapshot error, cambiando a SIM", err);
        unsub();
        subscribeSim(onChange);
      }
    );

    return unsub;
  } catch (e) {
    console.error("[db] [FS] subscribeOrders error, usando SIM", e);
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
    console.info("[db] [FS] status update", id, "=>", status);
  } catch (e) {
    console.error("[db] [FS] updateOrderStatus error, usando SIM", e);
    updateStatusSim(id, status, extra);
  }
}

/* ========== Historial por teléfono (para “Partida guardada”) ========== */

/**
 * Devuelve los últimos N pedidos para un teléfono.
 * Usa:
 *  - Firestore si está disponible.
 *  - SIM (localStorage) como fallback.
 *
 * El kiosko V2 usa esto para mostrar:
 *   💾 Partida guardada → “¿Lo mismo de siempre?”
 */
export async function getLastOrdersByPhone(phone, limit = 2) {
  const raw = String(phone || "").trim();
  const norm = normPhone(raw);
  const max = Math.max(1, limit | 0 || 2);

  if (!raw && !norm) return [];

  const db = getDb();
  const fs = db ? await ensureFirestorePkg() : null;

  // === SIM / sin Firestore / sin helpers ===
  if (!db || !fs || !fs.getDocs || !fs.where || !fs.limit) {
    const all = readSimOrders();
    if (!all.length) return [];
    return all
      .filter(o => {
        const pRaw  = String(o.phone || o.customerPhone || "").trim();
        const pNorm = normPhone(pRaw);
        if (!pRaw && !pNorm) return false;
        if (norm && pNorm) return pNorm === norm;
        return pRaw === raw;
      })
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, max);
  }

  // === Firestore real ===
  try {
    const colRef = fs.collection(db, ORDERS_COLLECTION);
    const results = [];

    // 1) intento directo con raw
    if (raw) {
      const q1 = fs.query(
        colRef,
        fs.where("phone", "==", raw),
        fs.orderBy("createdAt", "desc"),
        fs.limit(max)
      );
      const snap1 = await fs.getDocs(q1);
      snap1.forEach(docSnap => {
        results.push({ id: docSnap.id, ...docSnap.data() });
      });
    }

    // 2) si no hubo suficientes y el normalizado es distinto, intentamos con norm
    if (results.length < max && norm && norm !== raw) {
      const q2 = fs.query(
        colRef,
        fs.where("phone", "==", norm),
        fs.orderBy("createdAt", "desc"),
        fs.limit(max)
      );
      const snap2 = await fs.getDocs(q2);
      snap2.forEach(docSnap => {
        const data = { id: docSnap.id, ...docSnap.data() };
        if (!results.find(r => r.id === data.id)) {
          results.push(data);
        }
      });
    }

    // Sanitiza + top N
    return results
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, max);
  } catch (e) {
    console.error("[db] getLastOrdersByPhone error, usando SIM", e);
    // Fallback a SIM
    const all = readSimOrders();
    return all
      .filter(o => {
        const pRaw  = String(o.phone || o.customerPhone || "").trim();
        const pNorm = normPhone(pRaw);
        if (!pRaw && !pNorm) return false;
        if (norm && pNorm) return pNorm === norm;
        return pRaw === raw;
      })
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, max);
  }
}

/**
 * Alias más genérico por si en algún lado ya se usa este nombre.
 * getCustomerOrders(phone, { limit })
 */
export async function getCustomerOrders(phone, opts = {}) {
  const limit = typeof opts.limit === "number" ? opts.limit : 5;
  return getLastOrdersByPhone(phone, limit);
}

/* ======================= Exports para compatibilidad ======================= */

// Para imports antiguos: import { db } from './db.js'
export const db = getDb();

/**
 * Wrappers sincronizados para theme.js / otros módulos.
 * Si aún no hay Firestore cargado ni FIREBASE_FS,
 * lanzan error controlable (que el caller puede atrapar).
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

// Helper opcional
export function ensureFs() {
  return ensureFirestorePkg();
}

export default {
  createOrder,
  subscribeOrders,
  updateOrderStatus,
  getLastOrdersByPhone,
  getCustomerOrders,
  BASE_PREFIX,
  ORDERS_COLLECTION,
  db,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  ensureFs
};
