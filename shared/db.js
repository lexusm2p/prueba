// /shared/db.js
// Firestore + catálogo con fallback (Firestore → /data/menu.json → /shared/catalog.json)
// Órdenes, settings (ETA/HH/Theme), inventario, recetas/producción, artículos, products (opcional) y clientes.

import {
  db, ensureAuth,
  serverTimestamp, doc, getDoc, setDoc, updateDoc, addDoc, collection,
  onSnapshot, query, where, orderBy, limit, Timestamp, increment
} from './firebase.js';

/* =============== Utilidades de fecha =============== */
export function startOfToday() { const d = new Date(); d.setHours(0,0,0,0); return d; }
export function toTs(d) { return Timestamp.fromDate(new Date(d)); }

/* =============== Catálogo: fetch con fallback =============== */
// Normaliza el catálogo a la forma esperada por el kiosko/admin
function normalizeCatalog(cat = {}) {
  const safe = (x, def=[]) => Array.isArray(x) ? x : (x ? [x] : def);
  const appSettings = {
    miniMeatGrams: Number(cat?.appSettings?.miniMeatGrams ?? 45),
    meatGrams: Number(cat?.appSettings?.meatGrams ?? 85),
    defaultSuggestMlPerOrder: Number(cat?.appSettings?.defaultSuggestMlPerOrder ?? 20),
    lowStockThreshold: Number(cat?.appSettings?.lowStockThreshold ?? 5)
  };
  const happyHour = {
    enabled: !!cat?.happyHour?.enabled,
    discountPercent: Number(cat?.happyHour?.discountPercent ?? 0),
    bannerText: String(cat?.happyHour?.bannerText ?? ''),
    applyEligibleOnly: cat?.happyHour?.applyEligibleOnly !== false,
    endsAt: cat?.happyHour?.endsAt ?? null
  };
  return {
    burgers: safe(cat.burgers),
    minis:   safe(cat.minis),
    drinks:  safe(cat.drinks),
    sides:   safe(cat.sides),
    extras: {
      sauces: safe(cat?.extras?.sauces ?? []),
      ingredients: safe(cat?.extras?.ingredients ?? []),
      ingredientPrice: Number(cat?.extras?.ingredientPrice ?? 0),
      saucePrice: Number(cat?.extras?.saucePrice ?? 0),
      dlcCarneMini: Number(cat?.extras?.dlcCarneMini ?? 0)
    },
    appSettings,
    happyHour
  };
}

// Ruta relativa segura desde /kiosk/ y /admin/
function guessDataPath() {
  // ambos (kiosk y admin) están 1 nivel dentro del root
  // /kiosk/*  -> ../data/menu.json
  // /admin/*  -> ../data/menu.json
  return '../data/menu.json';
}

export async function fetchCatalogWithFallback() {
  // 1) Firestore: /settings/catalog (o /catalog/public)
  try {
    const d1 = await getDoc(doc(db, 'settings', 'catalog'));
    if (d1.exists()) return normalizeCatalog(d1.data());
  } catch {}

  try {
    const d2 = await getDoc(doc(db, 'catalog', 'public'));
    if (d2.exists()) return normalizeCatalog(d2.data());
  } catch {}

  // 2) Archivo en /data/menu.json (lo que tú tienes)
  try {
    const res = await fetch(guessDataPath(), { cache: 'no-store' });
    if (res.ok) return normalizeCatalog(await res.json());
  } catch {}

  // 3) Fallback adicional (opcional) /shared/catalog.json
  try {
    const res2 = await fetch('../shared/catalog.json', { cache:'no-store' });
    if (res2.ok) return normalizeCatalog(await res2.json());
  } catch {}

  // 4) Último recurso: catálogo vacío “seguro”
  return normalizeCatalog({});
}

/* Solo lectura para Admin (tabla de productos derivados del catálogo) */
export function subscribeProducts(cb) {
  // Como el catálogo no está en una colección “products”, emitimos uno único
  // basado en fetchCatalogWithFallback(). Si luego migras a Firestore, reemplaza aquí.
  (async () => {
    const cat = await fetchCatalogWithFallback();
    const items = [
      ...(cat.burgers||[]).map(p => ({...p, type:'burger'})),
      ...(cat.minis||[]).map(p => ({...p, type:'mini'})),
      ...(cat.drinks||[]).map(p => ({...p, type:'drink'})),
      ...(cat.sides||[]).map(p => ({...p, type:'side'})),
    ];
    cb(items);
  })();
}

