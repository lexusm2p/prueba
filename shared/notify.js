//<!-- /shared/notify.js -->
<script type="module">
export function beep(ms=140, freq=880){
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type='square'; o.frequency.value=freq; g.gain.value=.05;
    o.start(); setTimeout(()=>{ o.stop(); ctx.close(); }, ms);
  }catch{}
}

export function toast(msg, icon=''){
  const t = document.createElement('div');
  t.className='toast';
  t.innerHTML = icon ? `${icon} ${msg}` : msg;
  document.body.appendChild(t);
  requestAnimationFrame(()=> t.classList.add('show'));
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(),150); }, 2200);
}
</script>
