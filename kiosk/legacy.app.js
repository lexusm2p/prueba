/* kiosk/app.legacy.js — ES5 */

(function(){
  var DB = window.DB || {};
  var toast = window.toast || function(s){ try{console.log('toast:',s);}catch(_){ } };
  var beep  = window.beep  || function(){};

  // ===== Helpers =====
  function $(sel, root){ return (root||document).querySelector(sel); }
  function formatMoney(n){ return '$'+Number(n||0).toFixed(0); }

  var STATE = {
    products: [],
    cart: [],           // [{id,name,price,qty}]
    hh: null
  };

  // ===== Render productos por categorías =====
  function groupBy(arr, keyFn){
    var map = {}; for (var i=0;i<arr.length;i++){
      var k = keyFn(arr[i]); if(!map[k]) map[k]=[];
      map[k].push(arr[i]);
    } return map;
  }
  function renderCatalog(){
    var root = $('#kioCatalog'); if (!root) return;
    if (!STATE.products.length){
      root.innerHTML = '<div class="muted small">Sin catálogo</div>'; return;
    }
    var groups = groupBy(STATE.products.filter(function(p){ return p.active!==false; }),
                         function(p){ return String(p.type||'General'); });

    var html = '';
    for (var g in groups){
      html += '<section class="k-sec"><h3>'+g+'</h3><div class="k-grid">';
      var list = groups[g];
      for (var i=0;i<list.length;i++){
        var p = list[i];
        var price = Number(p.price||0);
        // aplica HH (visual)
        if (STATE.hh && STATE.hh.enabled && STATE.hh.discountPercent>0){
          price = Math.round(price * (1 - (Number(STATE.hh.discountPercent||0)/100)));
        }
        html += ''+
        '<article class="k-card">'+
          '<div class="k-title">'+(p.name||'Producto')+'</div>'+
          '<div class="k-price">'+formatMoney(price)+'</div>'+
          '<div class="k-actions">'+
            '<button class="btn small" data-a="add" data-id="'+p.id+'">Agregar</button>'+
          '</div>'+
        '</article>';
      }
      html += '</div></section>';
    }
    root.innerHTML = html;
  }

  // ===== Carrito =====
  function addToCart(prodId){
    var p=null; for (var i=0;i<STATE.products.length;i++){ if(STATE.products[i].id===prodId){ p=STATE.products[i]; break; } }
    if(!p) return;
    var idx=-1; for (var j=0;j<STATE.cart.length;j++){ if(STATE.cart[j].id===p.id){ idx=j; break; } }
    if (idx>=0) STATE.cart[idx].qty += 1;
    else STATE.cart.push({ id:p.id, name:p.name, price:Number(p.price||0), qty:1 });
    renderCart(); beep();
  }
  function removeFromCart(prodId){
    for (var i=0;i<STATE.cart.length;i++){ if (STATE.cart[i].id===prodId){ STATE.cart.splice(i,1); break; } }
    renderCart();
  }
  function changeQty(prodId, delta){
    for (var i=0;i<STATE.cart.length;i++){
      var it = STATE.cart[i]; if (it.id===prodId){
        it.qty = Math.max(1, Number(it.qty||1) + delta);
        break;
      }
    }
    renderCart();
  }
  function cartTotal(){
    var t=0;
    for (var i=0;i<STATE.cart.length;i++){
      var line = Number(STATE.cart[i].price||0) * Number(STATE.cart[i].qty||1);
      if (STATE.hh && STATE.hh.enabled && STATE.hh.discountPercent>0){
        line = Math.round(line * (1 - (Number(STATE.hh.discountPercent||0)/100)));
      }
      t += line;
    }
    return t;
  }
  function renderCart(){
    var tb = $('#kioCart tbody'), totalEl = $('#kioCartTotal');
    if (!tb) return;
    if (!STATE.cart.length){
      tb.innerHTML = '<tr><td colspan="5">—</td></tr>';
    } else {
      var html=''; for (var i=0;i<STATE.cart.length;i++){
        var it=STATE.cart[i];
        var price = Number(it.price||0);
        if (STATE.hh && STATE.hh.enabled && STATE.hh.discountPercent>0){
          price = Math.round(price * (1 - (Number(STATE.hh.discountPercent||0)/100)));
        }
        html += '<tr>'+
          '<td>'+it.name+'</td>'+
          '<td class="right">'+formatMoney(price)+'</td>'+
          '<td class="right">'+it.qty+'</td>'+
          '<td class="right">'+formatMoney(price*it.qty)+'</td>'+
          '<td class="right">'+
            '<button class="btn tiny ghost" data-a="dec" data-id="'+it.id+'">-</button> '+
            '<button class="btn tiny ghost" data-a="inc" data-id="'+it.id+'">+</button> '+
            '<button class="btn tiny warn" data-a="rm" data-id="'+it.id+'">x</button>'+
          '</td>'+
        '</tr>';
      }
      tb.innerHTML = html;
    }
    if (totalEl) totalEl.textContent = formatMoney(cartTotal());
  }

  // ===== Crear pedido =====
  function placeOrder(){
    if (!STATE.cart.length){ toast('Agrega productos'); return; }
    var items = [];
    for (var i=0;i<STATE.cart.length;i++){
      var it = STATE.cart[i];
      var unitPrice = Number(it.price||0);
      if (STATE.hh && STATE.hh.enabled && STATE.hh.discountPercent>0){
        unitPrice = Math.round(unitPrice * (1 - (Number(STATE.hh.discountPercent||0)/100)));
      }
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
      var pill = $('#kioHH');
      if (pill){
        if (!hh || !hh.enabled){ pill.textContent = 'OFF'; }
        else {
          var txt = '-'+Number(hh.discountPercent||0)+'%';
          if (hh.endsAt){
            var left = Math.max(0, Number(hh.endsAt)-Date.now());
            var m = Math.floor(left/60000), s = Math.floor((left%60000)/1000);
            txt += ' · '+(m<10?'0':'')+m+':'+(s<10?'0':'')+s;
          }
          pill.textContent = txt;
        }
      }
      renderCatalog(); renderCart();
    });
  }

  // ===== Init =====
  renderCatalog(); renderCart();

})();