/* =============== Órdenes =============== */
export function subscribeActiveOrders(cb) {
  const active = ['PENDING','COOKING','IN_PROGRESS','READY'];
  const qy = query(
    collection(db, 'orders'),
    where('createdAt', '>=', toTs(startOfToday())),
    where('status', 'in', active),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(qy, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

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
export async function setOrderStatus(id, status) {
  await ensureAuth();
  await updateDoc(doc(db, 'orders', id), { status, updatedAt: serverTimestamp() });
}

export async function getOrdersRange({ from, to, includeArchive=false, orderType=null }) {
  const _from = toTs(from);
  const _to   = toTs(to);
  const col   = includeArchive ? 'orders_archive' : 'orders';

  // Para máxima compatibilidad (kiosko guarda `orderType` top-level):
  const qy = query(
    collection(db, col),
    where('createdAt', '>=', _from),
    where('createdAt', '<', _to),
    orderBy('createdAt', 'asc')
  );

  // getDocs dinámico sin romper tu bundle
  const { getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  const snap = await getDocs(qy);
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (orderType && orderType !== 'all') {
    rows = rows.filter(o =>
      (o.orderType && o.orderType === orderType) ||
      (o.orderMeta?.type && o.orderMeta.type === orderType)
    );
  }
  return rows;
}

/* =============== Settings (ETA, HappyHour, Theme, App Settings) =============== */
const SETTINGS = 'settings';

// ✅ Helper: Asegurar que los cambios “administrativos” solo se hagan desde /admin/
function assertAdminContext() {
  const path = (typeof location !== 'undefined' ? location.pathname : '') || '';
  const inAdmin = /\/admin(\/|$)/.test(path);
  if (!inAdmin) {
    throw new Error('Acceso denegado: esta operación solo está permitida desde el panel de Admin.');
  }
}

// ETA: emitimos SIEMPRE texto (soporta {text} o {minutes})
export async function setETA(text) {
  assertAdminContext();
  await ensureAuth();
  await setDoc(doc(db, SETTINGS, 'eta'),
    { text: String(text), updatedAt: serverTimestamp() },
    { merge: true });
}
export function subscribeETA(cb) {
  return onSnapshot(doc(db, SETTINGS, 'eta'), (d) => {
    const data = d.data() ?? null;
    if (!data) return cb(null);
    // compat: si guardaste {minutes: "7–10 min"}
    const text = data.text ?? data.minutes ?? null;
    cb(text == null ? null : String(text));
  });
}

// Happy Hour
export async function setHappyHour(payload) {
  assertAdminContext();
  await ensureAuth();
  await setDoc(doc(db, SETTINGS, 'happyHour'),
    { ...payload, updatedAt: serverTimestamp() },
    { merge: true });
}
export function subscribeHappyHour(cb) {
  return onSnapshot(doc(db, SETTINGS, 'happyHour'), (d) => cb(d.data() ?? null));
}

// THEME — ⚠️ Admin‑only
export async function setTheme({ name, overrides = {} }) {
  // Bloqueo “duro” en cliente para que el kiosko no pueda escribir el tema global.
  assertAdminContext();
  await ensureAuth();
  await setDoc(doc(db, SETTINGS, 'theme'),
    { name, overrides, updatedAt: serverTimestamp() },
    { merge: true });
}
export function subscribeTheme(cb) {
  return onSnapshot(doc(db, SETTINGS, 'theme'), (d) => cb(d.data() ?? null));
}

// App settings genéricos (para admin: lowStockThreshold, sauceCupItemId, etc.)
export function subscribeSettings(cb) {
  return onSnapshot(doc(db, SETTINGS, 'app'), (d) => cb(d.data() ?? {}));
}

/* =============== Inventario / Compras / Proveedores =============== */
export function subscribeInventory(cb) {
  const qy = query(collection(db, 'inventory'), orderBy('name','asc'));
  return onSnapshot(qy, (snap)=> cb(snap.docs.map(d=>({ id:d.id, ...d.data() }))));
}
export async function upsertInventoryItem(item) {
  assertAdminContext();
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
  assertAdminContext();
  await ensureAuth();
  const ref = supp.id ? doc(db,'suppliers', supp.id) : doc(collection(db,'suppliers'));
  await setDoc(ref, { ...supp, updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
}

export async function recordPurchase(purchase) {
  assertAdminContext();
  await ensureAuth();
  // Guarda compra y actualiza costo promedio simple / existencias
  const { itemId, qty=0, unitCost=0 } = purchase || {};
  await addDoc(collection(db,'purchases'), { ...purchase, createdAt: serverTimestamp() });

  if (itemId && qty > 0) {
    const ref = doc(db,'inventory', itemId);
    const snap = await getDoc(ref);
    const cur  = snap.exists() ? (snap.data().currentStock||0) : 0;
    const prevCost = snap.exists() ? Number(snap.data().costAvg||0) : 0;
    // Ponderación simple: si no hay stock previo, toma unitCost; si hay, promedio simple
    const newStock = Number(cur) + Number(qty);
    const newCost  = (prevCost>0 && cur>0) ? ((prevCost*cur + unitCost*qty) / newStock) : unitCost;
    await setDoc(ref,
      { currentStock: newStock, costAvg: newCost, updatedAt: serverTimestamp() },
      { merge:true }
    );
  }
}

// Movimiento directo de stock (admin: cups, producción, etc.)
export async function adjustStock(itemId, delta, reason='use', meta={}) {
  assertAdminContext();
  if (!itemId || !Number.isFinite(delta)) return;
  await ensureAuth();
  const ref = doc(db,'inventory', itemId);
  await setDoc(ref, { currentStock: increment(Number(delta)), updatedAt: serverTimestamp() }, { merge:true });
  await addDoc(collection(db,'inventory_moves'), {
    itemId, delta:Number(delta), reason, meta, createdAt: serverTimestamp()
  });
}

/* =============== Recetario / Producción =============== */
export function subscribeRecipes(cb) {
  const qy = query(collection(db, 'recipes'), orderBy('name','asc'));
  return onSnapshot(qy, (snap)=> cb(snap.docs.map(d=>({ id:d.id, ...d.data() }))));
}

// Compat con Admin: produceBatch({ recipeId, outputQty })
export async function produceBatch({ recipeId, outputQty }) {
  assertAdminContext();
  if (!recipeId || !(outputQty > 0)) throw new Error('Datos de producción inválidos');
  await ensureAuth();
  await addDoc(collection(db, 'productions'), {
    recipeId, outputQty,
    createdAt: serverTimestamp()
  });
}

/* =============== Artículos (CRUD Admin) =============== */
export function subscribeArticles(cb) {
  const qy = query(collection(db, 'articles'), orderBy('updatedAt','desc'), limit(100));
  return onSnapshot(qy, (snap)=> cb(snap.docs.map(d=>({ id:d.id, ...d.data() }))));
}
export async function upsertArticle(article) {
  assertAdminContext();
  await ensureAuth();
  const ref = article.id ? doc(db,'articles', article.id) : doc(collection(db,'articles'));
  await setDoc(ref, { ...article, updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
}
export async function deleteArticle(id) {
  assertAdminContext();
  await ensureAuth();
  await updateDoc(doc(db,'articles', id), { deletedAt: serverTimestamp() });
}

/* Helpers de Artículos para “edición limitada / destacados” */
export async function fetchFeaturedArticles() {
  // NOTA: si necesitas filtros más finos por fecha, se puede migrar a getDocs con where.
  return new Promise((resolve) => {
    const qy = query(collection(db, 'articles'), orderBy('updatedAt','desc'), limit(100));
    const unsub = onSnapshot(qy, (snap) => {
      const list = snap.docs.map(d=> ({ id:d.id, ...d.data() }));
      resolve(list.filter(a => a?.featured && !a?.deletedAt));
      unsub(); // una sola lectura “rápida”
    });
  });
}

export function mergeCatalogWithArticles(cat, articles=[]) {
  // mezcla sencilla: agrega artículos destacados por categoría existente
  const acc = {
    burgers: [...(cat?.burgers||[])],
    minis:   [...(cat?.minis||[])],
    drinks:  [...(cat?.drinks||[])],
    sides:   [...(cat?.sides||[])],
    extras:  { ...(cat?.extras||{}) },
    appSettings: cat?.appSettings || {},
    happyHour:   cat?.happyHour || {}
  };
  for (const a of (articles||[])) {
    if (!a?.category || !a?.featured || a?.deletedAt) continue;
    if (a.category === 'burgers') acc.burgers.push(a);
    else if (a.category === 'minis') acc.minis.push(a);
    else if (a.category === 'drinks') acc.drinks.push(a);
    else if (a.category === 'sides') acc.sides.push(a);
  }
  return acc;
}

/* =============== Products (CRUD opcional “oficial”) =============== */
// Suscripción en vivo a colección products (si decides usarla)
export function subscribeProductsLive(cb) {
  const qy = query(collection(db, 'products'), orderBy('updatedAt','desc'), limit(200));
  return onSnapshot(qy, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function upsertProduct(product) {
  assertAdminContext();
  await ensureAuth();
  const ref = product?.id
    ? doc(db, 'products', product.id)
    : doc(collection(db, 'products'));
  await setDoc(ref, {
    ...product,
    updatedAt: serverTimestamp(),
    createdAt: product?.createdAt ?? serverTimestamp()
  }, { merge: true });
  return ref.id;
}

export async function deleteProduct(id) {
  assertAdminContext();
  await ensureAuth();
  // Borrado suave: marca deletedAt (para conservar histórico/SEO interno)
  await setDoc(doc(db, 'products', id), { deletedAt: serverTimestamp() }, { merge: true });
}

/* =============== Clientes (kiosko: autocompletar por teléfono) =============== */
export async function fetchCustomer(phoneDigits) {
  const id = String(phoneDigits||'').replace(/\D+/g,'');
  if (!id) return null;
  const d1 = await getDoc(doc(db,'customers', id));
  return d1.exists() ? d1.data() : null;
}
export async function upsertCustomerFromOrder(order) {
  const phone = String(order?.phone||'').replace(/\D+/g,'');
  if (!phone) return;
  await ensureAuth();
  await setDoc(doc(db,'customers', phone), {
    phone, name: order?.customer || null, updatedAt: serverTimestamp()
  }, { merge:true });
}
export async function attachLastOrderRef(phone, orderId) {
  const id = String(phone||'').replace(/\D+/g,'');
  if (!id || !orderId) return;
  await ensureAuth();
  await setDoc(doc(db,'customers', id), {
    lastOrderId: orderId, lastOrderAt: serverTimestamp()
  }, { merge:true });
}