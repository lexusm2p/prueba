
// shared/storage.js
// Simple storage layer with localStorage + BroadcastChannel, and optional Firestore adapter.
const BC = 'sb-orders';
const ch = ('BroadcastChannel' in self) ? new BroadcastChannel(BC) : null;

function uid(){ return Math.random().toString(36).slice(2)+Date.now().toString(36) }

function readLS(){
  try{ return JSON.parse(localStorage.getItem('sb_orders')||'[]'); }catch(e){ return [] }
}
function writeLS(list){ localStorage.setItem('sb_orders', JSON.stringify(list)); }

export const Storage = {
  async addOrder(order){
    // Firestore hook
    if (window.SB_FIREBASE && typeof window.SB_FIREBASE.addOrder === 'function'){
      return await window.SB_FIREBASE.addOrder(order);
    }
    // Fallback
    const list = readLS();
    const id = uid();
    const record = {id, createdAt: Date.now(), ...order};
    list.push(record); writeLS(list);
    ch && ch.postMessage({type:'added', record});
    return id;
  },
  subscribeOrders(cb){
    // Firestore hook
    if (window.SB_FIREBASE && typeof window.SB_FIREBASE.subscribeOrders === 'function'){
      return window.SB_FIREBASE.subscribeOrders(cb);
    }
    // Fallback
    const emit = ()=> cb(readLS().sort((a,b)=>a.createdAt-b.createdAt));
    emit();
    const onMsg = (e)=>{
      if (!e || !e.data) return;
      if (['added','updated','removed'].includes(e.data.type)) emit();
    };
    ch && ch.addEventListener('message', onMsg);
    const int = setInterval(emit, 1500);
    return ()=>{ ch && ch.removeEventListener('message', onMsg); clearInterval(int); };
  },
  async updateOrder(id, patch){
    if (window.SB_FIREBASE && typeof window.SB_FIREBASE.updateOrder === 'function'){
      return await window.SB_FIREBASE.updateOrder(id, patch);
    }
    const list = readLS(); const i = list.findIndex(r=>r.id===id);
    if (i>=0){ list[i] = {...list[i], ...patch, updatedAt: Date.now()}; writeLS(list); ch && ch.postMessage({type:'updated', id}); }
  },
  async removeOrder(id){
    if (window.SB_FIREBASE && typeof window.SB_FIREBASE.removeOrder === 'function'){
      return await window.SB_FIREBASE.removeOrder(id);
    }
    const list = readLS().filter(r=>r.id!==id); writeLS(list); ch && ch.postMessage({type:'removed', id});
  }
}
