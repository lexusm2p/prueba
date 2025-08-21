// /shared/notify.js
// Sonido breve + Toast UX.

export function beep(ms = 140, freq = 880) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'square'; osc.frequency.value = freq; gain.gain.value = 0.05;
    osc.start(); setTimeout(() => { osc.stop(); ctx.close(); }, ms);
  } catch {}
}

export function toast(message, icon = '') {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.innerHTML = icon ? `<span style="font-size:16px">${icon}</span> ${message}` : message;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}
