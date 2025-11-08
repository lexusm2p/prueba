// cocina/app.legacy.js
// Vista sólo lectura para iPad vieja (ES5 + Firebase v8 Firestore)

(function(){
  if (!window.firebase || !firebase.firestore) {
    console.error('[cocina.legacy] Firebase v8 Firestore no disponible');
    return;
  }

  // ===== Config Firebase (mismo del proyecto) =====
  var firebaseConfig = {
    apiKey: "AIzaSyAidr-9HSNlfok5BOBer8Te8EflyV8VYi4",
    authDomain: "seven-de-burgers.firebaseapp.com",
    projectId: "seven-de-burgers",
    storageBucket: "seven-de-burgers.appspot.com",
    messagingSenderId: "34089845279",
    appId: "1:34089845279:web:d13440c34e6bb7fa910b2a"
  };

  try {
    if (firebase.apps && firebase.apps.length === 0) {
      firebase.initializeApp(firebaseConfig);
    }
  } catch (e) {
    // ya inicializado
  }

  var db = firebase.firestore();

  // ===== Helpers =====

  function esc(s){
    return String(s || '').replace(/[&<>"']/g, function(m){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];
    });
  }

  function money(n){
    return '$' + Number(n || 0).toFixed(0);
  }

  function normStatus(s){
    s = String(s || '').trim().toUpperCase();
    if (!s) s = 'PENDING';
    return s;
  }

  function isPaid(o){
    if (!o) return false;
    var raw = (o.paid != null ? o.paid : null);
    if (raw == null && o.payment && o.payment.paid != null) raw = o.payment.paid;
    if (raw == null && o.meta && o.meta.paid != null)       raw = o.meta.paid;
    if (raw == null && o.payStatus != null)                 raw = o.payStatus;

    if (raw === true || raw === 1) return true;

    if (typeof raw === 'string') {
      var s = raw.trim().toLowerCase();
      if (s === 'true' || s === '1' || s === 'paid' ||
          s === 'pagado' || s === 'sí' || s === 'si' || s === 'yes') {
        return true;
      }
    }

    var st = normStatus(o.status);
    if (st === 'PAID') return true;

    if (o.paidAt || (o.payment && (o.payment.paidAt || o.payment.tx || o.payment.reference))) {
      return true;
    }

    return false;
  }

  function calcTotal(o){
    if (!o) return 0;
    if (typeof o.total === 'number') return Number(o.total || 0);
    if (typeof o.subtotal === 'number') {
      return Number(o.subtotal || 0) + Number(o.tip || 0);
    }
    var s = 0;
    var items = Object.prototype.toString.call(o.items) === '[object Array]' ? o.items : [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {};
      var line = (typeof it.lineTotal === 'number')
        ? Number(it.lineTotal || 0)
        : (Number(it.unitPrice || 0) * Number(it.qty || 1));
      s += line;
    }
    return s + Number(o.tip || 0);
  }

  function getOrdersCollection(){
    var path = location.pathname || '/';
    var parts = path.split('/'); var clean = [];
    for (var i=0;i<parts.length;i++){
      if (parts[i]) clean.push(parts[i]);
    }
    var idxV2 = -1;
    for (var j=0;j<clean.length;j++){
      if (clean[j] === 'v2') { idxV2 = j; break; }
    }
    var baseSeg = (idxV2 >= 0) ? clean.slice(0, idxV2 + 1) : [];
    var prefix = baseSeg.length ? baseSeg.join('/') + '/' : '';
    // igual que shared/db.js: <base>orders
    return prefix + 'orders';
  }

  var ORDERS_COLLECTION = getOrdersCollection();
  console.log('[cocina.legacy] Leyendo de colección:', ORDERS_COLLECTION);

  // ===== Render =====

  var COLS = {
    PENDING:     document.getElementById('col-pending'),
    IN_PROGRESS: document.getElementById('col-progress'),
    READY:       document.getElementById('col-ready'),
    BILL:        document.getElementById('col-bill')
  };

  function setCol(el, html){
    if (!el) return;
    el.innerHTML = html || '<div class="empty">—</div>';
  }

  function buildItemLines(it){
    it = it || {};
    var name = esc(it.name || 'Producto');
    var qty  = Number(it.qty || 1);

    var base = [];
    if (Object.prototype.toString.call(it.baseIngredients) === '[object Array]' &&
        it.baseIngredients.length) {
      base = it.baseIngredients;
    } else if (Object.prototype.toString.call(it.ingredients) === '[object Array]') {
      base = it.ingredients;
    }

    var extras = (it.extras || {});
    var chips = [];

    var i, s;

    // Aderezos
    if (Object.prototype.toString.call(extras.sauces) === '[object Array]') {
      for (i = 0; i < extras.sauces.length; i++) {
        chips.push('Aderezo: ' + extras.sauces[i]);
      }
    }
    // Extras adicionales
    if (Object.prototype.toString.call(extras.ingredients) === '[object Array]') {
      for (i = 0; i < extras.ingredients.length; i++) {
        chips.push('Extra: ' + extras.ingredients[i]);
      }
    }
    // DLC carne
    if (extras.dlcCarne) {
      chips.push('DLC carne 85 g');
    }
    // Salsa sorpresa
    if (extras.surpriseSauce) {
      chips.push('Sorpresa: ' + extras.surpriseSauce);
    }
    // Sazonador papas
    if (extras.seasoning) {
      chips.push('Sazonador: ' + extras.seasoning);
    }

    // Salsa default / cambio
    var salsa = '';
    if (it.salsaCambiada) {
      salsa = 'Salsa: ' + it.salsaCambiada + ' (cambio)';
    } else if (it.salsaDefault) {
      salsa = 'Salsa: ' + it.salsaDefault;
    }

    var html = '';
    html += '<div><b>' + qty + '× ' + name + '</b></div>';

    if (base && base.length) {
      html += '<ul class="ing">';
      for (i = 0; i < base.length; i++) {
        s = String(base[i] || '');
        if (!s) continue;
        html += '<li>' + esc(s) + '</li>';
      }
      html += '</ul>';
    }

    if (salsa) {
      html += '<div class="muted"> ' + esc(salsa) + '</div>';
    }

    if (chips.length) {
      html += '<div class="chips">';
      for (i = 0; i < chips.length; i++) {
        html += '<span class="chip">' + esc(chips[i]) + '</span>';
      }
      html += '</div>';
    }

    if (it.notes) {
      html += '<div class="muted">Notas: ' + esc(it.notes) + '</div>';
    }

    return html;
  }

  function buildCard(o){
    o = o || {};

    var status = normStatus(o.status);
    var total  = calcTotal(o);

    var cust = esc(o.customerName || o.customer || '-');
    var phone = esc(
      o.phone || (o.orderMeta && o.orderMeta.phone) ||
      (o.customer && o.customer.phone) || ''
    );
    var mode = (o.mode || o.orderType || 'pickup').toString().toLowerCase();
    var meta =
      (mode === 'dinein' || mode === 'mesa')
        ? ('Mesa ' + esc(o.table || o.tableNumber || '?'))
        : (mode === 'online' ? 'Online' : 'Pickup');

    var items = Object.prototype.toString.call(o.items) === '[object Array]' ? o.items : [];
    var itemsHtml = '';
    var i;
    for (i = 0; i < items.length; i++) {
      itemsHtml += buildItemLines(items[i]);
    }

    if (!itemsHtml) {
      // si no hay items visibles, ni lo mostramos
      return '';
    }

    var topLine = cust + ' · ' + esc(meta);
    if (phone) topLine += ' · ' + 'Tel: ' + phone;

    var paid = isPaid(o);
    var totalLine = paid
      ? 'Total: <b>' + money(total) + '</b> · <span class="chip">Pagado</span>'
      : 'Total por cobrar: <b>' + money(total) + '</b>';

    var id = o.id ? String(o.id).substr(0, 6).toUpperCase() : '';
    var idBadge = id ? '<span class="chip mono">#' + esc(id) + '</span> ' : '';

    return '' +
      '<div class="ord">' +
        '<div>' + idBadge + '<b>' + topLine + '</b></div>' +
        '<div class="muted">' + totalLine + '</div>' +
        (o.notes ? '<div class="muted">Notas generales: ' + esc(o.notes) + '</div>' : '') +
        itemsHtml +
      '</div>';
  }

  function render(list){
    list = Object.prototype.toString.call(list) === '[object Array]' ? list : [];

    var pending = [];
    var inprog  = [];
    var ready   = [];
    var bill    = [];

    for (var i = 0; i < list.length; i++) {
      var o = list[i] || {};
      var st = normStatus(o.status);
      var total = calcTotal(o);
      var itemsOk = Object.prototype.toString.call(o.items) === '[object Array]' &&
                    o.items.length > 0;

      // filtros de limpieza
      if (isPaid(o)) continue;
      if (!itemsOk || total <= 0) continue;
      if (st === 'DONE' || st === 'CANCELLED' || st === 'PAID') continue;

      if (st === 'PENDING') pending.push(o);
      else if (st === 'IN_PROGRESS') inprog.push(o);
      else if (st === 'READY') ready.push(o);
      else if (st === 'DELIVERED') bill.push(o);
      else pending.push(o);
    }

    // ordenar por createdAt asc
    function ts(o){
      var c = o && o.createdAt;
      if (!c) return 0;
      if (typeof c.toMillis === 'function') return c.toMillis();
      if (c.seconds != null) return c.seconds * 1000;
      return Number(c) || 0;
    }
    function sortByCreated(a,b){ return ts(a) - ts(b); }

    pending.sort(sortByCreated);
    inprog.sort(sortByCreated);
    ready.sort(sortByCreated);
    bill.sort(sortByCreated);

    function htmlFor(arr){
      if (!arr.length) return '';
      var h = '';
      for (var i=0;i<arr.length;i++){
        h += buildCard(arr[i]);
      }
      return h;
    }

    setCol(COLS.PENDING,     htmlFor(pending));
    setCol(COLS.IN_PROGRESS, htmlFor(inprog));
    setCol(COLS.READY,       htmlFor(ready));
    setCol(COLS.BILL,        htmlFor(bill));
  }

  // ===== Suscripción Firestore =====

  try {
    db.collection(ORDERS_COLLECTION)
      .orderBy('createdAt', 'asc')
      .onSnapshot(function(snap){
        var list = [];
        snap.forEach(function(doc){
          var data = doc.data() || {};
          data.id = doc.id;
          list.push(data);
        });
        render(list);
      }, function(err){
        console.error('[cocina.legacy] onSnapshot error', err);
      });
  } catch (e) {
    console.error('[cocina.legacy] Error configurando snapshot', e);
  }

})();
