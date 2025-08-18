const ctx = new (window.AudioContext||window.webkitAudioContext)();
export function beep(freq=880, ms=90){
  const o=ctx.createOscillator(), g=ctx.createGain();
  o.frequency.value=freq; o.type='square'; o.connect(g); g.connect(ctx.destination);
  g.gain.setValueAtTime(0.0001,ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime+0.01);
  o.start(); o.stop(ctx.currentTime+ms/1000);
}
export async function star(){
  const notes=[880,1175,1568,2093];
  for(const f of notes){ beep(f,80); await new Promise(r=>setTimeout(r,90)); }
}
