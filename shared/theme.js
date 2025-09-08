// /shared/theme.js
// Sistema de temas festivos mexicanos para el kiosko.
// - Aplica variables CSS en :root
// - Carga fuente opcional del tema
// - Suscripción en vivo a /settings.theme.name (si DB lo soporta)
// - Fallback sin backend usando localStorage ("kiosk.theme")
// - Decoraciones pixel‑art (baner, papel picado, sombrero) para "Independencia"

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
    // Fuente con feeling “poster vintage”, conservando Press Start 2P
    fontFamily: '"Chakra Petch", "Press Start 2P", system-ui, -apple-system, Segoe UI, Roboto, Arial',
    fontUrl: 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600;700&display=swap',
    // Decoraciones especiales
    decorations: { vivaBanner: true, papelPicado: true, sombrero: true }
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
    fontUrl: 'https://fonts.googleapis.com/css2?family=Nova+Round&display=swap',
    decorations: { vivaBanner:false, papelPicado:false, sombrero:false }
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
    fontUrl: 'https://fonts.googleapis.com/css2?family=Nunito:wght@800&display=swap',
    decorations: { vivaBanner:false, papelPicado:false, sombrero:false }
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
    fontUrl: 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@800&display=swap',
    decorations: { vivaBanner:false, papelPicado:false, sombrero:false }
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
    fontUrl: 'https://fonts.googleapis.com/css2?family=Changa+One:ital@0;1&display=swap',
    decorations: { vivaBanner:false, papelPicado:false, sombrero:false }
  }
};

/* ================= utilidades base ================= */
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
  document.documentElement.style.setProperty('--font', family);
}

/* =============== Decoraciones “Independencia” =============== */
// CSS común para decoraciones
const DECOR_STYLE_ID = 'theme-decor-css';
function injectDecorCss(){
  if (document.getElementById(DECOR_STYLE_ID)) return;
  const css = `
  /* Banner Viva México pixel/arcade */
  #mx-viva {
    position: fixed; left: 50%; transform: translateX(-50%);
    top: 8px; z-index: 60;
    font-family: 'Press Start 2P', monospace;
    font-size: 12px; line-height: 1.1;
    letter-spacing: .5px;
    color: #fff; text-shadow: 0 2px 0 rgba(0,0,0,.35);
    background:
      linear-gradient(#0f1a12,#0a140d) padding-box,
      linear-gradient(90deg,#18c96b,#ffffff,#ff4d4d) border-box;
    border: 2px solid transparent; border-radius: 10px;
    padding: 8px 12px;
    box-shadow: 0 10px 24px rgba(0,0,0,.35);
  }
  #mx-viva .blink{ animation: blink 1s steps(2,end) infinite }
  @keyframes blink { 50% { opacity:.2 } }

  /* Papel picado (fijo al fondo, no interfiere con el gameplay) */
  #mx-papel {
    position: fixed; inset: 0; z-index: 0; pointer-events: none;
    opacity: .18;
    background-size: 140px 90px;
    background-repeat: repeat;
    image-rendering: pixelated;
  }

  /* Sombrero arriba del logo/brand */
  #mx-sombrero {
    position: absolute; z-index: 61; width: 64px; height: 48px;
    transform: translate(-6px,-42px) rotate(-8deg);
    image-rendering: pixelated;
    pointer-events: none;
  }
  `;
  const style = document.createElement('style');
  style.id = DECOR_STYLE_ID; style.textContent = css;
  document.head.appendChild(style);
}

// SVGs (data URL) – ligeros y pixelados
const SVG_SOMBRERO = `data:image/svg+xml;utf8,
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 48' shape-rendering='crispEdges'>
  <rect width='64' height='48' fill='none'/>
  <path d='M8 32h48v6H8z' fill='%23b27a2e'/>
  <path d='M12 28h40v4H12z' fill='%23d6a54b'/>
  <path d='M26 10h12v10H26z' fill='%23c28a34'/>
  <path d='M24 20h16v6H24z' fill='%23e3b358'/>
  <path d='M18 34h28v2H18z' fill='%23ff4d4d'/>
  <path d='M22 34h4v2h-4z' fill='%2318c96b'/>
</svg>`;

const SVG_PAPEL = `data:image/svg+xml;utf8,
<svg xmlns='http://www.w3.org/2000/svg' width='140' height='90' shape-rendering='crispEdges'>
  <rect width='140' height='90' fill='%230b1420'/>
  <!-- tiras verde, blanco, rojo pixel -->
  <rect x='0' y='0' width='140' height='12' fill='%2318c96b'/>
  <rect x='0' y='12' width='140' height='12' fill='%23ffffff'/>
  <rect x='0' y='24' width='140' height='12' fill='%23ff4d4d'/>
  <!-- recortes simples tipo papel -->
  <rect x='10' y='50' width='12' height='12' fill='%23151f2d'/>
  <rect x='36' y='56' width='8' height='8' fill='%23151f2d'/>
  <rect x='58' y='50' width='12' height='12' fill='%23151f2d'/>
  <rect x='86' y='56' width='8' height='8' fill='%23151f2d'/>
  <rect x='110' y='50' width='12' height='12' fill='%23151f2d'/>
</svg>`;

// Crear o quitar nodos
function ensureNode(id, tag = 'div'){
  let el = document.getElementById(id);
  if (!el){ el = document.createElement(tag); el.id = id; document.body.appendChild(el); }
  return el;
}
function removeNode(id){ const el = document.getElementById(id); if (el) el.remove(); }

// Aplica/limpia decor según tema
function applyDecorations(themeName){
  const conf = THEMES[themeName]?.decorations || {};
  // CSS base
  injectDecorCss();

  // Papel picado
  if (conf.papelPicado){
    const papel = ensureNode('mx-papel');
    papel.style.backgroundImage = `url("${SVG_PAPEL}")`;
    papel.style.display = 'block';
  } else { removeNode('mx-papel'); }

  // Banner ¡VIVA MÉXICO!
  if (conf.vivaBanner){
    const viva = ensureNode('mx-viva');
    viva.innerHTML = `🎉 <span class="blink">¡VIVA MÉXICO!</span> 🇲🇽`;
    viva.style.display = 'block';
  } else { removeNode('mx-viva'); }

  // Sombrero sobre brand
  if (conf.sombrero){
    const sombrero = ensureNode('mx-sombrero','img');
    sombrero.src = SVG_SOMBRERO;
    // Intenta posicionarlo sobre #brandTap si existe
    const brand = document.getElementById('brandTap');
    if (brand){
      brand.style.position = brand.style.position || 'relative';
      brand.appendChild(sombrero);
    } else {
      // Fallback: esquina superior izquierda
      sombrero.style.position = 'fixed';
      sombrero.style.left = '18px';
      sombrero.style.top  = '22px';
      document.body.appendChild(sombrero);
    }
    sombrero.style.display = 'block';
  } else { removeNode('mx-sombrero'); }
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
  // Decoraciones
  applyDecorations(name);
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
  if (typeof DB.setTheme === 'function'){ return DB.setTheme({ name }); }
  if (typeof DB.setSettings === 'function'){ return DB.setSettings({ theme:{ name } }); }
  if (typeof DB.updateSettings === 'function'){ return DB.updateSettings({ theme:{ name } }); }
  try{ localStorage.setItem('kiosk.theme', name); }catch{}
}
