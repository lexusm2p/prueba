// /shared/notify.js  — V2 compatible (named + default + global-safe)

/**
 * Beep con Web Audio API.
 * @param {number} ms  - duración (ms)
 * @param {number} freq- frecuencia (Hz)
 */
function beep(ms = 140, freq = 880) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('AudioContext no disponible');
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.value = 0.06;
    osc.start();
    setTimeout(() => {
      try { osc.stop(); } catch {}
      try { ctx.close(); } catch {}
    }, ms);
  } catch (err) {
    console.warn('[notify/beep] error:', err);
  }
}

/**
 * Toast simple.
 * @param {string} msg
 * @param {string} [icon]
 * @param {{theme?:string, duration?:number}} [opts]
 */
function toast(msg, icon = '', opts = {}) {
  try {
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');

    const theme = opts.theme || 'default';
    if (theme) t.classList.add(`toast-${theme}`);

    t.innerHTML = icon ? `<span style="margin-right:6px">${icon}</span>${msg}` : msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));

    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 300);
    }, opts.duration || 2400);
  } catch (err) {
    console.warn('[notify/toast] error:', err);
  }
}

/* ===== Exports ESM ===== */
export { beep, toast };           // named
export default { beep, toast };   // default

/* ===== Fallback global (no rompe módulos) ===== */
try {
  if (typeof window !== 'undefined') {
    window.notify = window.notify || {};
    window.notify.beep = window.notify.beep || beep;
    window.notify.toast = window.notify.toast || toast;
    // sólo asignamos propiedades del window, NO redeclaramos variables
    if (!window.beep) window.beep = beep;
    if (!window.toast) window.toast = toast;
  }
} catch {}
