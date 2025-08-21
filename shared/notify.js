// /shared/notify.js
export function beep(ms=140, freq=880){
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type='square'; o.frequency.value=freq; g.gain.value=.06;
    o.start(); setTimeout(()=>{ o.stop(); ctx.close(); }, ms);
  }catch{}
}

export function toast(msg, icon=''){
  const t = document.createElement('div');
  t.className='toast';
  t.innerHTML = icon ? `<span style="margin-right:6px">${icon}</span>${msg}` : msg;
  document.body.appendChild(t);
  t.classList.add('show');
  setTimeout(()=> t.remove(), 2400);
}
