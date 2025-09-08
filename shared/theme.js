// /shared/theme.js
// Sistema de temas festivos mexicanos para el kiosko.
// - Aplica variables CSS en :root
// - Carga fuente opcional del tema (si la hay)
// - Suscripción en vivo a /settings.theme.name (si DB lo soporta)
// - Fallback sin backend usando localStorage ("kiosk.theme")

import * as DB from './db.js';

/* ===================== Presets MX ===================== */
const THEMES = {
  // Septiembre / Grito
  'Independencia': {
    vars: {
      '--bg':'#09100b',
      '--panel':'#0f1a12',
      '--panel-2':'#0b130d',
      '--ink':'#f7fff7',
      '--muted':'#bfe7c7',
      '--muted-2':'#9dd7a7',
      '--accent':'#17c964',     // verde
      '--accent-2':'#ff4d4d',   // rojo
      '--danger':'#ff6b6b',
      '--ok':'#24d36b',
      '--stroke':'rgba(255,255,255,.10)',
    },
    // Fuente con feeling “poster vintage”
    fontFamily: '"Chakra Petch", "Press Start 2P", system-ui, -apple-system, Segoe UI, Roboto, Arial',
    fontUrl: 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;700&display=swap'
  },

  // Noviembre
  'Día de Muertos': {
    vars: {
      '--bg':'#0e0a14',
      '--panel':'#1a1426',
      '--panel-2':'#150f20',
      '--ink':'#fff7f1',
      '--muted':'#e6c7ff',
      '--muted-2':'#eab1ff',
      '--accent':'#ff9f1a',     // cempasúchil
      '--accent-2':'#7c5cff',   // morado
      '--danger':'#ff7a7a',
      '--ok':'#35e0a1',
      '--stroke':'rgba(255,255,255,.12)',
    },
    fontFamily: '"Nova Round", "Press Start 2P", system-ui, -apple-system, Segoe UI, Roboto, Arial',
    fontUrl: 'https://fonts.googleapis.com/css2?family=Nova+Round&display=swap'
  },

  // Diciembre
  'Navidad': {
    vars: {
      '--bg':'#0b0f0b',
      '--panel':'#0f1a12',
      '--panel-2':'#0b130d',
      '--ink':'#f5fff5',
      '--muted':'#c8e9c8',
      '--muted-2':'#a9d9b0',
      '--accent':'#e63946',     // rojo
      '--accent-2':'#57cc99',   // verde
      '--danger':'#ff6b6b',
      '--ok':'#2fd27d',
      '--stroke':'rgba(255,255,255,.12)',
    },
    fontFamily: '"Nunito", "Press Start 2P", system-ui, -apple-system, Segoe UI, Roboto, Arial',
    fontUrl: 'https://fonts.googleapis.com/css2?family=Nunito:wght@700;800&display=swap'
  },

  // Febrero
  'San Valentín': {
    vars: {
      '--bg':'#160b12',
      '--panel':'#231320',
      '--panel-2':'#1a0f19',
      '--ink':'#fff0f5',
      '--muted':'#ffd1e1',
      '--muted-2':'#ffb8d0',
      '--accent':'#ff4d8d',
      '--accent-2':'#ffd24a',
      '--danger':'#ff6b6b',
      '--ok':'#2fd27d',
      '--stroke':'rgba(255,255,255,.12)',
    },
    fontFamily: '"Baloo 2", "Press Start 2P", system-ui, -apple-system, Segoe UI, Roboto, Arial',
    fontUrl: 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&display=swap'
  },

  // Octubre
  'Halloween': {
    vars: {
      '--bg':'#0b0b12',
      '--panel':'#121426',
      '--panel-2':'#0f1020',
      '--ink':'#fef6ff',
      '--muted':'#d4c6ff',
      '--muted-2':'#b9a7ff',
      '--accent':'#ff7a00',   // naranja
      '--accent-2':'#7c5cff', // morado
      '--danger':'#ff6b6b',
      '--ok':'#2fd27d',
      '--stroke':'rgba(255,255,255,.12)'
    },
    fontFamily: '"Changa One", "Press Start 2P", system-ui, -apple-system, Segoe UI, Roboto, Arial',
    fontUrl: 'https://fonts.googleapis.com/css2?family=Changa+One:ital@0;1&display=swap'
  }
};

/* ================= utilidades ================= */
function ensureFontLoaded(url){
  if (!url) return;
  const id = 'theme-font-link';
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id; link.rel = 'stylesheet'; link.href = url;
  document.head.appendChild(link);
}
function applyVars(vars){
  const root = document.documentElement;
  Object.entries(vars||{}).forEach(([k,v])=> root.style.setProperty(k, v));
}
function setFontFamily(family){
  if (!family) return;
  const root = document.documentElement;
  // En tu CSS usas --font como variable principal
  root.style.setProperty('--font', family);
}

/* ============== API pública ============== */
export function listThemes(){ return Object.keys(THEMES); }

export function applyThemeLocal(name){
  const t = THEMES[name] || null;
  if (!t) return;
  ensureFontLoaded(t.fontUrl);
  applyVars(t.vars);
  setFontFamily(t.fontFamily);
  document.documentElement.setAttribute('data-theme', name);
  try{ localStorage.setItem('kiosk.theme', name); }catch{}
}

/**
 * Suscribe a /settings.theme.name si DB lo ofrece.
 * Si no hay backend, usa localStorage y aplica el último tema guardado.
 * @returns {Function} unsubscribe
 */
export function initThemeFromSettings({ defaultName='Independencia' } = {}){
  // 1) Aplica el que haya en localStorage de inicio (UX rápida)
  let initial = defaultName;
  try{
    const saved = localStorage.getItem('kiosk.theme');
    if (saved && THEMES[saved]) initial = saved;
  }catch{}
  applyThemeLocal(initial);

  // 2) Si el backend ofrece subscribeSettings, úsalo
  if (typeof DB.subscribeSettings === 'function'){
    const unsub = DB.subscribeSettings((settings)=>{
      const name = settings?.theme?.name || initial;
      if (THEMES[name]) applyThemeLocal(name);
    });
    return ()=> { try{unsub&&unsub();}catch{} };
  }

  // 3) Fallback sin backend: escuchar cambios de storage (multi‑tab)
  const onStorage = (e)=>{
    if (e.key === 'kiosk.theme' && THEMES[e.newValue]) applyThemeLocal(e.newValue);
  };
  window.addEventListener('storage', onStorage);
  return ()=> window.removeEventListener('storage', onStorage);
}

/* ================= Helpers para Admin =================
   setThemeGlobal() se invoca indirectamente desde kiosk/app.js
   vía DB.setTheme (lo exponemos como sugar aquí por si lo necesitas).
========================================================= */
export async function setThemeGlobal(name){
  // intenta DB.setTheme(); si no existe, usa setSettings/updateSettings; si no, localStorage.
  if (typeof DB.setTheme === 'function'){ return DB.setTheme({ name }); }
  if (typeof DB.setSettings === 'function'){ return DB.setSettings({ theme:{ name } }); }
  if (typeof DB.updateSettings === 'function'){ return DB.updateSettings({ theme:{ name } }); }
  try{ localStorage.setItem('kiosk.theme', name); }catch{}
}
