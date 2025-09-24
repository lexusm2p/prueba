// /shared/db.js
// Firestore + catálogo con fallback. Reportes, settings (ETA/HH/Theme),
// inventario, recetas/producción, artículos, clientes y órdenes.
// Modo PRUEBA: evita escrituras cuando opts.training === true.

import {
  db,
  ensureAuth,
  serverTimestamp,
  doc, getDoc, setDoc, updateDoc, addDoc, collection, deleteDoc,
  onSnapshot, query, where, orderBy, limit, Timestamp, increment, getDocs
} from './firebase.js';

/* =================== Utils =================== */
const sleep = (ms = 60) => new Promise(r => setTimeout(r, ms));
const toTs = (d) => Timestamp.fromDate(new Date(d));
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

async function guardWrite(training, realWriteFn, fakeValue = null) {
  if (!training) return realWriteFn();
  await sleep(60);
  return fakeValue ?? { ok: true, _training: true };
}

function toMillisFlexible(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return raw;
  if (typeof raw?.toMillis === 'function') return raw.toMillis();
  if (raw?.seconds != null) return raw.seconds * 1000 + Math.floor((raw.nanoseconds || 0) / 1e6);
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

const normPhone = (s = '') => String(s).replace(/\D+/g, '').slice(0, 15);

/* =================== Catálogo: fetch con fallback =================== */
function normalizeCatalog(cat = {}) {
  const safeArr = (x) => Array.isArray(x) ? x : (x ? [x] : []);
  const appSettings = {
    miniMeatGrams: Number(cat?.appSettings?.miniMeatGrams ?? 45),
    meatGrams: Number(cat?.appSettings?.meatGrams ?? 85),
    defaultSuggestMlPerOrder: Number(cat?.appSettings?.defaultSuggestMlPerOrder ?? 20),
    lowStockThreshold: Number(cat?.appSettings?.lowStockThreshold ?? 5),
  };
  const happyHour = {
    enabled: !!cat?.happyHour?.enabled,
    discountPercent: Number(cat?.happyHour?.discountPercent ?? 0),
    bannerText: String(cat?.happyHour?.bannerText ?? ''),
    applyEligibleOnly: cat?.happyHour?.applyEligibleOnly !== false,
    endsAt: toMillisFlexible(cat?.happyHour?.endsAt ?? null),
  };
  return {
    burgers: safeArr(cat.burgers),
    minis:   safeArr(cat.minis),
    drinks:  safeArr(cat.drinks),
    sides:   safeArr(cat.sides),
    extras: {
      sauces: safeArr(cat?.extras?.sauces ?? []),
      ingredients: safeArr(cat?.extras?.ingredients ?? []),
      ingredientPrice: Number(cat?.extras?.ingredientPrice ?? 0),
      saucePrice: Number(cat?.extras?.saucePrice ?? 0),
      dlcCarneMini: Number(cat?.extras?.dlcCarneMini ?? 0),
    },
    appSettings,
    happyHour,
  };
}

const guessDataPath = () => '../data/menu.json';

export async function fetchCatalogWithFallback() {
  try {
    const d1 = await getDoc(doc(db, 'settings', 'catalog'));
    if (d1.exists()) return normalizeCatalog(d1.data());
  } catch {}
  try {
    const d2 = await getDoc(doc(db, 'catalog', 'public'));
    if (d2.exists()) return normalizeCatalog(d2.data());
  } catch {}
  try {
    const r = await fetch(guessDataPath(), { cache: 'no-store' });
    if (r.ok) return normalizeCatalog(await r.json());
  } catch {}
  try {
    const r2 = await fetch('../shared/catalog.json', { cache: 'no-store' });
    if (r2.ok) return normalizeCatalog(await r2.json());
  } catch {}
  return normalizeCatalog({});
}

// Solo lectura (tabla de productos en Admin)
export function subscribeProducts(cb) {
  (async () => {
    const cat = await fetchCatalogWithFallback();
    const items = [
      ...(cat.burgers || []).map(p => ({ ...p, type: 'burger' })),
      ...(cat.minis || []).map(p => ({ ...p, type: 'mini' })),
      ...(cat.drinks || []).map(p => ({ ...p, type: 'drink' })),
      ...(cat.sides || []).map(p => ({ ...p, type: 'side' })),
    ];
    cb(items);
  })();
}

/* =================== Órdenes =================== */

// Crea una orden; acepta payload del kiosko.
export async function createOrder(order, opts = {}) {
  const { training = false } = opts;
  const payload = { ...order };

  // Normaliza marcas de tiempo y meta
  const createdAtClient = Number(payload.createdAt || Date.now());
  payload.createdAt = serverTimestamp();
  payload.createdAtClient = createdAtClient;
  payload.updatedAt = serverTimestamp();
  payload.status = String(payload.status || 'PENDING').toUpperCase();
  payload.orderMeta = {
    type: payload.orderType || payload?.orderMeta?.type || 'pickup',
    table: payload.table || payload?.orderMeta?.table || '',
    phone: payload.phone || payload?.orderMeta?.phone || '',
    payMethodPref: payload.payMethodPref || payload?.orderMeta?.payMethodPref || 'efectivo'
  };

  return guardWrite(training, async () => {
    await ensureAuth();
    const ref = await addDoc(collection(db, 'orders'), payload);
    return ref.id;
  }, `TRAIN-ORDER-${Date.now()}`);
}

// Suscribe pedidos del día (para feeds/ETA)
export function subscribeActiveOrders(cb, { limitN = 120 } = {}) {
  const qy = query(
    collection(db, 'orders'),
    where('createdAt', '>=', toTs(startOfToday())),
    orderBy('createdAt', 'desc'),
    limit(limitN)
  );
  return onSnapshot(qy, snap => {
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    cb(rows);
  });
}

// 🔪 Cocina: prioriza sólo estados activos, pero mantiene orden y tiempos
export function subscribeKitchenOrders(cb, { limitN = 200 } = {}) {
  return subscribeActiveOrders(list => {
    const set = new Set(['PENDING','IN_PROGRESS','READY','DELIVERED']);
    const filtered = (list||[]).filter(o => set.has(String(o.status||'').toUpperCase()));
    cb(filtered);
  }, { limitN });
}

// Aliases legacy
export const subscribeOrders = subscribeActiveOrders;
export const onOrdersSnapshot = subscribeActiveOrders;

// Suscripción puntual por OID (tracking por mesa/pickup)
export function subscribeOrder(orderId, cb) {
  if (!orderId) return () => {};
  const ref = doc(db, 'orders', String(orderId));
  return onSnapshot(ref, (d) => cb(d.exists() ? ({ id: d.id, ...d.data() }) : null));
}

// Update parcial con soporte a dot-notation (updateDoc ya lo soporta)
export async function updateOrder(id, patch, opts = {}) {
  const { training = false } = opts;
  if (!id || typeof patch !== 'object') throw new Error('updateOrder: datos inválidos');
  return guardWrite(training, async () => {
    await ensureAuth();
    await updateDoc(doc(db, 'orders', id), { ...patch, updatedAt: serverTimestamp() });
    return { ok: true };
  }, { ok: true, _training: true });
}

// Upsert (merge) — útil para shims
export async function upsertOrder(data, opts = {}) {
  const { training = false } = opts;
  const id = data?.id;
  if (!id) throw new Error('upsertOrder: falta ID');
  return guardWrite(training, async () => {
    await ensureAuth();
    await setDoc(doc(db, 'orders', id), {
      ...data,
      updatedAt: serverTimestamp(),
      createdAt: data?.createdAt ?? serverTimestamp()
    }, { merge: true });
    return { ok: true };
  }, { ok: true, _training: true });
}

// Cambia status y sella timestamps típicos
export async function setOrderStatus(id, status, extra = {}, opts = {}) {
  const { training = false } = opts;
  const s = String(status || '').toUpperCase();
  const stampPatch = {
    status: s,
    updatedAt: serverTimestamp(),
  };
  if (s === 'IN_PROGRESS') stampPatch.startedAt = serverTimestamp(), stampPatch['timestamps.startedAt'] = serverTimestamp();
  if (s === 'READY')       stampPatch.readyAt   = serverTimestamp(), stampPatch['timestamps.readyAt']   = serverTimestamp();
  if (s === 'DELIVERED')   stampPatch.deliveredAt = serverTimestamp(), stampPatch['timestamps.deliveredAt'] = serverTimestamp();
  if (s === 'DONE' || s === 'PAID') stampPatch.doneAt = serverTimestamp(), stampPatch['timestamps.doneAt'] = serverTimestamp();

  return guardWrite(training, async () => {
    await ensureAuth();
    await updateDoc(doc(db, 'orders', id), { ...stampPatch, ...(extra||{}) });
    return { ok: true };
  }, { ok: true, _training: true });
}

// Alias de compatibilidad
export const setStatus = setOrderStatus;

// Archiva pedidos entregados / cancelados (copia a orders_archive y borra original)
export async function archiveDelivered(id, opts = {}) {
  const { training = false } = opts;
  return guardWrite(training, async () => {
    await ensureAuth();
    const ref = doc(db, 'orders', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: false, reason: 'not_found' };
    const data = snap.data();
    await setDoc(doc(db, 'orders_archive', id), { ...data, archivedAt: serverTimestamp() }, { merge: true });
    await deleteDoc(ref); // si tus reglas no lo permiten, comenta esta línea
    return { ok: true };
  }, { ok: true, _training: true });
}

// Registro de métrica de preparación (local → opcional en DB)
export async function logPrepMetric(metric, opts = {}) {
  const { training = false } = opts;
  const data = {
    orderId: metric?.orderId || '',
    createdAtLocal: Number(metric?.createdAtLocal || 0) || null,
    readyAtLocal: Number(metric?.readyAtLocal || 0) || null,
    source: String(metric?.source || 'track'),
    loggedAt: serverTimestamp()
  };
  return guardWrite(training, async () => {
    await ensureAuth();
    await addDoc(collection(db, 'metrics_prep'), data);
    return { ok: true };
  }, { ok: true, _training: true });
}

/* =================== Reportes por rango =================== */
export async function getOrdersRange({ from, to, includeArchive = false, orderType = null }) {
  try {
    const _from = toTs(from);
    const _to = toTs(to);

    const qMain = query(
      collection(db, 'orders'),
      where('createdAt', '>=', _from),
      where('createdAt', '<=', _to),
      orderBy('createdAt', 'asc')
    );

    const reads = [getDocs(qMain)];
    if (includeArchive) {
      const qArch = query(
        collection(db, 'orders_archive'),
        where('createdAt', '>=', _from),
        where('createdAt', '<=', _to),
        orderBy('createdAt', 'asc')
      );
      reads.push(getDocs(qArch));
    }

    const snaps = await Promise.all(reads);
    let rows = snaps.flatMap(s => s.docs.map(d => ({ id: d.id, ...d.data() })));

    if (orderType && orderType !== 'all') {
      rows = rows.filter(o =>
        (o.orderType && o.orderType === orderType) ||
        (o.orderMeta?.type && o.orderMeta.type === orderType)
      );
    }
    return rows;
  } catch (e) {
    console.error('[getOrdersRange]', e);
    return [];
  }
}

/* =================== Settings: Happy Hour / ETA / Theme =================== */
export function subscribeHappyHour(cb) {
  return onSnapshot(doc(db, 'settings', 'happyHour'), (d) => cb(d.data() ?? null));
}

export async function setHappyHour(payload, opts = {}) {
  const { training = false } = opts;
  return guardWrite(training, async () => {
    await ensureAuth();
    const durationMin = Number(payload?.durationMin || 0);
    const endsAtMs = payload?.enabled
      ? (durationMin > 0 ? Date.now() + durationMin * 60000 : toMillisFlexible(payload?.endsAt))
      : null;

    const normalized = {
      enabled: !!payload?.enabled,
      discountPercent: Number(payload?.discountPercent || 0),
      bannerText: String(payload?.bannerText || ''),
      endsAt: endsAtMs,
      durationMin: durationMin > 0 ? durationMin : null,
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'settings', 'happyHour'), normalized, { merge: true });
    return { ok: true };
  }, { ok: true, _training: true });
}

