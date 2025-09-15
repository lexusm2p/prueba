export async function getOrdersRange(params = {}) {
  await ensureAuth();

  // ---- Compat de parámetros (soporta {from,to} y {time_min,time_max})
  const fromIn = params.from ?? params.time_min ?? null;
  const toIn   = params.to   ?? params.time_max ?? null;
  const includeArchive = params.includeArchive ?? params.include_archive ?? false;
  const type = params.orderType ?? params.type ?? null;

  // ---- Normalización de fechas (local, tolerante a string/Date/Timestamp)
  const toLocalDate = (v, fallback=null) => {
    if (!v) return fallback;
    if (typeof v?.toDate === 'function') return v.toDate();
    if (typeof v?.toMillis === 'function') return new Date(v.toMillis());
    if (typeof v === 'number') return new Date(v);
    const d = new Date(v);
    return isNaN(d.getTime()) ? fallback : d;
  };

  // Si no hay rango, usa HOY local
  const today = new Date();
  const start = toLocalDate(fromIn, new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0,0,0,0));
  // Fin INCLUSIVO
  const end   = toLocalDate(toIn,   new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23,59,59,999));

  // ---- Construcción de queries
  const build = (collName) => {
    let qy = query(
      collection(db, collName),
      where('createdAt', '>=', Timestamp.fromDate(start)),
      where('createdAt', '<=', Timestamp.fromDate(end)),
      orderBy('createdAt','asc')
    );
    if (type && type !== 'all') {
      // Ajusta el campo si usas otro para “tipo de pedido”
      qy = query(qy, where('orderMeta.type', '==', String(type)));
    }
    return qy;
  };

  // getDocs (usar el SDK modular si lo exportas en firebase.js; si no, fallback CDN)
  async function getDocsCompat(qref){
    try {
      const { getDocs } = await import('./firebase.js'); // si NO exportas getDocs, caerá al catch
      if (typeof getDocs === 'function') return getDocs(qref);
    } catch {}
    const { getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    return getDocs(qref);
  }

  const readList = async (qy) => {
    const snap = await getDocsCompat(qy);
    return snap.docs.map(d => ({ id:d.id, ...d.data() }));
  };

  // ---- Leer colecciones
  const listMain = await readList(build('orders'));
  const listArc  = includeArchive ? await readList(build('orders_archive')) : [];

  // ---- Unir + dedupe + ordenar
  const uniq = new Map();
  for (const o of [...listMain, ...listArc]) {
    if (!o?.id) continue;
    uniq.set(o.id, o); // la última gana
  }
  const orders = Array.from(uniq.values()).sort((a,b)=>{
    const ta = a.createdAt?.toMillis?.() ?? 0;
    const tb = b.createdAt?.toMillis?.() ?? 0;
    return ta - tb;
  });

  // ---- Resumen
  let count=0, items=0, revenue=0;
  for (const o of orders) {
    if (o.status === 'CANCELLED') continue;
    count++;
    const lines = Array.isArray(o.items) ? o.items : [];
    items += lines.reduce((acc, li)=> acc + (Number(li?.qty)||1), 0);
    revenue += Number(o.total)||0;
  }
  const summary = { orders:count, itemsSold:items, revenue, avgTicket: count ? (revenue / count) : 0 };

  return { orders, summary, range: { start, end }, filters: { includeArchive, type: type||'all' } };
}