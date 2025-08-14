
# Seven de Burgers · v7.5.2 (Full Update)

**Default:** `index.html` redirige a `kiosk/`.
Roles via `login/`:
- Mesero (PIN: **7777**) — asigna nombre y mesa.
- Cocina (PIN: **1313**).
- Admin (PIN: **4242**).

## Estructura
- `/kiosk/` — ordena con scroll 100% móvil, aderezos/ingredientes extra, quitar ingredientes, notas, total.
- `/mesero/` — ve sus órdenes y puede marcar como **Entregado** lo que cocina ponga **Listo**.
- `/cocina/` — ve ingredientes finales, aderezos extra, salsa sugerida aplicada, notas; cambia a **En proceso** o **Listo**.
- `/admin/` — tabla de ventas (entregadas) y total de ingresos.
- `/shared/` — `menu.js` (datos), `storage.js` (persistencia), `auth.js` (roles).
- `/assets/styles.css` — estilo base.

## Persistencia
- Por defecto usa **localStorage + BroadcastChannel** (funciona en GitHub Pages).
- Si quieres Firestore, define `window.SB_FIREBASE` con `addOrder`, `subscribeOrders(cb)`, `updateOrder(id, patch)` y `removeOrder(id)` antes de cargar cada página.

## Subida a GitHub Pages
1. Sube todo el contenido del ZIP al repo (raíz).
2. Activa *Settings → Pages → Deploy from branch* (main / root).
3. Abre `https://tuusuario.github.io/tu-repo/` (redirige al kiosko).

## Personalización rápida
- Precios y listas en `shared/menu.js`.
- PINs en `login/index.html` (busca `7777`, `1313`, `4242`).

