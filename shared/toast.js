export function toast(msg,cls=''){
  let t=document.querySelector('.toast'); if(!t){ t=document.createElement('div'); t.className='toast'; document.body.appendChild(t); }
  t.className='toast show '+cls; t.textContent=msg; setTimeout(()=>t.classList.remove('show'),2500);
}
