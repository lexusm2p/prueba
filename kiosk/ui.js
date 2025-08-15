// Renderiza la vista principal del kiosko
export function renderKiosk(root) {
  root.innerHTML = `
    <h1 style="margin:0 0 12px">🍔 Seven de Burgers — Kiosko</h1>
    <div style="display:grid;gap:12px">
      <a href="./kiosk/minis.html" style="padding:14px 16px;background:#123;display:inline-block;border-radius:10px;color:#fff;text-decoration:none">Minis & Combos</a>
      <a href="./kiosk/grandes.html" style="padding:14px 16px;background:#123;display:inline-block;border-radius:10px;color:#fff;text-decoration:none">¿Prefieres los retos más grandes?</a>
    </div>
  `;
}
