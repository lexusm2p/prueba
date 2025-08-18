
let toastEl=null; let toastTimer=null;
export function toast(msg){
  if(!toastEl){ toastEl=document.createElement('div'); toastEl.className='toast'; document.body.appendChild(toastEl); }
  toastEl.textContent=msg; toastEl.style.display='block';
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>toastEl.style.display='none',2600);
}
export function beep(){
  try{
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    const o=ctx.createOscillator(); const g=ctx.createGain();
    o.type='square'; o.frequency.value=880; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.12);
    o.start(); o.stop(ctx.currentTime+0.14);
  }catch(e){}
}

// SFX Estrella (coloca tu archivo en /shared/sounds/star.mp3)
export const starSfx = (()=>{
  const a=new Audio();
  a.preload='auto';
  a.src='../shared/sounds/star.mp3';
  let warmed=false;
  function prewarm(){
    if(warmed) return;
    warmed=true;
    try{ a.muted=true; a.play().then(()=>{ a.pause(); a.currentTime=0; a.muted=false; }).catch(()=>{ warmed=false; }); }catch(e){}
  }
  function play(){ try{ a.currentTime=0; a.play(); }catch(e){} }
  return { prewarm, play };
})();
