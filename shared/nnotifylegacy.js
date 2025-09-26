<script>
(function(){
  if (!window.toast) {
    window.toast = function(msg, icon, opts){
      var t = document.createElement('div');
      t.className = 'toast toast-default'; // apalanca tu styles.css
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      t.innerHTML = (icon? '<span style="margin-right:6px">'+icon+'</span>' : '') + msg;
      document.body.appendChild(t);
      setTimeout(function(){ t.classList.add('show'); }, 0);
      setTimeout(function(){ t.classList.remove('show'); setTimeout(function(){ t.parentNode && t.parentNode.removeChild(t); }, 300); }, (opts && opts.duration) || 2400);
    };
  }
  if (!window.beep) {
    window.beep = function(ms, freq){
      try{
        var a = document.createElement('audio');
        // tono pre-generado mínimo (silencio; navegadores viejos a veces bloquean autoplay)
        a.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';
        a.play().catch(function(){});
      }catch(e){}
    };
  }
})();
</script>