// ETA en settings/eta { text: "7–10 min" }
export function subscribeETA(cb) {
  return onSnapshot(doc(db, 'settings', 'eta'), (d) => {
    const txt = d?.data()?.text;
    cb(txt != null ? String(txt) : null);
  });
}

export function subscribeTheme(cb) {
  return onSnapshot(doc(db, 'settings', 'theme'), (d) => cb(d.data() ?? null));
}

// ⚠️ Compat: acepta string ("Base") o objeto ({ name, overrides })
export async function setTheme(payload, opts = {}) {
  const { training = false } = opts;
  const name = (typeof payload === 'string') ? payload : payload?.name;
  const overrides = (typeof payload === 'object' && payload && payload.overrides) ? payload.overrides : {};
  if (!n ame) throw new Error('Theme name is required');

  return guardWrite(training, async () => {
    await ensureAuth();
    await setDoc(
      doc(db, 'settings', 'theme'),
      { name, overrides, updatedAt: serverTimestamp() },
      { merge: true }
    );
    return { ok: true };
  }, { ok: true, _training: true });
}

/* =================== Inventario / Proveedores / Compras =================== */
export function subscribeInventory(cb) {
  const qy = query(collection(db, 'inventory'), orderBy('name', 'asc'));
  return onSnapshot(qy, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function upsertInventoryItem(item, opts = {}) {
  const { training = false } = opts;
  return guardWrite(training, async () => {
    await ensureAuth();
    const ref = item?.id ? doc(db, 'inventory', item.id) : doc(collection(db, 'inventory'));
    await setDoc(ref, { ...item, updatedAt: serverTimestamp() }, { merge: true });
    return ref.id;
  }, item?.id ?? `TRAIN-INV-${Date.now()}`);
}

export function subscribeSuppliers(cb) {
  const qy = query(collection(db, 'suppliers'), orderBy('name', 'asc'));
  return onSnapshot(qy, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function upsertSupplier(supp, opts = {}) {
  const { training = false } = opts;
  return guardWrite(training, async () => {
    await ensureAuth();
    const ref = supp?.id ? doc(db, 'suppliers', supp.id) : doc(collection(db, 'suppliers'));
    await setDoc(ref, { ...supp, updatedAt: serverTimestamp() }, { merge: true });
    return ref.id;
  }, supp?.id ?? `TRAIN-SUP-${Date.now()}`);
}

// compra: registra purchase + recalcula stock y costo promedio
export async function recordPurchase(purchase, opts = {}) {
  const { training = false } = opts;
  return guardWrite(training, async () => {
    await ensureAuth();
    const { itemId, qty = 0, unitCost = 0 } = purchase || {};
    await addDoc(collection(db, 'purchases'), { ...purchase, createdAt: serverTimestamp() });

    if (itemId && qty > 0) {
      const ref = doc(db, 'inventory', itemId);
      const snap = await getDoc(ref);
      const cur = snap.exists() ? Number(snap.data().currentStock || 0) : 0;
      const prevCost = snap.exists() ? Number(snap.data().costAvg || 0) : 0;
      const newStock = cur + Number(qty);
      const newCost =
        (prevCost > 0 && cur > 0) ? ((prevCost * cur + unitCost * qty) / newStock) : unitCost;
      await setDoc(ref, { currentStock: newStock, costAvg: newCost, updatedAt: serverTimestamp() }, { merge: true });
    }
    return { ok: true };
  }, { ok: true, _training: true });
}

export async function adjustStock(itemId, delta, reason = 'use', meta = {}, opts = {}) {
  const { training = false } = opts;
  if (!itemId || !Number.isFinite(delta)) return;
  return guardWrite(training, async () => {
    await ensureAuth();
    const ref = doc(db, 'inventory', itemId);
    await setDoc(ref, { currentStock: increment(Number(delta)), updatedAt: serverTimestamp() }, { merge: true });
    await addDoc(collection(db, 'inventory_moves'), {
      itemId, delta: Number(delta), reason, meta, createdAt: serverTimestamp()
    });
    return { ok: true };
  }, { ok: true, _training: true });
}

/* =================== Recetas / Producción =================== */
export function subscribeRecipes(cb) {
  const qy = query(collection(db, 'recipes'), orderBy('name', 'asc'));
  return onSnapshot(qy, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function produceBatch({ recipeId, outputQty }, opts = {}) {
  const { training = false } = opts;
  if (!recipeId || !(outputQty > 0)) throw new Error('Datos de producción inválidos');
  return guardWrite(training, async () => {
    await ensureAuth();
    await addDoc(collection(db, 'productions'), { recipeId, outputQty, createdAt: serverTimestamp() });
    return { ok: true };
  }, { ok: true, _training: true });
}

/* =================== Artículos (CRUD) =================== */
export function subscribeArticles(cb) {
  const qy = query(collection(db, 'articles'), orderBy('updatedAt', 'desc'), limit(100));
  return onSnapshot(qy, (snap) => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function upsertArticle(article, opts = {}) {
  const { training = false } = opts;
  return guardWrite(training, async () => {
    await ensureAuth();
    const ref = article?.id ? doc(db, 'articles', article.id) : doc(collection(db, 'articles'));
    await setDoc(ref, {
      ...article,
      updatedAt: serverTimestamp(),
      createdAt: article?.createdAt ?? serverTimestamp()
    }, { merge: true });
    return ref.id;
  }, article?.id ?? `TRAIN-ART-${Date.now()}`);
}

// Borrado de artículos (hard delete con fallback a soft delete)
export async function deleteArticle(id, opts = {}) {
  const { training = false } = opts;
  if (!id) throw new Error('deleteArticle: falta id');
  return guardWrite(training, async () => {
    await ensureAuth();
    const ref = doc(db, 'articles', id);
    try {
      await deleteDoc(ref);
      return { ok: true, hardDelete: true };
    } catch {
      await setDoc(ref, { deleted: true, updatedAt: serverTimestamp() }, { merge: true });
      return { ok: true, hardDelete: false, softDelete: true };
    }
  }, { ok: true, _training: true });
}

// Alias legacy
export const removeArticle = deleteArticle;

/* =================== Clientes / WhatsApp / Lealtad =================== */
export async function fetchCustomer(phone) {
  const clean = normPhone(phone);
  if (!clean) return null;
  try {
    const snap = await getDoc(doc(db, 'customers', clean));
    return snap.exists() ? { id: clean, ...snap.data() } : null;
  } catch { return null; }
}

export async function upsertCustomerFromOrder(order, opts = {}) {
  const { training = false } = opts;
  const phone = normPhone(order?.phone || order?.orderMeta?.phone || '');
  if (!phone) return null;
  const data = {
    name: order?.customer || '',
    lastOrderId: order?.id || null,
    updatedAt: serverTimestamp()
  };
  return guardWrite(training, async () => {
    await ensureAuth();
    await setDoc(doc(db, 'customers', phone), data, { merge: true });
    return { ok: true };
  }, { ok: true, _training: true });
}

export async function attachLastOrderRef(phone, orderId, opts = {}) {
  const { training = false } = opts;
  const clean = normPhone(phone);
  if (!clean || !orderId) return;
  return guardWrite(training, async () => {
    await ensureAuth();
    await setDoc(doc(db, 'customers', clean), { lastOrderId: orderId, updatedAt: serverTimestamp() }, { merge: true });
    return { ok: true };
  }, { ok: true, _training: true });
}

// Perfil extendido para lealtad
export async function upsertCustomerProfile({ phone, name, birthday = null, prefs = {} }, opts = {}) {
  const { training = false } = opts;
  const clean = normPhone(phone);
  if (!clean) throw new Error('phone requerido');
  const payload = {
    name: name || '',
    birthday: birthday || null,
    prefs: prefs || {},
    updatedAt: serverTimestamp()
  };
  return guardWrite(training, async () => {
    await ensureAuth();
    await setDoc(doc(db, 'customers', clean), payload, { merge: true });
    return { ok: true };
  }, { ok: true, _training: true });
}

// Guarda tarjeta coleccionable
export async function saveCollectibleCard(card, opts = {}) {
  const { training = false } = opts;
  const clean = normPhone(card?.phone || '');
  if (!clean) throw new Error('phone requerido');
  const payload = {
    owner: clean,
    orderId: card?.orderId || null,
    rarity: card?.rarity || 'Común',
    title: card?.title || '',
    name: card?.name || card?.meta?.name || '',
    theme: card?.theme || card?.meta?.theme || 'default',
    palette: card?.palette || card?.meta?.palette || [],
    createdAt: serverTimestamp()
  };
  return guardWrite(training, async () => {
    await ensureAuth();
    const ref = await addDoc(collection(db, 'collectibles'), payload);
    return ref.id;
  }, `TRAIN-COLL-${Date.now()}`);
}

// Crea cupón de descuento
export async function createVoucher({ phone, pct = 30, kind = 'golden_card', expiresAt }, opts = {}) {
  const { training = false } = opts;
  const clean = normPhone(phone);
  if (!clean) throw new Error('phone requerido');
  const code = `SV${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const payload = {
    phone: clean, code, pct: Number(pct || 0),
    kind, expiresAt: Number(expiresAt || 0) || null,
    createdAt: serverTimestamp(), redeemedAt: null
  };
  return guardWrite(training, async () => {
    await ensureAuth();
    const ref = await addDoc(collection(db, 'vouchers'), payload);
    return { code, id: ref.id };
  }, { code, id: `TRAIN-VCH-${Date.now()}` });
}

// Bandeja de salida (WA) — el worker externo lo enviará
export async function sendWhatsAppMessage({ to, text, meta = {} }, opts = {}) {
  const { training = false } = opts;
  if (!to || !text) return { ok: false, reason: 'missing_fields' };
  return guardWrite(training, async () => {
    await ensureAuth();
    await addDoc(collection(db, 'outbox_whatsapp'), {
      to, text, meta, createdAt: serverTimestamp(), status: 'queued'
    });
    return { ok: true };
  }, { ok: true, _training: true });
}

/* =================== Exports auxiliares =================== */
export function subscribeSettings(cb) {
  return onSnapshot(doc(db, 'settings', 'app'), (d) => cb(d.data() ?? {}));
}
