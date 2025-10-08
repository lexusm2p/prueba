// /shared/theme.js
// Temas para Kiosko/UI: presets integrados + presets guardados + packs de imágenes/iconos.
// API:
//   applyThemeLocal(nameOrPreset[, presetObj])
//   initThemeFromSettings({ defaultName })
//   listThemes()
//   subscribeThemePresets(cb)
//   saveThemePreset(presetObject)

import { db, doc, getDoc, setDoc, onSnapshot } from './firebase.js';

/* -------------------- Presets integrados -------------------- */
const THEMES_BUILTIN = {
  Base: {
    name: 'Base',
    palette: {
      bg:'#0b0f14', text:'#e8f0ff',
      panel1:'#0b0e12', panel2:'#0b0d15',
      ink1:'#e8f0ff', ink2:'#a6b2c7', muted:'#94a3b8',
      primary:'#ff2ebc', accent:'#ffc242',
      ok:'#00c27a', warn:'#ffd27f', danger:'#ff5d5d',
    },
    fonts:{
      importUrl:'https://fonts.googleapis.com/css2?family=Bungee&family=Inter:wght@400;600&display=swap',
      base:'Inter, system-ui, Arial',
      display:'"Bungee", cursive'
    },
    bg:{ image:'', overlay:'rgba(0,0,0,0)', size:'cover', position:'center', blur:0 },
    images:{}, icons:{}, packBaseUrl:''
  },

  /* === Ejemplos con packs (ajusta packBaseUrl a tu estructura real) === */

  Independencia: {
    name: 'Independencia',
    palette: {
      bg:'#0c1f10', text:'#fffdea',
      panel1:'#0c1610', panel2:'#0b140e',
      ink1:'#fffdea', ink2:'#e9e1b8', muted:'#cdd4a8',
      primary:'#2fb863', accent:'#d92121',
      ok:'#2ecc71', warn:'#e9c87a', danger:'#ff4d4d',
    },
    fonts:{
      importUrl:'https://fonts.googleapis.com/css2?family=Frijole&family=Rye&family=Inter:wght@400;600&display=swap',
      base:'Inter, system-ui, Arial',
      display:'"Frijole","Rye",cursive'
    },
    bg:{
      image:{
        mobile:'images/bg-m.webp',
        tablet:'images/bg-t.webp',
        desktop:'images/bg-d.webp'
      },
      overlay:'rgba(0,0,0,.35)', size:'cover', position:'center', blur:0
    },
    images:{ hero:'images/hero.jpg', logo:'images/logo.svg' },
    icons:{ burger:'icons/burger.svg', fries:'icons/fries.svg', drink:'icons/drink.svg' },
    packBaseUrl:'/themes/independencia/'
  },

  'Día de Muertos': {
    name: 'Día de Muertos',
    palette:{
      bg:'#0b0a12', text:'#ffeefb',
      panel1:'#0e0b16', panel2:'#120f1d',
      ink1:'#ffeefb', ink2:'#f9b9ff', muted:'#ffb4e6',
      primary:'#ff7ab6', accent:'#ffa800',
      ok:'#60e0a0', warn:'#ffc266', danger:'#ff6b6b',
    },
    fonts:{
      importUrl:'https://fonts.googleapis.com/css2?family=Emilys+Candy&family=Ribeye&family=Inter:wght@400;600&display=swap',
      base:'Inter, system-ui, Arial',
      display:'"Emilys Candy","Ribeye",cursive'
    },
    bg:{
      image:{
        mobile:'images/bg-m.webp',
        tablet:'images/bg-t.webp',
        desktop:'images/bg-d.webp'
      },
      overlay:'rgba(0,0,0,.35)', size:'cover', position:'center', blur:0
    },
    images:{ hero:'images/hero.jpg', logo:'images/logo.svg' },
    // Íconos del pack (las claves deben coincidir con tus baseId)
    icons:{
      starter:   'icons/burgers/starter.png',
      koopa:     'icons/burgers/koopa.png',
      fatality:  'icons/burgers/fatality.png',
      mega:      'icons/burgers/mega.png',
      hadouken:  'icons/burgers/hadouken.png',
      nintendo:  'icons/burgers/nintendo.png',
      finalboss: 'icons/burgers/finalboss.png'
    },
    // Ruta base del pack (absoluta o relativa; el resolver soporta ambas)
    packBaseUrl:'/themes/dia-de-muertos/'
  },

  'Navidad MX': {
    name:'Navidad MX',
    palette:{
      bg:'#0b0f12', text:'#f0fff4',
      panel1:'#0b0e12', panel2:'#0a0c10',
      ink1:'#f0fff4', ink2:'#bdecc7', muted:'#a3f3bd',
      primary:'#d23f3f', accent:'#1db954',
      ok:'#1db954', warn:'#ffd27f', danger:'#ff5757',
    },
    fonts:{
      importUrl:'https://fonts.googleapis.com/css2?family=Mountains+of+Christmas:wght@700&family=Inter:wght@400;600&display=swap',
      base:'Inter, system-ui, Arial', display:'"Mountains of Christmas", cursive'
    },
    bg:{
      image:{
        mobile:'images/bg-m.webp', tablet:'images/bg-t.webp', desktop:'images/bg-d.webp'
      },
      overlay:'rgba(0,0,0,.35)', size:'cover', position:'center', blur:0
    },
    images:{ hero:'images/hero.jpg', logo:'images/logo.svg' },
    icons:{ burger:'icons/burger.svg', fries:'icons/fries.svg', drink:'icons/drink.svg' },
    packBaseUrl:'/themes/navidad/'
  },

  '5 de Mayo': {
    name:'5 de Mayo',
    palette:{
      bg:'#0b0f12', text:'#eef7ee', panel1:'#0c1117', panel2:'#0c1015',
      ink1:'#eef7ee', ink2:'#cde9d1', muted:'#b7e3c0',
      primary:'#1fa64a', accent:'#e53935', ok:'#1fa64a', warn:'#ffcf6d', danger:'#e53935',
    },
    fonts:{ importUrl:'https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Inter:wght@400;600&display=swap',
      base:'Inter, system-ui, Arial', display:'"Alfa Slab One", cursive' },
    bg:{ image:'', overlay:'rgba(0,0,0,.30)', size:'cover', position:'center', blur:0 },
    images:{}, icons:{}, packBaseUrl:''
  },

  'San Valentín': {
    name:'San Valentín',
    palette:{
      bg:'#120b10', text:'#fff0f6', panel1:'#160d13', panel2:'#190f16',
      ink1:'#fff0f6', ink2:'#ffc7db', muted:'#ffb0cd',
      primary:'#ff4b88', accent:'#ffb3c7', ok:'#4cd6a7', warn:'#ffd27f', danger:'#ff5d7a',
    },
    fonts:{ importUrl:'https://fonts.googleapis.com/css2?family=Pacifico&family=Inter:wght@400;600&display=swap',
      base:'Inter, system-ui, Arial', display:'"Pacifico", cursive' },
    bg:{ image:'', overlay:'rgba(0,0,0,.35)', size:'cover', position:'center', blur:0 },
    images:{}, icons:{}, packBaseUrl:''
  },

  Halloween: {
    name:'Halloween',
    palette:{
      bg:'#09070c', text:'#ffe9cf',
      panel1:'#100c14', panel2:'#140f19',
      ink1:'#ffe9cf', ink2:'#ffd8a6', muted:'#ffcb85',
      primary:'#ff7a00', accent:'#7f5bff',
      ok:'#53e0a6', warn:'#ffc266', danger:'#ff6262',
    },
    fonts:{
      importUrl:'https://fonts.googleapis.com/css2?family=Butcherman&family=Nosifer&family=Inter:wght@400;600&display=swap',
      base:'Inter, system-ui, Arial',
      display:'"Butcherman","Nosifer",cursive'
    },
    bg:{ image:'', overlay:'rgba(0,0,0,.35)', size:'cover', position:'center', blur:0 },
    images:{ hero:'images/hero.jpg', logo:'images/logo.svg' },
    icons:{
      starter:   'icons/burgers/starter.png',
      koopa:     'icons/burgers/koopa.png',
      fatality:  'icons/burgers/fatality.png',
      mega:      'icons/burgers/mega.png',
      hadouken:  'icons/burgers/hadouken.png',
      nintendo:  'icons/burgers/nintendo.png',
      finalboss: 'icons/burgers/finalboss.png'
    },
    packBaseUrl:'/themes/halloween/'
  },

  'Reyes Magos': {
    name:'Reyes Magos',
    palette:{
      bg:'#0b0d16', text:'#f6f3ff', panel1:'#0c0f19', panel2:'#0d1020',
      ink1:'#f6f3ff', ink2:'#d7d0ff', muted:'#c9c1ff',
      primary:'#8e6cff', accent:'#f5c542', ok:'#4bd1a1', warn:'#ffd27f', danger:'#ff6565',
    },
    fonts:{ importUrl:'https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700&family=Inter:wght@400;600&display=swap',
      base:'Inter, system-ui, Arial', display:'"Cinzel Decorative", cursive' },
    bg:{ image:'', overlay:'rgba(0,0,0,.35)', size:'cover', position:'center', blur:0 },
    images:{}, icons:{}, packBaseUrl:''
  },

  'Año Nuevo': {
    name:'Año Nuevo',
    palette:{
      bg:'#0a0a0f', text:'#fefefe', panel1:'#0c0c12', panel2:'#101015',
      ink1:'#fefefe', ink2:'#dedede', muted:'#cfcfcf',
      primary:'#f2c230', accent:'#2dd4ff', ok:'#6fe3b2', warn:'#ffd27f', danger:'#ff6b6b',
    },
    fonts:{ importUrl:'https://fonts.googleapis.com/css2?family=Montserrat:wght@700&family=Inter:wght@400;600&display=swap',
      base:'Inter, system-ui, Arial', display:'"Montserrat", sans-serif' },
    bg:{ image:'', overlay:'rgba(0,0,0,.35)', size:'cover', position:'center', blur:0 },
    images:{}, icons:{}, packBaseUrl:''
  },

  'Día del Niño': {
    name:'Día del Niño',
    palette:{
      bg:'#0b0f14', text:'#e8f7ff', panel1:'#0c1118', panel2:'#0c1016',
      ink1:'#e8f7ff', ink2:'#bfe7ff', muted:'#a6ddff',
      primary:'#ffb703', accent:'#00c2ff', ok:'#3ee089', warn:'#ffd27f', danger:'#ff6b8b',
    },
    fonts:{ importUrl:'https://fonts.googleapis.com/css2?family=Baloo+2:wght@700&family=Inter:wght@400;600&display=swap',
      base:'Inter, system-ui, Arial', display:'"Baloo 2", cursive' },
    bg:{ image:'', overlay:'rgba(0,0,0,.25)', size:'cover', position:'center', blur:0 },
    images:{}, icons:{}, packBaseUrl:''
  },

  'Día de la Madre': {
    name:'Día de la Madre',
    palette:{
      bg:'#120d12', text:'#fff4fb', panel1:'#171017', panel2:'#1a121a',
      ink1:'#fff4fb', ink2:'#ffd1e8', muted:'#ffc0dc',
      primary:'#ff82b0', accent:'#ffa8d1', ok:'#5cd6a9', warn:'#ffd27f', danger:'#ff6b93',
    },
    fonts:{ importUrl:'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Inter:wght@400;600&display=swap',
      base:'Inter, system-ui, Arial', display:'"Dancing Script", cursive' },
    bg:{ image:'', overlay:'rgba(0,0,0,.30)', size:'cover', position:'center', blur:0 },
    images:{}, icons:{}, packBaseUrl:''
  },

  'Día del Padre': {
    name:'Día del Padre',
    palette:{
      bg:'#0a0f14', text:'#eaf3ff', panel1:'#0b0f15', panel2:'#0a0e12',
      ink1:'#eaf3ff', ink2:'#bed5f5', muted:'#a8c4ed',
      primary:'#2a7de1', accent:'#18c1a3', ok:'#41d19a', warn:'#ffd27f', danger:'#ff6b6b',
    },
    fonts:{ importUrl:'https://fonts.googleapis.com/css2?family=Rubik:wght@700&family=Inter:wght@400;600&display=swap',
      base:'Inter, system-ui, Arial', display:'"Rubik", sans-serif' },
    bg:{ image:'', overlay:'rgba(0,0,0,.30)', size:'cover', position:'center', blur:0 },
    images:{}, icons:{}, packBaseUrl:''
  },

  'Revolución Mexicana': {
    name:'Revolución Mexicana',
    palette:{
      bg:'#0e0c0a', text:'#fff5e9', panel1:'#130f0c', panel2:'#19130e',
      ink1:'#fff5e9', ink2:'#f3d9b5', muted:'#e8c89c',
      primary:'#b04a2e', accent:'#d89b33', ok:'#59d18c', warn:'#e9c36b', danger:'#e45e5e',
    },
    fonts:{ importUrl:'https://fonts.googleapis.com/css2?family=Alegreya+SC:wght@700&family=Inter:wght@400;600&display=swap',
      base:'Inter, system-ui, Arial', display:'"Alegreya SC", serif' },
    bg:{ image:'', overlay:'rgba(0,0,0,.35)', size:'cover', position:'center', blur:0 },
    images:{}, icons:{}, packBaseUrl:''
  },

  'Día de la Bandera': {
    name:'Día de la Bandera',
    palette:{
      bg:'#0b1012', text:'#eef7ee', panel1:'#0c1117', panel2:'#0d1116',
      ink1:'#eef7ee', ink2:'#cfe8d4', muted:'#bfe1c6',
      primary:'#126e3b', accent:'#bf2b2b', ok:'#2bb56a', warn:'#ffd27f', danger:'#e24a4a',
    },
    fonts:{ importUrl:'https://fonts.googleapis.com/css2?family=Bangers&family=Inter:wght@400;600&display=swap',
      base:'Inter, system-ui, Arial', display:'"Bangers", cursive' },
    bg:{ image:'', overlay:'rgba(0,0,0,.30)', size:'cover', position:'center', blur:0 },
    images:{}, icons:{}, packBaseUrl:''
  },

  // Extras
  'Fútbol': {
    name:'Fútbol',
    palette:{
      bg:'#0a120b', text:'#f5fff5',
      panel1:'#0b0f0c', panel2:'#0c110d',
      ink1:'#f5fff5', ink2:'#cbeed0', muted:'#a9d9b0',
      primary:'#2ecc71', accent:'#1e90ff', ok:'#2ecc71', warn:'#ffd27f', danger:'#ff5d5d',
    },
    fonts:{
      importUrl:'https://fonts.googleapis.com/css2?family=Jersey+25&family=Jersey+25+Charted&family=Inter:wght@400;600&display=swap',
      base:'Inter, system-ui, Arial',
      display:'"Jersey 25","Jersey 25 Charted",sans-serif'
    },
    bg:{ image:'', overlay:'rgba(0,0,0,.25)', size:'cover', position:'center', blur:0 },
    images:{}, icons:{}, packBaseUrl:''
  },

  'Lucha Libre': {
    name:'Lucha Libre',
    palette:{
      bg:'#0d0a12', text:'#fff5f5', panel1:'#120e18', panel2:'#16111d',
      ink1:'#fff5f5', ink2:'#ffd0d0', muted:'#ffb3b3',
      primary:'#ff3b3b', accent:'#ffd24a', ok:'#4bd1a1', warn:'#ffd27f', danger:'#ff6262',
    },
    fonts:{
      importUrl:'https://fonts.googleapis.com/css2?family=Sigmar+One&family=Bangers&family=Inter:wght@400;600&display=swap',
      base:'Inter, system-ui, Arial',
      display:'"Sigmar One","Bangers",cursive'
    },
    bg:{ image:'', overlay:'rgba(0,0,0,.25)', size:'cover', position:'center', blur:0 },
    images:{}, icons:{}, packBaseUrl:''
  },

  'Pixel Art': {
    name:'Pixel Art',
    palette:{
      bg:'#000000', text:'#e8f0ff',
      panel1:'#0b0e12', panel2:'#0b0d15',
      ink1:'#e8f0ff', ink2:'#a6b2c7', muted:'#94a3b8',
      primary:'#00e0ff', accent:'#ff4bd8', ok:'#00c27a', warn:'#ffd27f', danger:'#ff5d5d',
    },
    fonts:{
      importUrl:'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Inter:wght@400;600&display=swap',
      base:'Inter, system-ui, Arial',
      display:'"Press Start 2P", monospace'
    },
    bg:{ image:'', overlay:'rgba(0,0,0,.20)', size:'cover', position:'center', blur:0 },
    images:{}, icons:{}, packBaseUrl:''
  },

  'Retro Arcade': {
    name:'Retro Arcade',
    palette:{
      bg:'#0a0a12', text:'#f4f1ff',
      panel1:'#0e0c18', panel2:'#120f1f',
      ink1:'#f4f1ff', ink2:'#d5ccff', muted:'#c1b7ff',
      primary:'#7f5bff', accent:'#ffda3a', ok:'#53e0a6', warn:'#ffd27f', danger:'#ff6b6b',
    },
    fonts:{
      importUrl:'https://fonts.googleapis.com/css2?family=Monoton&family=Bungee+Shade&family=Inter:wght@400;600&display=swap',
      base:'Inter, system-ui, Arial',
      display:'"Monoton","Bungee Shade",cursive'
    },
    bg:{ image:'', overlay:'rgba(0,0,0,.25)', size:'cover', position:'center', blur:0 },
    images:{}, icons:{}, packBaseUrl:''
  },

  'Y2K (90s/00s)': {
    name:'Y2K (90s/00s)',
    palette:{
      bg:'#0b0a10', text:'#f2f8ff',
      panel1:'#0f0d15', panel2:'#120f1a',
      ink1:'#f2f8ff', ink2:'#cde3ff', muted:'#b7d6ff',
      primary:'#ff66ff', accent:'#66ffff', ok:'#4bd1a1', warn:'#ffd27f', danger:'#ff6b9b',
    },
    fonts:{
      importUrl:'https://fonts.googleapis.com/css2?family=Rubik+Glitch&family=Rubik+Glitch+Pop&family=Inter:wght@400;600&display=swap',
      base:'Inter, system-ui, Arial',
      display:'"Rubik Glitch","Rubik Glitch Pop",sans-serif'
    },
    bg:{ image:'', overlay:'rgba(0,0,0,.20)', size:'cover', position:'center', blur:0 },
    images:{}, icons:{}, packBaseUrl:''
  },

  'Fiestas': {
    name:'Fiestas',
    palette:{
      bg:'#0b0f14', text:'#fff7ff', panel1:'#0b0e12', panel2:'#0b0d15',
      ink1:'#fff7ff', ink2:'#ffd6ff', muted:'#f0c8ff',
      primary:'#ff66ff', accent:'#27e1ff', ok:'#53e0a6', warn:'#ffd27f', danger:'#ff5d7a',
    },
    fonts:{ importUrl:'https://fonts.googleapis.com/css2?family=Bungee&family=Inter:wght@400;600&display=swap',
      base:'Inter, system-ui, Arial', display:'"Bungee", cursive' },
    bg:{ image:'', overlay:'rgba(0,0,0,.20)', size:'cover', position:'center', blur:0 },
    images:{}, icons:{}, packBaseUrl:''
  },
};

