import { createOrder } from '../lib/firebase.js';
import { BIG } from '../lib/menu.js';
import { beep } from '../lib/notify.js';

const sel = document.getElementById('m-item');
sel.innerHTML = BIG.map(b=>`<option value="${b.id}">${b.name} - $${b.price}</option>`).join('');

document.getElementById('m-send').onclick = async ()=>{
  const id = sel.value;
  const b = BIG.find(x=>x.id===id);
  const payload = {
    type:'big', itemId:b.id, itemName:b.name, qty:Math.max(1, parseInt(document.getElementById('m-qty').value||'1',10)),
    priceBase:b.price, extras:[], aderezos:[], surprise:false, ingredients:b.ingredients, customer:document.getElementById('m-name').value.trim()
  };
  await createOrder(payload);
  beep();
  alert('Pedido enviado');
};
