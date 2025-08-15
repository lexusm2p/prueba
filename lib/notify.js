export function beep(ms=140, freq=880){
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type='square'; o.frequency.value=freq; g.gain.value=.05;
    o.start(); setTimeout(()=>{ o.stop(); ctx.close(); }, ms);
  }catch{}
}