/* -------------------- Estado en memoria -------------------- */
const CUSTOM = Object.create(null);
let _unsubTheme = null;
let _unsubPresets = null;

/* Precarga de presets desde localStorage */
try {
  const raw = localStorage.getItem('theme_presets');
  if (raw) {
    const map = JSON.parse(raw);
    if (map && typeof map === 'object') Object.assign(CUSTOM, map);
  }
} catch {}

/* -------------------- Utilidades -------------------- */
const NAME_ALIASES = {
  'navidad': 'Navidad MX',
  'navidad mx': 'Navidad MX',
  'y2k': 'Y2K (90s/00s)',
  'dia de muertos': 'Día de Muertos',
  'día de muertos': 'Día de Muertos',
  'dia del nino': 'Día del Niño',
  'día del niño': 'Día del Niño',
  'dia de la bandera': 'Día de la Bandera',
  'día de la bandera': 'Día de la Bandera',
  'reyes': 'Reyes Magos',
  'futbol': 'Fútbol',
  'fútbol': 'Fútbol',
  'fiestas': 'Fiestas',
};

export const slug = (s = '') =>
  String(s).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'custom';

const norm = (s='') =>
  String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

function getPresetByName(name) {
  if (!name) return null;
  const n = norm(name).trim();
  const ali = NAME_ALIASES[n];
  if (ali && THEMES_BUILTIN[ali]) return THEMES_BUILTIN[ali];
  if (THEMES_BUILTIN[name]) return THEMES_BUILTIN[name];
  for (const t of Object.values(THEMES_BUILTIN)) {
    if (t?.name && norm(t.name) === n) return t;
  }
  for (const p of Object.values(CUSTOM)) {
    if (p?.name && norm(p.name) === n) return p;
  }
  return null;
}

