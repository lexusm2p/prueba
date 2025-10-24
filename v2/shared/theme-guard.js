// /shared/theme-guard.js
if (typeof window !== 'undefined' && !window._freezeSettings) {
  window._freezeSettings = (s) => Object.freeze({ ...(s || {}) });
}
