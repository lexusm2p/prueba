let ctx;
export function beep(freq=880, dur=90){
  try{
    ctx = ctx || new (window.AudioContext||window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type='square'; o.frequency.value=freq;
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur/1000);
    o.connect(g).connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur/1000);
  }catch(e){/* ignore sound errors */}
}
