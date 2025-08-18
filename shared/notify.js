
let toastEl=null, beepEl=null, starEl=null;
export function toast(msg){
  clear();
  toastEl=document.createElement('div');
  toastEl.className='toast';
  toastEl.innerHTML=msg;
  document.body.appendChild(toastEl);
  setTimeout(clear, 2600);
}
function clear(){ if(toastEl){ toastEl.remove(); toastEl=null; } }
export function beep(){
  if(!beepEl){
    beepEl = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABYAAAABAAABAAAAAAAAgP8AAP//'); // tiny click
  }
  try{ beepEl.currentTime=0; beepEl.play(); }catch{}
}
export const starSfx = {
  prewarmed:false,
  prewarm(){
    if(this.prewarmed) return;
    this.el = new Audio('../shared/sounds/star.mp3');
    this.el.volume = .9;
    this.prewarmed = true;
  },
  play(){
    if(!this.el){ this.prewarm(); }
    try{ this.el.currentTime=0; this.el.play(); }catch{}
  }
};
