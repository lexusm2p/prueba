// functions/src/index.ts (o index.js)

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';
import * as functions from 'firebase-functions';

initializeApp();
const fs = getFirestore();
const rtdb = getDatabase();

// ---------- Utilidades ----------
const REGION = 'us-central1'; // coincide con tus URLs
const SHARED_SECRET = process.env.KITCHEN_SECRET || 'cambia_este_secret';
const ACTIVE = new Set(['PENDING', 'IN_PROGRESS', 'READY', 'DELIVERED']);
const ALLOWED = new Set(['IN_PROGRESS', 'READY', 'DELIVERED']);

function allowCORS(req: functions.https.Request, res: functions.Response) {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '3600',
  });
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true;
  }
  return false;
}

function n(x: any) { return Number(x || 0); }

// Estandariza pedido para RTDB (solo lo que necesita la UI legacy)
function normalizeOrder(data: any, id: string) {
  const items = Array.isArray(data?.items)
    ? data.items
    : (data?.item ? [{
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
    status: String(data?.status || 'PENDING').toUpperCase(),
    customer: data?.customer || '',
    orderType: data?.orderType || data?.orderMeta?.type || 'pickup',
    table: data?.table || data?.orderMeta?.table || '',
    phone: data?.phone || data?.orderMeta?.phone || '',
    tip: n(data?.tip),
    subtotal: (typeof data?.subtotal === 'number') ? n(data.subtotal) : null,
    items,
    notes: data?.notes || '',
    hh: data?.hh || null,

    // Timestamps (Firestore Timestamp o null)
    createdAt: data?.createdAt || data?.timestamps?.createdAt || null,
    startedAt: data?.startedAt || data?.timestamps?.startedAt || null,
    readyAt: data?.readyAt || data?.timestamps?.readyAt || null,
    deliveredAt: data?.deliveredAt || data?.timestamps?.deliveredAt || null,

    // Cobro
    paid: !!data?.paid,
    payMethod: data?.payMethod || null,
    totalCharged: (typeof data?.totalCharged === 'number') ? n(data.totalCharged) : null
  };
}

function statusPatch(action: string) {
  const now = FieldValue.serverTimestamp();
  const s = String(action).toUpperCase();
  const patch: Record<string, any> = { status: s, updatedAt: now };
  if (s === 'IN_PROGRESS') { patch.startedAt = now; patch['timestamps.startedAt'] = now; }
  if (s === 'READY')       { patch.readyAt   = now; patch['timestamps.readyAt']   = now; }
  if (s === 'DELIVERED')   { patch.deliveredAt = now; patch['timestamps.deliveredAt'] = now; }
  return patch;
}

// ---------- MIRROR Firestore -> RTDB ----------
export const mirrorOrdersToRTDB = functions
  .region(REGION)
  .firestore.document('orders/{orderId}')
  .onWrite(async (change, ctx) => {
    const id = ctx.params.orderId as string;
    const ref = rtdb.ref(`kitchen/orders/${id}`);

    // Borrado en FS -> borrar en RTDB
    if (!change.after.exists) {
      await ref.remove();
      return null;
    }

    const data = change.after.data() || {};
    const status = String(data.status || '').toUpperCase();

    if (ACTIVE.has(status)) {
      await ref.set(normalizeOrder(data, id));
    } else {
      // Si se mueve a estado no activo, sácalo del feed
      await ref.remove();
    }
    return null;
  });

// Cuando se escribe en archivo, limpia el espejo
export const cleanMirrorOnArchive = functions
  .region(REGION)
  .firestore.document('orders_archive/{orderId}')
  .onWrite(async (change, ctx) => {
    const id = ctx.params.orderId as string;
    const ref = rtdb.ref(`kitchen/orders/${id}`);
    await ref.remove().catch(() => null);
    return null;
  });

// ---------- Endpoints Kitchen ----------

// Avanzar estado (Tomar/Listo/Entregar)
export const kitchenSetStatus = functions
  .region(REGION)
  .https.onRequest(async (req, res) => {
    try {
      if (allowCORS(req, res)) return;
      if (req.method !== 'POST') return res.status(405).send('Method not allowed');

      const { id, action, note, secret } = (req.body || {});
      if (!id || !action) return res.status(400).json({ ok: false, error: 'missing_fields' });
      if (secret !== SHARED_SECRET) return res.status(401).json({ ok: false, error: 'unauthorized' });

      const s = String(action).toUpperCase();
      if (!ALLOWED.has(s)) return res.status(400).json({ ok:false, error:'invalid_action' });

      const ref = fs.collection('orders').doc(String(id));
      const patch = statusPatch(s);
      if (note) patch.notes = String(note).slice(0, 500);

      await ref.set(patch, { merge: true });
      res.json({ ok: true });
    } catch (e) {
      console.error('[kitchenSetStatus]', e);
      res.status(500).json({ ok:false, error:'server_error' });
    }
  });

// Cobrar (marca paid y archiva)
export const kitchenCharge = functions
  .region(REGION)
  .https.onRequest(async (req, res) => {
    try {
      if (allowCORS(req, res)) return;
      if (req.method !== 'POST') return res.status(405).send('Method not allowed');

      const { id, method, total, secret } = (req.body || {});
      if (secret !== SHARED_SECRET) return res.status(401).json({ ok:false, error:'unauthorized' });
      if (!id || !method) return res.status(400).json({ ok:false, error:'missing_fields' });

      const payMethod = String(method).toLowerCase();
      const now = FieldValue.serverTimestamp();

      const ref = fs.collection('orders').doc(String(id));
      const patch: Record<string, any> = {
        paid: true,
        payMethod,
        totalCharged: (typeof total === 'number') ? Number(total) : null,
        paidAt: now,
        updatedAt: now,
        status: 'DONE',
        doneAt: now,
        'timestamps.doneAt': now
      };
      await ref.set(patch, { merge: true });

      // Archivar (copia) y borrar original si se puede
      const snap = await ref.get();
      if (snap.exists) {
        const data = snap.data() || {};
        await fs.collection('orders_archive').doc(String(id))
          .set({ ...data, archivedAt: now }, { merge: true });
        try { await ref.delete(); } catch {}
      }

      res.json({ ok:true });
    } catch (e) {
      console.error('[kitchenCharge]', e);
      res.status(500).json({ ok:false, error:'server_error' });
    }
  });