function ensureFontImport(importUrl) {
  const id = 'theme-font-link';
  let link = document.getElementById(id);
  if (!importUrl) { if (link) link.remove(); return; }
  if (!link) {
    link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  if (link.href !== importUrl) link.href = importUrl;
}

/* --------- Utilidades de assets por tema --------- */
// Resolver ROBUSTO: acepta base absoluta (/themes/...), relativa (./themes/...) o ../
function resolveAssetUrl(url = '', base = '') {
  if (!url) return '';
  try {
    if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url;

    // Normaliza base: si no inicia con '/', resuélvela relativo a la URL actual
    let baseAbs = base;
    if (baseAbs && !baseAbs.startsWith('/')) {
      baseAbs = new URL(baseAbs, window.location.href).pathname;
    }
    if (baseAbs && !baseAbs.endsWith('/')) baseAbs += '/';

    return baseAbs
      ? new URL(url, window.location.origin + baseAbs).toString()
      : url;
  } catch {
    return url;
  }
}

function preloadImages(urls = []) {
  urls.forEach((u) => {
    if (!u) return;
    const img = new Image();
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.src = u;
  });
}

/* --------- Background responsive --------- */
let _bgResizeT = null;
function onResizeDebounced(fn, ms=200){
  clearTimeout(_bgResizeT);
  _bgResizeT = setTimeout(fn, ms);
}

function pickBgUrl(image, base=''){
  const w = Math.max(320, Math.min(4096, (window.innerWidth || 1280)));
  let src = '';
  if (!image) return '';
  if (typeof image === 'string') {
    src = image;
  } else if (image && typeof image === 'object') {
    if (w <= 640)      src = image.mobile  || image.tablet || image.desktop || image.default || '';
    else if (w <= 1200)src = image.tablet  || image.desktop|| image.mobile  || image.default || '';
    else               src = image.desktop || image.tablet || image.mobile  || image.default || '';
  }
  return resolveAssetUrl(src, base);
}

function applyBackground(bg = {}) {
  const body = document.body;
  if (!body) return;

  const base = (window.__lastThemePreset?.packBaseUrl) || bg.packBaseUrl || '';
  const chosen = pickBgUrl(bg.image, base);
  const overlay = bg.overlay ? `linear-gradient(${bg.overlay}, ${bg.overlay})` : '';
  const parts = [overlay, chosen ? `url("${chosen}")` : ''].filter(Boolean).join(', ');

  if (parts) {
    body.style.backgroundImage = parts;
    body.style.backgroundSize = bg.size || 'cover';
    body.style.backgroundPosition = bg.position || 'center';
    body.style.backgroundRepeat = 'no-repeat';
    body.style.backgroundAttachment = 'scroll';
  } else {
    body.style.backgroundImage = 'none';
  }

  if (chosen) preloadImages([ chosen ]);

  if (!window.__bgResizeBound){
    window.__bgResizeBound = true;
    window.addEventListener('resize', ()=> onResizeDebounced(()=>applyBackground(bg), 160), { passive:true });
    window.addEventListener('orientationchange', ()=> onResizeDebounced(()=>applyBackground(bg), 160), { passive:true });
  }
}

function applyThemeAssets(preset = {}) {
  const base = preset.packBaseUrl || '';
  const images = preset.images || {};
  const icons  = preset.icons  || {};

  const preloadList = [
    ...Object.values(images).map((u) => resolveAssetUrl(u, base)),
    ...Object.values(icons ).map((u) => resolveAssetUrl(u, base)),
  ];
  preloadImages(preloadList);

  document.querySelectorAll('[data-theme-image]').forEach((el) => {
    const key = el.getAttribute('data-theme-image');
    const url = resolveAssetUrl(images[key], base);
    if (url) el.setAttribute('src', url);
  });

  document.querySelectorAll('[data-theme-icon]').forEach((el) => {
    const key = el.getAttribute('data-theme-icon');
    const url = resolveAssetUrl(icons[key], base);
    if (!url) return;
    if (el.tagName === 'SOURCE') el.setAttribute('srcset', url);
    else el.setAttribute('src', url);
  });

  document.querySelectorAll('[data-theme-bg]').forEach((el) => {
    const key = el.getAttribute('data-theme-bg');
    const url = resolveAssetUrl(images[key] || icons[key], base);
    if (url) el.style.backgroundImage = `url("${url}")`;
  });

  const root = document.documentElement;
  Object.entries(images).forEach(([k, v]) => {
    root.style.setProperty(`--theme-image-${k}`, `url("${resolveAssetUrl(v, base)}")`);
  });
  Object.entries(icons).forEach(([k, v]) => {
    root.style.setProperty(`--theme-icon-${k}`, `url("${resolveAssetUrl(v, base)}")`);
  });
}

function setMetaThemeColor(color) {
  try {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', color || '#0b0f14');
  } catch {}
}

/* -------------------- API pública -------------------- */
export function applyThemeLocal(nameOrPreset, presetObj = null) {
  const preset = presetObj || (typeof nameOrPreset === 'string'
    ? getPresetByName(nameOrPreset)
    : nameOrPreset) || THEMES_BUILTIN.Base;

  // Guardamos preset activo para resolver correctamente assets responsivos
  window.__lastThemePreset = preset;

  const pal   = preset.palette || {};
  const fonts = preset.fonts   || {};
  const root  = document.documentElement;

  const vars = {
    '--bg': pal.bg, '--text': pal.text,
    '--panel1': pal.panel1 || '#0b0e12', '--panel2': pal.panel2 || '#0b0d15',
    '--ink1': pal.ink1 || pal.text || '#fff', '--ink2': pal.ink2 || '#b9c3d1',
    '--muted': pal.muted || '#94a3b8',
    '--primary': pal.primary || '#ffc242', '--accent': pal.accent || '#27e1ff',
    '--ok': pal.ok || '#00c27a', '--warn': pal.warn || '#ffd27f', '--danger': pal.danger || '#ff5d5d',
    '--font-base': fonts.base || 'Inter, system-ui, Arial',
    '--font-display': fonts.display || 'inherit',
    '--color-bg': pal.bg, '--color-text': pal.text,
    '--color-primary': pal.primary || '#ffc242',
    '--color-accent': pal.accent || '#27e1ff',
  };
  for (const [k, v] of Object.entries(vars)) {
    if (v != null && v !== '') root.style.setProperty(k, v);
  }

  ensureFontImport(fonts.importUrl || '');
  applyBackground(preset.bg || {});
  try {
    document.body.style.backgroundColor = pal.bg || '#0b0f14';
    document.body.style.color = pal.text || '#e8f0ff';
  } catch {}
  setMetaThemeColor(pal.bg);

  const name = preset.name || (typeof nameOrPreset === 'string' ? nameOrPreset : 'Custom');
  const sname = slug(name);
  root.setAttribute('data-theme', sname);
  root.setAttribute('data-theme-name', name);
  try { document.body.setAttribute('data-theme', sname); } catch {}
  try { document.body.setAttribute('data-theme-name', name); } catch {}

  // Aplica packs (images/icons)
  applyThemeAssets(preset);

  try { console.info('[theme] aplicado:', name, preset); } catch {}
  return preset;
}

export function initThemeFromSettings({ defaultName = 'Base' } = {}) {
  try { _unsubTheme?.(); } catch {}
  const ref = doc(db, 'settings', 'theme');
  _unsubTheme = onSnapshot(
    ref,
    (snap) => {
      const data = snap.exists() ? snap.data() : null;
      const name = data?.name || defaultName;
      applyThemeLocal(name);
    },
    () => applyThemeLocal(defaultName)
  );
  return _unsubTheme;
}

export function listThemes() {
  const builtins = Object.keys(THEMES_BUILTIN);
  const customs  = Object.values(CUSTOM).map(p => p?.name).filter(Boolean);
  const all = Array.from(new Set([...builtins, ...customs]));
  return all.sort((a,b)=> String(a).localeCompare(String(b), 'es'));
}

export function subscribeThemePresets(cb) {
  try {
    const raw = localStorage.getItem('theme_presets');
    if (raw) {
      const map = JSON.parse(raw);
      Object.assign(CUSTOM, map);
      cb?.(Object.values(CUSTOM).map((p) => p.name));
    }
  } catch {}

  try { _unsubPresets?.(); } catch {}
  const ref = doc(db, 'settings', 'theme_presets');
  _unsubPresets = onSnapshot(
    ref,
    (snap) => {
      const data = snap.exists() ? snap.data() : {};
      const presets = data?.presets || {};
      Object.keys(CUSTOM).forEach((k) => delete CUSTOM[k]);
      for (const [k, v] of Object.entries(presets)) {
        if (v && v.name) CUSTOM[k] = v;
      }
      try { localStorage.setItem('theme_presets', JSON.stringify(CUSTOM)); } catch {}
      cb?.(Object.values(CUSTOM).map((p) => p.name));
    },
    () => cb?.(Object.values(CUSTOM).map((p) => p.name))
  );
  return _unsubPresets;
}

export async function saveThemePreset(preset) {
  const p = {
    name: String(preset?.name || 'Custom'),
    palette: preset?.palette || {},
    fonts: preset?.fonts || {},
    bg: preset?.bg || {},
    images: Array.isArray(preset?.images) ? preset.images : (preset?.images || {}),
    icons: Array.isArray(preset?.icons) ? {} : (preset?.icons || {}),
    packBaseUrl: preset?.packBaseUrl || '',
  };
  const key = slug(p.name);
  CUSTOM[key] = p;
  try { localStorage.setItem('theme_presets', JSON.stringify(CUSTOM)); } catch {}

  const ref = doc(db, 'settings', 'theme_presets');
  let existing = {};
  try {
    const s = await getDoc(ref);
    existing = (s.exists() && s.data()?.presets) || {};
  } catch {}
  const next = { presets: { ...existing, [key]: p } };
  await setDoc(ref, next, { merge: true });
  return { ok: true, key, name: p.name };
}

/* -------------------- Auto-init + helpers -------------------- */

function detectRequestedTheme() {
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get('theme') || '';
    const h = (url.hash.match(/theme=([^&]+)/i) || [,''])[1];
    const cand = q || h;
    if (cand) return cand;
    const S_KEYS = ['theme_local','theme','selectedTheme'];
    for (const k of S_KEYS) {
      const s = sessionStorage.getItem(k) || localStorage.getItem(k);
      if (s) return s;
    }
  } catch {}
  return null;
}

