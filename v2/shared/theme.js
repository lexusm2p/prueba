// /shared/theme.js — Presets tematizables con packs de íconos
// API principal:
//   applyThemeLocal(nameOrPreset[, presetObj])
//   initThemeFromSettings({ defaultName })
//   listThemes()
//   setTheme(name)  // (opcional) si usas Admin para guardar global
//
// IMPORTANTE para /kiosk/app.js:
//   - Debe existir window.__lastThemePreset con { packBaseUrl, icons, images?, ... }.
//   - Debe setear <html data-theme-name="Nombre"> para que startThemeWatcher() detecte cambios.
//   - packBaseUrl: ruta base ABSOLUTA o relativa al sitio (termina con /).
//   - icons: { starter:"starter.png", finalboss:"finalboss.png", ... } rutas relativas a packBaseUrl.

import { db, doc, getDoc, setDoc, onSnapshot } from './db.js'; // si no guardas en Firestore, no pasa nada.

// ============== Presets de ejemplo (edítalos a tus rutas reales) ==============
const PRESETS = {
  "Base": {
    name: "Base",
    colors: { primary: "#ffc242", accent:"#7cc9ff", bg:"#0b0f19" },
    fonts: {
      importUrl:'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap',
      base:'"Press Start 2P", system-ui, -apple-system, Segoe UI, Roboto, Arial',
      display:'"Press Start 2P", system-ui, -apple-system, Segoe UI, Roboto, Arial'
    },
    // Sin pack; tu app.js caerá a ICONS/ICONS_MEX de fallback
    packBaseUrl: "",
    icons: {}
  },

  "Retro Arcade": {
    name: "Retro Arcade",
    colors: { primary: "#ff5cf0", accent:"#59d2ff", bg:"#0b0f19" },
    fonts: {
      importUrl:'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Alfa+Slab+One&display=swap',
      base:'"Press Start 2P", system-ui, -apple-system, Segoe UI, Roboto, Arial',
      display:'"Alfa Slab One","Press Start 2P", system-ui, -apple-system, Segoe UI, Roboto, Arial'
    },
    // 👉 Ajusta esta ruta al folder donde coloques tus PNG de personajes
    // Ej.: /assets/packs/arcade/  (debe terminar con "/")
    packBaseUrl: "/assets/packs/arcade/",
    // 👉 Los nombres de clave DEBEN coincidir con los IDs base que usa tu carta:
    // starter, koopa, fatality, mega, hadouken, nintendo, finalboss
    icons: {
      starter:   "starter.png",
      koopa:     "koopa.png",
      fatality:  "fatality.png",
      mega:      "mega.png",
      hadouken:  "hadouken.png",
      nintendo:  "nintendo.png",
      finalboss: "finalboss.png"
    },
    images: {
      // opcional: fondos por dispositivo si los usas en CSS con data-theme-image
      bg: {
        mobile:  "/assets/packs/arcade/bg-m.webp",
        tablet:  "/assets/packs/arcade/bg-t.webp",
        desktop: "/assets/packs/arcade/bg-d.webp"
      }
    }
  },

  "Día de Muertos": {
    name: "Día de Muertos",
    colors: { primary:"#ffd27f", accent:"#7cc9ff", bg:"#0b0f19" },
    fonts: {
      importUrl:'https://fonts.googleapis.com/css2?family=Emilys+Candy&family=Press+Start+2P&display=swap',
      base:'"Press Start 2P", system-ui, -apple-system, Segoe UI, Roboto, Arial',
      display:'"Emilys Candy","Press Start 2P", system-ui, -apple-system, Segoe UI, Roboto, Arial'
    },
    // 👉 Segundo pack de ejemplo
    packBaseUrl: "/assets/packs/muertos/",
    icons: {
      starter:   "starter.png",
      koopa:     "koopa.png",
      fatality:  "fatality.png",
      mega:      "mega.png",
      hadouken:  "hadouken.png",
      nintendo:  "nintendo.png",
      finalboss: "finalboss.png"
    },
    images: {
      bg: {
        mobile:  "/assets/packs/muertos/bg-m.webp",
        tablet:  "/assets/packs/muertos/bg-t.webp",
        desktop: "/assets/packs/muertos/bg-d.webp"
      }
    }
  }
};

