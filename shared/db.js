<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Cocina — Seven (Legacy)</title>
  <link rel="stylesheet" href="../shared/styles.css">
  <style>
    body{ background:#0b1220; color:#e8f0ff; font-family: system-ui, Arial; }
    .wrap{ max-width:1200px; margin:12px auto; padding:0 12px; }
    .cols{ display:grid; grid-template-columns: repeat(4, 1fr); gap:10px; }
    @media (max-width:900px){ .cols{ grid-template-columns:1fr; } }
    .card{ background:#0f182a; border:1px solid rgba(255,255,255,.08); border-radius:12px; padding:12px; }
    .ord{ background:#131f33; border:1px solid rgba(255,255,255,.07); border-radius:10px; padding:10px; margin-bottom:8px; }
    .muted{ color:#a6b2c7; font-size:12px; }
    .chips{ display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
    .chip{ background:#192840; border:1px solid rgba(255,255,255,.10); border-radius:999px; padding:4px 8px; font-size:12px; }
    .row{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; justify-content:flex-end; }
    .btn{ background:#1a2740; border:1px solid rgba(255,255,255,.12); color:#e8f0ff; border-radius:10px; padding:8px 10px; }
    .btn.ok{ background:#2fe38b; color:#00150a; font-weight:800; }
    a.track{ color:#8bb4ff; text-decoration:underline; font-size:12px; }
    .empty{ color:#8aa0c4; opacity:.7; padding:8px 0; }
  </style>
</head>
<body>
<div class="wrap">
  <div class="cols">
    <div class="card"><h3>Pendientes</h3><div id="col-pending"></div></div>
    <div class="card"><h3>En preparación</h3><div id="col-progress"></div></div>
    <div class="card"><h3>Listos</h3><div id="col-ready"></div></div>
    <div class="card"><h3>Por cobrar</h3><div id="col-bill"></div></div>
  </div>
</div>

<!-- Firebase v8 para máxima compatibilidad -->
<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js"></script>

<script>
  // === Config del proyecto (verifica databaseURL) ===
  const firebaseConfig = {
    apiKey: "AIzaSyAidr-9HSNlfok5BOBer8Te8EflyV8VYi4",
    authDomain: "seven-de-burgers.firebaseapp.com",
    databaseURL: "https://seven-de-burgers-default-rtdb.firebaseio.com",
    projectId: "seven-de-burgers",
    storageBucket: "seven-de-burgers.appspot.com",
    messagingSenderId: "34089845279",
    appId: "1:34089845279:web:d13440c34e6bb7fa910b2a"
  };
  firebase.initializeApp(firebaseConfig);
  const db = firebase.database();

  // Endpoints opcionales para acciones (Cloud Functions)
  const ENDPOINT_STATUS = "https://us-central1-seven-de-burgers.cloudfunctions.net/kitchenSetStatus";
  const ENDPOINT_CHARGE = "https://us-central1-seven-de-burgers.cloudfunctions.net/kitchenCharge";
  const SECRET = "PON_AQUI_TU_SECRET_REAL"; // <-- reemplaza

  const COLS = {
    PENDING:     document.getElementById('col-pending'),
    IN_PROGRESS: document.getElementById('col-progress'),
    READY:       document.getElementById('col-ready'),
    BILL:        document.getElementById('col-bill'),
  };

  function money(n){ return '$'+Number(n||0).toFixed(0); }
  function calcTotal(o){
    const items = Array.isArray(o.items) ? o.items : [];
    let s=0; for (let i=0;i<items.length;i++){
      const it=items[i];
      const line = (typeof it.lineTotal==='number') ? Number(it.lineTotal||0) : (Number(it.unitPrice||0) * Number(it.qty||1));
      s += line;
    }
    return s + Number(o.tip||0);
  }
  function chip(txt){ return '<span class="chip">'+String(txt)+'</span>'; }
  function toMs(t){
    if (t==null) return 0;
    if (typeof t==='number') return t;
    if (t && typeof t.toMillis==='function') return t.toMillis();
    if (t && typeof t.seconds==='number') return (t.seconds*1000) + Math.floor((t.nanoseconds||0)/1e6);
    const ms = new Date(t).getTime(); return isFinite(ms)?ms:0;
  }

  function render(list){
    const by = {PENDING:[], IN_PROGRESS:[], READY:[], BILL:[]};
    (list||[]).forEach(o=>{
      const s = String(o.status||'PENDING').toUpperCase();
      if (s==='DELIVERED' && !o.paid) by.BILL.push(o);
      else if (by[s]) by[s].push(o);
      else by.PENDING.push(o);
    });

    for (const k in by){
      const cont = k==='BILL' ? COLS.BILL : COLS[k];
      if (!cont) continue;
      cont.innerHTML = by[k].length ? by[k].map(renderCard).join('') : '<div class="empty">—</div>';
    }

    // bind acciones
    Array.prototype.forEach.call(document.querySelectorAll('[data-id][data-a]'), btn=>{
      btn.onclick = () => doAction(btn.getAttribute('data-id'), btn.getAttribute('data-a'));
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-id][data-charge]'), btn=>{
      btn.onclick = () => doCharge(btn.getAttribute('data-id'));
    });
  }

  function renderCard(o){
    const total = money(calcTotal(o));
    const meta  = o.orderType==='dinein' ? ('Mesa '+(o.table||'?')) : (o.orderType||'pickup');
    const track = `<a class="track" href="../track/?id=${encodeURIComponent(o.id)}" target="_blank" rel="noopener">Ver en Track</a>`;

    const items = Array.isArray(o.items) ? o.items : [];
    let lines = '';
    for (let i=0;i<items.length;i++){
      const it = items[i];
      const bi = Array.isArray(it.baseIngredients) ? it.baseIngredients : [];
      const sauces = (it.extras && Array.isArray(it.extras.sauces)) ? it.extras.sauces : [];
      const ingr   = (it.extras && Array.isArray(it.extras.ingredients)) ? it.extras.ingredients : [];
      const dlc    = it.extras && it.extras.dlcCarne ? ['DLC carne 85g'] : [];
      const salsa  = it.salsaCambiada ? ('Salsa: '+it.salsaCambiada+' (cambio)') : (it.salsaDefault ? ('Salsa: '+it.salsaDefault) : '');
      const chips  = []
        .concat(bi)
        .concat(sauces.map(s => 'Aderezo: '+s))
        .concat(ingr.map(x => 'Extra: '+x))
        .concat(dlc);
      lines += `
        <div class="muted">${(it.qty||1)}× ${it.name||'Producto'}</div>
        ${salsa ? `<div class="muted">${salsa}</div>` : ``}
        <div class="chips">${chips.map(chip).join('')}</div>
        ${it.notes ? `<div class="muted">Notas: ${it.notes}</div>` : ``}
      `;
    }

    const s = String(o.status||'PENDING').toUpperCase();
    const btns =
      (s==='PENDING')      ? `<button class="btn" data-a="IN_PROGRESS" data-id="${o.id}">Tomar</button>` :
      (s==='IN_PROGRESS')  ? `<button class="btn ok" data-a="READY" data-id="${o.id}">Listo</button>` :
      (s==='READY')        ? `<button class="btn" data-a="DELIVERED" data-id="${o.id}">Entregar</button>` :
      (s==='DELIVERED' && !o.paid) ? `<button class="btn ok" data-charge data-id="${o.id}">Cobrar</button>` : ``;

    return `
      <div class="ord">
        <div><b>${o.customer||'-'}</b> · <span class="muted">${meta}</span> · ${track}</div>
        <div class="muted">Total: <b>${total}</b> ${o.paid ? '· <span class="chip">Pagado</span>' : ''}</div>
        ${o.notes ? `<div class="muted"><b>Notas generales:</b> ${o.notes}</div>` : ``}
        ${lines}
        <div class="row" style="margin-top:6px">${btns}</div>
      </div>
    `;
  }

  // === RTDB Live ===
  db.ref('kitchen/orders').on('value', snap=>{
    const val = snap.val() || {};
    const list = Object.keys(val).map(id => Object.assign({ id }, val[id]));
    // ordenar por createdAt robusto
    list.sort((a,b)=> toMs(a.createdAt) - toMs(b.createdAt));
    render(list);
  });

  // === Acciones (opcional) ===
  function doAction(id, action){
    if (!ENDPOINT_STATUS || !SECRET){ alert('Configura ENDPOINT_STATUS y SECRET'); return; }
    fetch(ENDPOINT_STATUS, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ id, action, secret: SECRET })
    }).then(r=>r.json()).then(j=>{
      if (!j.ok) alert('Error: '+(j.error||''));
      // el mirror refresca solo
    }).catch(()=> alert('Error de red'));
  }

  function doCharge(id){
    if (!ENDPOINT_CHARGE || !SECRET){ alert('Configura ENDPOINT_CHARGE y SECRET'); return; }
    const method = prompt('Método (efectivo / tarjeta / transferencia):','efectivo');
    if (method===null) return;
    fetch(ENDPOINT_CHARGE, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ id, method, secret: SECRET })
    }).then(r=>r.json()).then(j=>{
      if (!j.ok) alert('Error: '+(j.error||''));
    }).catch(()=> alert('Error de red'));
  }
</script>
</body>
</html>
