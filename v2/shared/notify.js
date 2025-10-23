// /shared/notify.js

/**
 * Emite un beep simple usando Web Audio API.
 * @param {number} ms - Duración del beep en milisegundos.
 * @param {number} freq - Frecuencia del tono en Hz.
 */
export function beep(ms = 140, freq = 880) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.value = 0.06;
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, ms);
  } catch (err) {
    console.warn('Beep error:', err);
  }
}

/**
 * Muestra un toast emergente en pantalla.
 * @param {string} msg - Mensaje principal a mostrar.
 * @param {string} [icon] - HTML opcional para ícono (ej. emoji).
 * @param {Object} [opts] - Opciones: { theme, duration }.
 * @param {string} [opts.theme='default'] - Tema visual: 'ok', 'err', 'warn', etc.
 * @param {number} [opts.duration=2400] - Duración en milisegundos antes de desaparecer.
 */
export function toast(msg, icon = '', opts = {}) {
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
}
