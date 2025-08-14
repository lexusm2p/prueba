
// shared/firebase.js
export function initFirebase() {
  if (!window.FBCONFIG) return null;
  // Dynamically load Firebase SDKs if not present
  if (!window.firebaseApp) {
    // Using v9 modular via CDN
    // Assumes you included firebase-app and firebase-firestore in page or will lazy import in backend
  }
  return window.FBCONFIG || null;
}
