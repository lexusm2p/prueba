
export function beep(){
  try{
    const a = new (window.AudioContext||window.webkitAudioContext)();
    const o = a.createOscillator(); const g = a.createGain();
    o.connect(g); g.connect(a.destination);
    o.type='triangle'; o.frequency.value=880;
    o.start(); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + .15);
    setTimeout(()=>a.close(), 250);
  }catch(e){}
}
export function toast(msg, icon=''){
  const el = document.querySelector('.toast') || Object.assign(document.body.appendChild(document.createElement('div')), {className:'toast'});
  el.innerHTML = (icon?`<span style="font-size:18px">${icon}</span>`:'') + `<span>${msg}</span>`;
  el.classList.add('show'); setTimeout(()=>el.classList.remove('show'), 2200);
}
