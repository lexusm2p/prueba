// /lib/notify.js
// Sonidos
export function beep(duration = 120, frequency = 880, volume = 0.15) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'square'; o.frequency.value = frequency;
  o.connect(g); g.connect(ctx.destination);
  g.gain.value = volume;
  o.start();
  setTimeout(() => { o.stop(); ctx.close(); }, duration);
}

export async function chime() {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const now = ctx.currentTime;
  const notes = [988, 1319]; // B5 -> E6
  notes.forEach((f, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    o.connect(g); g.connect(ctx.destination);
    const t0 = now + i * 0.12;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.06, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
    o.start(t0); o.stop(t0 + 0.2);
  });
  setTimeout(() => ctx.close(), 600);
}

// Toasts
export function toast(msg, { icon = '⭐', timeout = 2400 } = {}) {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    Object.assign(host.style, {
      position: 'fixed', left: 0, right: 0, bottom: '18px',
      display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 9999
    });
    document.body.appendChild(host);
  }
  const card = document.createElement('div');
  card.innerHTML = `<span style="margin-right:.5rem">${icon}</span>${msg}`;
  Object.assign(card.style, {
    background: 'rgba(18,28,38,.96)', color: '#fff',
    border: '1px solid rgba(255,215,64,.35)',
    borderRadius: '10px', padding: '10px 14px', fontSize: '14px',
    boxShadow: '0 6px 22px rgba(0,0,0,.35)', pointerEvents: 'auto'
  });
  host.appendChild(card);
  setTimeout(() => card.remove(), timeout);
}
