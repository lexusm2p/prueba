import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';
import * as functions from 'firebase-functions';

initializeApp();
const fs = getFirestore();
const rtdb = getDatabase();

function normalizeOrder(data, id) {
  const toNum = (x) => Number(x || 0);
  const items = Array.isArray(data.items)
    ? data.items
    : (data.item ? [{
        id: data.item.id,
        name: data.item.name,
        qty: data.qty || 1,
        unitPrice: data.item.price || 0,
        baseIngredients: data.baseIngredients || [],
        salsaDefault: data.salsaDefault || null,
        salsaCambiada: data.salsaCambiada || null,
        extras: data.extras || {}
      }] : []);

  return {
    id,
    status: String(data.status || 'PENDING').toUpperCase(),
    customer: data.customer || '',
    orderType: data.orderType || data.orderMeta?.type || '',
    table: data.table || data.orderMeta?.table || '',
    phone: data.phone || data.orderMeta?.phone || '',
    tip: toNum(data.tip),
    subtotal: typeof data.subtotal === 'number' ? toNum(data.subtotal) : null,
    items,
    notes: data.notes || '',
    hh: data.hh || null,

    // sellos
    createdAt: data.createdAt || data.timestamps?.createdAt || null,
    startedAt: data.startedAt || data.timestamps?.startedAt || null,
    readyAt: data.readyAt || data.timestamps?.readyAt || null,
    deliveredAt: data.deliveredAt || data.timestamps?.deliveredAt || null,

    // flags de cobro
    paid: !!data.paid,
    payMethod: data.payMethod || null,
    totalCharged: typeof data.totalCharged === 'number' ? toNum(data.totalCharged) : null
  };
}

// MIRROR orders activos → RTDB
export const mirrorOrdersToRTDB = functions.firestore
  .document('orders/{orderId}')
  .onWrite(async (change, ctx) => {
    const id = ctx.params.orderId;
    const ref = rtdb.ref(`kitchen/orders/${id}`);

    if (!change.after.exists) {
      await ref.remove();
      return;
    }
    const data = change.after.data();
    const active = new Set(['PENDING', 'IN_PROGRESS', 'READY', 'DELIVERED']);
    const status = String(data.status || '').toUpperCase();

    if (active.has(status)) {
      await ref.set(normalizeOrder(data, id));
    } else {
      await ref.remove(); // si ya no es activo, sácalo del feed
    }
  });

// Helpers de estado
function statusPatch(action) {
  const now = FieldValue.serverTimestamp();
  const s = String(action).toUpperCase();
  const patch = { status: s, updatedAt: now };
  if (s === 'IN_PROGRESS') { patch.startedAt = now; patch['timestamps.startedAt'] = now; }
  if (s === 'READY')       { patch.readyAt   = now; patch['timestamps.readyAt']   = now; }
  if (s === 'DELIVERED')   { patch.deliveredAt = now; patch['timestamps.deliveredAt'] = now; }
  return patch;
}

const SHARED_SECRET = process.env.KITCHEN_SECRET || 'cambia_este_secret';
const ALLOWED = new Set(['IN_PROGRESS', 'READY', 'DELIVERED']);

// Endpoint: avanzar estado
export const kitchenSetStatus = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method not allowed');
    const { id, action, note, secret } = req.body || {};
    if (!id || !action) return res.status(400).json({ ok: false, error: 'missing_fields' });
    if (secret !== SHARED_SECRET) return res.status(401).json({ ok: false, error: 'unauthorized' });
    if (!ALLOWED.has(String(action).toUpperCase())) return res.status(400).json({ ok:false, error:'invalid_action' });

    const ref = fs.collection('orders').doc(String(id));
    const patch = statusPatch(action);
    if (note) patch.notes = note;
    await ref.set(patch, { merge: true });
    res.json({ ok: true });
  } catch (e) {
    console.error(e); res.status(500).json({ ok:false, error:'server_error' });
  }
});

// Endpoint: cobrar (marca paid, total, método; archiva y pone DONE)
export const kitchenCharge = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method not allowed');
    const { id, method, total, secret } = req.body || {};
    if (secret !== SHARED_SECRET) return res.status(401).json({ ok:false, error:'unauthorized' });
    if (!id || !method) return res.status(400).json({ ok:false, error:'missing_fields' });

    const payMethod = String(method).toLowerCase();
    const ref = fs.collection('orders').doc(String(id));
    const now = FieldValue.serverTimestamp();
    const patch = {
      paid: true, payMethod, totalCharged: typeof total === 'number' ? total : null,
      paidAt: now, updatedAt: now, status: 'DONE', doneAt: now, 'timestamps.doneAt': now
    };
    // upsert
    await ref.set(patch, { merge: true });

    // archivar (copia) y borrar original si se puede
    const snap = await ref.get();
    if (snap.exists) {
      const data = snap.data();
      await fs.collection('orders_archive').doc(String(id))
        .set({ ...data, archivedAt: now }, { merge: true });
      try { await ref.delete(); } catch (_) {}
    }
    res.json({ ok:true });
  } catch (e) {
    console.error(e); res.status(500).json({ ok:false, error:'server_error' });
  }
});