function validateThemeAssets(preset) {
  const base = preset.packBaseUrl || '';
  const images = preset.images || {};
  const icons  = preset.icons  || {};
  const missing = [];
  Object.entries(images).forEach(([k,v]) => { if (!v) missing.push(`images.${k}`); });
  Object.entries(icons).forEach(([k,v]) => { if (!v) missing.push(`icons.${k}`); });
  if (missing.length) {
    console.warn('[theme] faltan rutas en preset', preset.name, missing);
  }
  const resolved = {
    images: Object.fromEntries(Object.entries(images).map(([k,v])=>[k, resolveAssetUrl(v, base)])),
    icons : Object.fromEntries(Object.entries(icons ).map(([k,v])=>[k, resolveAssetUrl(v, base)])),
  };
  console.debug('[theme] assets resueltos', preset.name, resolved);
}

if (typeof window !== 'undefined') {
  window.applyThemeLocal = (nameOrPreset, presetObj=null) => {
    const p = applyThemeLocal(nameOrPreset, presetObj);
    validateThemeAssets(p);
    return p;
  };
  window.ThemeAPI = { applyThemeLocal, initThemeFromSettings, listThemes, subscribeThemePresets, saveThemePreset };

  const __initial = detectRequestedTheme();
  if (__initial) {
    try { window.applyThemeLocal(__initial); } catch (e) { console.warn('[theme] auto-init falló', e); }
  }
}

export default THEMES_BUILTIN;
