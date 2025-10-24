// /shared/theme.js
// Temas para Kiosko/UI: presets integrados + presets guardados + packs de imágenes/iconos.

import { db, doc, getDoc, setDoc, onSnapshot, serverTimestamp } from './firebase.js';

/* ------------ Prefijo de despliegue (GitHub Pages / subcarpetas) ------------ */
// Queremos que los assets queden en /prueba/themes/... (primer segmento del path)
const BASE_PREFIX = (() => {
  try {
    const parts = location.pathname.split('/').filter(Boolean);
    const first = parts[0];              // "prueba" en /prueba/v2/kiosk/...
    return first ? `/${first}/` : '/';   // => "/prueba/"
  } catch { return '/'; }
})();

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

  /* ====== Halloween (apunta a /prueba/themes/halloween/) ====== */
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
      importUrl:'https://fonts.googleapis.com/css2?family=Special+Elite&family=Inter:wght@400;600&display=swap',
      base:'Inter, system-ui, Arial',
      display:'"Special Elite", cursive'
    },
    bg:{
      image:{
        mobile:'images/bg-m.webp',
        tablet:'images/hero.jpg',
        desktop:'images/hero.jpg'
      },
      overlay:'rgba(0,0,0,.35)',
      size:'cover',
      position:'center',
      blur:0
    },
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
    packBaseUrl:`${BASE_PREFIX}themes/halloween/`
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
function resolveAssetUrl(url = '', base = '') {
  if (!url) return '';
  try {
    if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/')) {
      return url; // absoluta o especial
    }
    if (base && base.startsWith('/')) {
      const b = base.replace(/\/+$/, '');
      const u = url.replace(/^\/+/, '');
      return `${b}/${u}`;
    }
    const baseAbs = new URL(base || '', window.location.origin + '/').toString();
    return new URL(url, baseAbs).toString();
  } catch { return url; }
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

// Alias de compatibilidad para módulos antiguos
export async function setTheme(name) {
  try {
    const preset = applyThemeLocal(name);
    if (db) {
      const ref = doc(db, 'settings', 'theme');
      await setDoc(ref, { name, updatedAt: serverTimestamp() }, { merge: true });
    }
    console.info('[theme] setTheme aplicado:', name);
    return preset;
  } catch (e) {
    console.error('[theme] Error en setTheme:', e);
    return null;
  }
}

// Diagnóstico adicional
window.addEventListener('error', e => {
  console.error('[theme-error]', e.message, e.filename, e.lineno);
});
window.addEventListener('unhandledrejection', e => {
  console.error('[theme-promise]', e.reason);
});
console.info('[theme] BASE_PREFIX =', BASE_PREFIX);

export default THEMES_BUILTIN;
