/**
 * Muestra un mensaje temporal tipo "toast" en la pantalla.
 * @param {string} msg El mensaje a mostrar.
 * @param {object} [opts] Opciones para personalizar el toast.
 * @param {boolean} [opts.star=false] Si es true, añade una estrella al mensaje.
 * @param {number} [opts.ms=2200] Duración en milisegundos.
 * @returns {Promise<void>} Una promesa que se resuelve cuando el toast se ha eliminado.
 */
export function toast(msg, { star = false, ms = 2200 } = {}) {
  return new Promise((resolve) => {
    // 1. Sanitizar el mensaje para prevenir XSS
    const sanitizedMsg = String(msg).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[m]);

    // 2. Crear o reutilizar un contenedor para los toasts
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      Object.assign(container.style, {
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: '9999',
        display: 'flex',
        flexDirection: 'column-reverse', // Apila de abajo hacia arriba
        gap: '10px',
        maxWidth: '80%',
        alignItems: 'center',
        pointerEvents: 'none',
      });
      document.body.appendChild(container);
    }

    // 3. Crear el elemento toast
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = star ? `⭐ ${sanitizedMsg}` : sanitizedMsg;
    Object.assign(t.style, {
      padding: '12px 20px',
      background: 'rgba(0,0,0,0.85)',
      color: 'white',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
      opacity: '0',
      transition: 'opacity 0.2s ease-in-out, transform 0.2s ease-in-out',
      willChange: 'opacity, transform',
    });

    // Añadir el toast al contenedor y animar la entrada
    container.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '1';
      t.style.transform = 'translateY(0)';
    }, 10);

    // Animación de salida y eliminación
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateY(10px)';
    }, ms - 200);

    setTimeout(() => {
      t.remove();
      resolve();
    }, ms);
  });
}

