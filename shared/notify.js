// Notificaciones visuales + sonido
export function beep(){
  new Audio("../shared/sounds/star.mp3").play();
}

export function toast(msg, icon="ℹ️"){
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `${icon} ${msg}`;
  document.body.appendChild(el);
  setTimeout(()=> el.remove(), 3000);
}
