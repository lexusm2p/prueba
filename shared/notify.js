// ✅ notify.js
export function toast(msg, icon = "🍔") {
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `${icon} ${msg}`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("show"), 50);
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

export function beep() {
  const audio = new Audio("../shared/sounds/star.mp3");
  audio.play();
}