// ====================== Utilidades internas ======================
function injectFont(importUrl){
  if (!importUrl) return;
  const id='theme-fonts';
  if (document.getElementById(id)) return;
  const link=document.createElement('link');
  link.id=id; link.rel='stylesheet'; link.href=importUrl;
  document.head.appendChild(link);
}

function applyCssVars(preset){
  const r = document.documentElement;
  if (preset?.colors?.bg)       r.style.setProperty('--bg', preset.colors.bg);
  if (preset?.colors?.primary)  r.style.setProperty('--primary', preset.colors.primary);
  if (preset?.colors?.accent)   r.style.setProperty('--accent', preset.colors.accent);

  if (preset?.fonts?.base)      r.style.setProperty('--font-base', preset.fonts.base);
  if (preset?.fonts?.display)   r.style.setProperty('--font-display', preset.fonts.display);
  // alias
  r.style.setProperty('--font',       getComputedStyle(r).getPropertyValue('--font-base').trim() || preset?.fonts?.base || '');
}

function replaceDataThemeAssets(preset){
  // Soporte opcional: <img data-theme-image="bg"> o [data-theme-icon="starter"]
  if (!preset) return;
  const pack = preset.packBaseUrl || '';
  const iconMap = preset.icons || {};

  // Reemplazo de íconos declarativos si los usas en algún template:
  document.querySelectorAll('[data-theme-icon]').forEach(el=>{
    const key = el.getAttribute('data-theme-icon');
    const rel = iconMap[key];
    if (pack && rel) {
      const url = new URL(rel, window.location.origin + pack).toString();
      if (el.tagName === 'IMG') el.setAttribute('src', url);
      else el.style.setProperty('background-image', `url("${url}")`);
    }
  });

  // Reemplazo de imágenes de fondo por device (si las usas)
  const bg = preset.images?.bg || {};
  document.querySelectorAll('[data-theme-image]').forEach(el=>{
    const slot = el.getAttribute('data-theme-image'); // mobile/tablet/desktop/bg
    const rel  = bg[slot] || bg.desktop || bg.mobile || null;
    if (!rel || !pack) return;
    const url = rel.startsWith('/') ? rel : (new URL(rel, window.location.origin + pack).toString());
    el.style.setProperty('background-image', `url("${url}")`);
  });
}

// ====================== API pública ======================
export function listThemes(){
  return Object.keys(PRESETS);
}

export function applyThemeLocal(nameOrPreset, maybePreset){
  const preset = typeof nameOrPreset === 'string'
    ? (PRESETS[nameOrPreset] || PRESETS['Base'])
    : (nameOrPreset || maybePreset || PRESETS['Base']);

  // 1) Exponer preset para /kiosk/app.js → getThemeIconFor()
  window.__lastThemePreset = preset;

  // 2) Inyectar fuentes
  injectFont(preset?.fonts?.importUrl);

  // 3) Aplicar variables CSS
  applyCssVars(preset);

  // 4) Marcar el DOM (para tu watcher)
  const root = document.documentElement;
  root.setAttribute('data-theme-name', preset?.name || 'Base');

  // 5) (Opcional) reemplazar assets declarativos
  replaceDataThemeAssets(preset);

  // 6) Avisar a la app
  window.dispatchEvent(new CustomEvent('theme:changed', { detail: { name: preset?.name || 'Base' } }));
}

export function initThemeFromSettings({ defaultName='Base' }={}){
  // Si tienes Firestore con /settings/theme, suscríbete:
  // Estructura sugerida del doc: { name: "Retro Arcade" }
  try{
    const ref = doc(db, 'settings', 'theme');
    return onSnapshot(ref, snap=>{
      const data = snap.exists() ? (snap.data()||{}) : {};
      const name = String(data.name || defaultName);
      applyThemeLocal(name);
    }, _err=>{
      // Si falla, aplica local
      applyThemeLocal(defaultName);
    });
  }catch(_){
    // Sin Firestore: aplica local
    applyThemeLocal(defaultName);
    return ()=>{};
  }
}

// (Opcional) Guardado global del tema (para Admin)
export async function setTheme(name='Base'){
  try{
    const ref = doc(db, 'settings', 'theme');
    await setDoc(ref, { name: String(name) }, { merge:true });
  }catch(e){
    console.warn('[theme] setTheme fallo, aplica local', e);
    applyThemeLocal(name);
  }
}
