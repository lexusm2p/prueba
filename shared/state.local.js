
export const Status = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  READY: 'ready',
  DELIVERED: 'delivered',
};
const STORAGE_KEY = 'sb_orders';
const CHANNEL = 'sb_channel';
const bc = ('BroadcastChannel' in self) ? new BroadcastChannel(CHANNEL) : null;
function read(){ try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]')}catch{return[]} }
function write(list, evt){ localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); bc && bc.postMessage(evt||{type:'orders:update'}); }
export function subscribeOrders(cb){
  const emit = ()=> cb(read());
  emit();
  if(bc){ bc.addEventListener('message', emit); }
  const iv = setInterval(emit, 1200);
  return ()=>{ bc && bc.removeEventListener('message', emit); clearInterval(iv); };
}
export function addOrder(o){
  const id = crypto.randomUUID();
  const rec = { id, createdAt: Date.now(), updatedAt: Date.now(), status: Status.PENDING, ...o };
  const list = read(); list.unshift(rec); write(list, {type:'orders:update', orderId:id}); return id;
}
export function setStatus(id, status){
  const list = read(); const i = list.findIndex(x=>x.id===id); if(i<0) return;
  list[i].status = status; list[i].updatedAt = Date.now();
  write(list, {type: status===Status.READY ? 'notify:ready' : 'orders:update', orderId:id, mesa:list[i].table, meseroId:list[i].waiterId});
}
export function archiveDelivered(id){
  const list = read().filter(x=>x.id!==id);
  write(list, {type:'orders:update', orderId:id});
}
export const backendName = 'local';
