// /prueba/lib/notify.js
let audio;
export function beep() {
  try {
    if (!audio) {
      audio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAAAAP8AAP//AAAA//8AAP8A');
    }
    audio.currentTime = 0;
    audio.play().catch(()=>{});
  } catch {}
}
