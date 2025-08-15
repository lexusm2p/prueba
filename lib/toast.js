export function toast(msg,{star=false,ms=2200}={}){
  const t = document.createElement('div');
  t.className='toast'; t.innerHTML = star ? `⭐ ${msg}` : msg;
  document.body.appendChild(t); setTimeout(()=>t.remove(), ms);
}
