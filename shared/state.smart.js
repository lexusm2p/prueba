
// Try Firestore first; if not available (offline/rules/CDN), fall back to local.
let backend;
try {
  const fb = await import('./state.firebase.js');
  const ok = await fb.isAvailable(1800); // 1.8s probe
  backend = ok ? fb : await import('./state.local.js');
} catch (e) {
  backend = await import('./state.local.js');
}
export const { Status, subscribeOrders, addOrder, setStatus, archiveDelivered, backendName } = backend;
