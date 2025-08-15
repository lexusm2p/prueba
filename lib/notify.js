// lib/notify.js
export function beep(freq=880, ms=110){
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type='square';
    o.frequency.value=freq;
    o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.12, ctx.currentTime);
    o.start();
    setTimeout(()=>{ g.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime+0.03); o.stop(ctx.currentTime+0.04); ctx.close(); }, ms);
  }catch(e){ /* ignore */ }
}
