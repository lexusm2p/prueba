
let TOAST_T=null;
export function toast(msg, icon='🔔'){
  clearTimeout(TOAST_T);
  const el=document.getElementById('toast'); if(!el) return;
  el.innerHTML=`<span class="icon">${icon}</span>${msg}`;
  el.style.display='block';
  TOAST_T=setTimeout(()=>{el.style.display='none'}, 2500);
}
export function beep(){
  try{
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    const o=ctx.createOscillator(); const g=ctx.createGain();
    o.frequency.value=880; o.type='square';
    g.gain.value=.03; o.connect(g); g.connect(ctx.destination); o.start();
    setTimeout(()=>{o.stop(); ctx.close();}, 180);
  }catch(e){}
}
