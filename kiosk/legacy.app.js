/* kiosk/app.legacy.js — ES5 (100% compatible) */

/* ---------- Polyfills mínimos para legacy ---------- */
(function(){
  if (!Element.prototype.matches) {
    Element.prototype.matches =
      Element.prototype.msMatchesSelector ||
      Element.prototype.webkitMatchesSelector ||
      function(s){
        var matches = (this.document || this.ownerDocument).querySelectorAll(s);
        var i = matches.length;
        while (--i >= 0 && matches.item(i) !== this) {}
        return i > -1;
      };
  }
  if (!Element.prototype.closest) {
    Element.prototype.closest = function(s){
      var el = this;
      while (el && el.nodeType === 1) {
        if (el.matches(s)) return el;
        el = el.parentElement || el.parentNode;
      }
      return null;
    };
  }
})();

/* ---------- App ---------- */
(function(){
  var DB = window.DB || {};
  var toast = window.toast || function(s){ try{console.log('toast:',s);}catch(_){ } };
  var beep  = window.beep  || function(){};

  // ===== Helpers =====
  function $(sel, root){ return (root||document).querySelector(sel); }
  function formatMoney(n){ return '$'+Number(n||0).toFixed(0); }
  function escapeHtml(s){
    return String(s||'').replace(/[&<>"']/g, function(m){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m];
    });
  }
  // slug compatible (sin normalize obligatorio)
  function slug(s){
    s = String(s||'').toLowerCase();
    // quitar acentos básico sin normalize:
    var map = {'á':'a','é':'e','í':'i','ó':'o','ú':'u','ü':'u','ñ':'n'};
    s = s.replace(/[áéíóúüñ]/g, function(c){ return map[c] || c; });
    return s.replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'item';
  }

  var STATE = {
    products: [],
    cart: [],           // [{id,name,price,qty}]
    hh: null
  };
  var hhTimer = null;

  // ===== Render productos por categorías =====
  function groupBy(arr, keyFn){
    var map = {}; for (var i=0;i<arr.length;i++){
      var k = keyFn(arr[i]); if(!map[k]) map[k]=[];
      map[k].push(arr[i]);
    } return map;
  }

  function priceWithHH(base){
    var price = Number(base||0);
    if (STATE.hh && STATE.hh.enabled && Number(STATE.hh.discountPercent||0)>0){
      price = Math.round(price * (1 - (Number(STATE.hh.discountPercent||0)/100)));
    }
    return price;
  }

  function renderCatalog(){
    var root = $('#kioCatalog'); if (!root) return;
    if (!STATE.products.length){
      root.innerHTML = '<div class="muted small">Sin catálogo</div>'; return;
    }
    var groups = groupBy(
      STATE.products.filter(function(p){ return p.active!==false; }),
      function(p){ return String(p.type||'General'); }
    );

    var html = '';
    for (var g in groups){
      html += '<section class="k-sec"><h3>'+escapeHtml(g)+'</h3><div class="k-grid">';
      var list = groups[g];
      for (var i=0;i<list.length;i++){
        var p = list[i];
        var pid = p.id || slug(p.name); // Fallback de ID
        var price = priceWithHH(p.price);
        html += ''+
        '<article class="k-card">'+
          '<div class="k-title">'+escapeHtml(p.name||'Producto')+'</div>'+
          '<div class="k-price">'+formatMoney(price)+'</div>'+
          '<div class="k-actions">'+
            '<button class="btn small" data-a="add" data-id="'+pid+'">Agregar</button>'+
          '</div>'+
        '</article>';
      }
      html += '</div></section>';
    }
    root.innerHTML = html;
  }

  function findProductById(pid){
    for (var i=0;i<STATE.products.length;i++){
      var p = STATE.products[i];
      var id = p.id || slug(p.name);
      if (id === pid) return p;
    }
    return null;
  }

  // ===== Carrito =====
  function addToCart(prodId){
    var p = findProductById(prodId); if(!p) return;
    var idx=-1; for (var j=0;j<STATE.cart.length;j++){ if(STATE.cart[j].id===prodId){ idx=j; break; } }
    if (idx>=0) STATE.cart[idx].qty += 1;
    else STATE.cart.push({ id:prodId, name:p.name, price:Number(p.price||0), qty:1 });
    renderCart(); beep();
  }
  function removeFromCart(prodId){
    for (var i=0;i<STATE.cart.length;i++){ if (STATE.cart[i].id===prodId){ STATE.cart.splice(i,1); break; } }
    renderCart();
  }
  function changeQty(prodId, delta){
    for (var i=0;i<STATE.cart.length;i++){
      var it = STATE.cart[i]; if (it.id===prodId){
        var next = Number(it.qty||1) + delta;
        if (next <= 0) { STATE.cart.splice(i,1); }
        else { it.qty = next; }
        break;
      }
    }
    renderCart();
  }

  function cartTotal(){
    var t=0;
    for (var i=0;i<STATE.cart.length;i++){
      var line = priceWithHH(STATE.cart[i].price) * Number(STATE.cart[i].qty||1);
      t += line;
    }
    return t;
  }

  function renderCart(){
    var tb = $('#kioCart tbody'), totalEl = $('#kioCartTotal');
    if (tb){
      if (!STATE.cart.length){
        tb.innerHTML = '<tr><td colspan="5">—</td></tr>';
      } else {
        var html=''; for (var i=0;i<STATE.cart.length;i++){
          var it=STATE.cart[i];
          var unit = priceWithHH(it.price);
          html += '<tr>'+
            '<td>'+escapeHtml(it.name)+'</td>'+
            '<td class="right">'+formatMoney(unit)+'</td>'+
            '<td class="right">'+it.qty+'</td>'+
            '<td class="right">'+formatMoney(unit*it.qty)+'</td>'+
            '<td class="right">'+
              '<button class="btn tiny ghost" data-a="dec" data-id="'+it.id+'">-</button> '+
              '<button class="btn tiny ghost" data-a="inc" data-id="'+it.id+'">+</button> '+
              '<button class="btn tiny warn" data-a="rm" data-id="'+it.id+'">x</button>'+
            '</td>'+
          '</tr>';
        }
        html && (tb.innerHTML = html);
      }
    }
    if (totalEl) totalEl.textContent = formatMoney(cartTotal());
  }

  // ===== Crear pedido =====
  // Nota: el backend NO aplica HH automáticamente; el precio con HH ya va calculado en items.
  function placeOrder(){
    if (!STATE.cart.length){ toast('Agrega productos'); return; }
    var items = [];
    for (var i=0;i<STATE.cart.length;i++){
      var it = STATE.cart[i];
      var unitPrice = priceWithHH(it.price);
      items.push({ id: it.id, name: it.name, qty: it.qty, unitPrice: unitPrice, lineTotal: unitPrice*it.qty });
    }
    var order = {
      orderType: 'dinein', // o 'pickup' según tu UI
      customer: 'Mostrador',
      items: items,
      subtotal: items.reduce(function(s,it){return s+(it.lineTotal||it.unitPrice*it.qty);},0),
      tip: 0,
      createdAt: new Date()
    };
    var save = DB.createOrder || DB.upsertOrder;
    if (typeof save !== 'function'){ toast('Falta DB.createOrder'); return; }
    save(order).then(function(){
      toast('Pedido enviado');
      STATE.cart = []; renderCart();
    }).catch(function(){ toast('Error al crear pedido'); });
  }

  // ===== Eventos del DOM =====
  document.addEventListener('click', function(e){
    var add = e.target.closest && e.target.closest('button[data-a="add"]');
    if (add){ addToCart(add.getAttribute('data-id')); return; }
    var dec = e.target.closest && e.target.closest('button[data-a="dec"]');
    if (dec){ changeQty(dec.getAttribute('data-id'), -1); return; }
    var inc = e.target.closest && e.target.closest('button[data-a="inc"]');
    if (inc){ changeQty(inc.getAttribute('data-id'), +1); return; }
    var rm  = e.target.closest && e.target.closest('button[data-a="rm"]');
    if (rm){ removeFromCart(rm.getAttribute('data-id')); return; }
    var place = e.target.closest && e.target.closest('#btnPlaceOrder');
    if (place){ placeOrder(); return; }
  });

  // ===== Suscripciones =====
  if (typeof DB.subscribeProducts === 'function'){
    DB.subscribeProducts(function(items){ STATE.products = items||[]; renderCatalog(); });
  }

  if (typeof DB.subscribeHappyHour === 'function'){
    DB.subscribeHappyHour(function(hh){
      STATE.hh = hh||null;

      // contador visual HH
      if (hhTimer) { clearInterval(hhTimer); hhTimer=null; }
      var pill = $('#kioHH');

      function paintHH(){
        if (!pill) return;
        if (!STATE.hh || !STATE.hh.enabled){ pill.textContent = 'OFF'; return; }
        var txt = '-'+Number(STATE.hh.discountPercent||0)+'%';
        if (STATE.hh.endsAt){
          var left = Math.max(0, Number(STATE.hh.endsAt)-Date.now());
          var m = Math.floor(left/60000), s = Math.floor((left%60000)/1000);
          txt += ' · '+(m<10?'0':'')+m+':'+(s<10?'0':'')+s;
        }
        pill.textContent = txt;
      }

      paintHH();
      if (STATE.hh && STATE.hh.enabled && STATE.hh.endsAt) {
        hhTimer = setInterval(function(){ paintHH(); renderCart(); }, 1000);
      }

      renderCatalog(); renderCart();
    });
  }

  // ===== Init =====
  renderCatalog(); renderCart();

})();
