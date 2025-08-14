
// lib/notify.js
export function beep() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type='square'; o.frequency.value=880; o.connect(g); g.connect(ctx.destination);
  o.start();
  setTimeout(()=>{ o.stop(); ctx.close(); }, 160);
}
