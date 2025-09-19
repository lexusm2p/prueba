// /shared/theme.js
// Temas para Kiosko/UI: presets integrados + presets guardados.
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
      bg: '#0b0f14', text: '#e8f0ff',
      panel1: '#0b0e12', panel2: '#0b0d15',
      ink1: '#e8f0ff', ink2: '#a6b2c7', muted: '#94a3b8',
      primary: '#ffc242', accent: '#27e1ff',
      ok: '#00c27a', warn: '#ffd27f', danger: '#ff5d5d',
    },
    fonts: { importUrl: '', base: 'Inter, system-ui, Arial', display: 'inherit' },
    bg: { image: '', overlay: 'rgba(0,0,0,0)', size: 'cover', position: 'center', blur: 0 },
    images: [],
  },

  /* ==== (los mismos presets que ya tenías) ==== */
  Independencia: { /* ...igual que tu versión... */ },
  'Día de Muertos': { /* ... */ },
  'Navidad MX': { /* ... */ },
  '5 de Mayo': { /* ... */ },
  'San Valentín': { /* ... */ },
  Halloween: { /* ... */ },
  'Reyes Magos': { /* ... */ },
  'Año Nuevo': { /* ... */ },
  'Día del Niño': { /* ... */ },
  'Día de la Madre': { /* ... */ },
  'Día del Padre': { /* ... */ },
  'Revolución Mexicana': { /* ... */ },
  'Día de la Bandera': { /* ... */ },

  // Extras
  'Fútbol': { name: 'Fútbol', palette: {
      bg:'#0a120b', text:'#eaffea', panel1:'#0b0f0c', panel2:'#0c110d',
      ink1:'#eaffea', ink2:'#c6ebc6', muted:'#a9d9b0',
      primary:'#2ecc71', accent:'#1e90ff', ok:'#2ecc71', warn:'#ffd27f', danger:'#ff5d5d',
    }, fonts:{ importUrl:'', base:'Inter, system-ui, Arial', display:'inherit' },
    bg:{ image:'', overlay:'rgba(0,0,0,.25)', size:'cover', position:'center', blur:0 }, images:[] },
  'Lucha Libre': { name:'Lucha Libre', palette:{
      bg:'#0d0a12', text:'#fff5f5', panel1:'#120e18', panel2:'#16111d',
      ink1:'#fff5f5', ink2:'#ffd0d0', muted:'#ffb3b3',
      primary:'#ff3b3b', accent:'#ffd24a', ok:'#4bd1a1', warn:'#ffd27f', danger:'#ff6262',
    }, fonts:{ importUrl:'', base:'Inter, system-ui, Arial', display:'inherit' },
    bg:{ image:'', overlay:'rgba(0,0,0,.25)', size:'cover', position:'center', blur:0 }, images:[] },
  'Pixel Art': { name:'Pixel Art', palette:{
      bg:'#0b0f14', text:'#e8f0ff', panel1:'#0b0e12', panel2:'#0b0d15',
      ink1:'#e8f0ff', ink2:'#a6b2c7', muted:'#94a3b8',
      primary:'#00e0ff', accent:'#ff4bd8', ok:'#00c27a', warn:'#ffd27f', danger:'#ff5d5d',
    }, fonts:{ importUrl:'', base:'Inter, system-ui, Arial', display:'"Press Start 2P", monospace' },
    bg:{ image:'', overlay:'rgba(0,0,0,.20)', size:'cover', position:'center', blur:0 }, images:[] },
  'Retro Arcade': { name:'Retro Arcade', palette:{
      bg:'#0a0a12', text:'#f4f1ff', panel1:'#0e0c18', panel2:'#120f1f',
      ink1:'#f4f1ff', ink2:'#d5ccff', muted:'#c1b7ff',
      primary:'#7f5bff', accent:'#ffda3a', ok:'#53e0a6', warn:'#ffd27f', danger:'#ff6b6b',
    }, fonts:{ importUrl:'', base:'Inter, system-ui, Arial', display:'"Montserrat", sans-serif' },
    bg:{ image:'', overlay:'rgba(0,0,0,.25)', size:'cover', position:'center', blur:0 }, images:[] },
  'Y2K (90s/00s)': { name:'Y2K (90s/00s)', palette:{
      bg:'#0b0a10', text:'#f2f8ff', panel1:'#0f0d15', panel2:'#120f1a',
      ink1:'#f2f8ff', ink2:'#cde3ff', muted:'#b7d6ff',
      primary:'#ff66ff', accent:'#66ffff', ok:'#4bd1a1', warn:'#ffd27f', danger:'#ff6b9b',
    }, fonts:{ importUrl:'', base:'Inter, system-ui, Arial', display:'inherit' },
    bg:{ image:'', overlay:'rgba(0,0,0,.20)', size:'cover', position:'center', blur:0 }, images:[] },
  'Fiestas': { name:'Fiestas', palette:{
      bg:'#0b0f14', text:'#fff7ff', panel1:'#0b0e12', panel2:'#0b0d15',
      ink1:'#fff7ff', ink2:'#ffd6ff', muted:'#f0c8ff',
      primary:'#ff66ff', accent:'#27e1ff', ok:'#53e0a6', warn:'#ffd27f', danger:'#ff5d7a',
    }, fonts:{ importUrl:'', base:'Inter, system-ui, Arial', display:'inherit' },
    bg:{ image:'', overlay:'rgba(0,0,0,.20)', size:'cover', position:'center', blur:0 }, images:[] },
};

/* -------------------- Estado en memoria -------------------- */
const CUSTOM = Object.create(null);
let _unsubTheme = null;
let _unsubPresets = null;

/* Precarga de presets desde localStorage (sin esperar a Firestore) */
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
  'dia del nino': 'Día del Niño',
  'dia de la bandera': 'Día de la Bandera',
  'reyes': 'Reyes Magos',
  'futbol': 'Fútbol',
  'fiestas': 'Fiestas',
};

const slug = (s = '') =>
  String(s).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'custom';

const norm = (s='') =>
  String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

function getPresetByName(name) {
  if (!name) return null;

  // alias
  const n = norm(name).trim();
  const ali = NAME_ALIASES[n];
  if (ali && THEMES_BUILTIN[ali]) return THEMES_BUILTIN[ali];

  // clave literal
  if (THEMES_BUILTIN[name]) return THEMES_BUILTIN[name];

  // por display name sin acentos
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

function applyBackground(bg = {}) {
  const body = document.body;
  if (!body) return;
  const img = bg.image ? `url("${bg.image}")` : '';
  const overlay = bg.overlay ? `linear-gradient(${bg.overlay}, ${bg.overlay})` : '';
  const parts = [overlay, img].filter(Boolean).join(', ');
  if (parts) {
    body.style.backgroundImage = parts;
    body.style.backgroundSize = bg.size || 'cover';
    body.style.backgroundPosition = bg.position || 'center';
    body.style.backgroundRepeat = 'no-repeat';
    body.style.backgroundAttachment = 'scroll';
  } else {
    body.style.backgroundImage = 'none';
  }
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
    // aliases para compat
    '--color-bg': pal.bg,
    '--color-text': pal.text,
    '--color-primary': pal.primary || '#ffc242',
    '--color-accent': pal.accent || '#27e1ff',
  };

  for (const [k, v] of Object.entries(vars)) {
    if (v != null && v !== '') root.style.setProperty(k, v);
  }

  // fuentes + fondo
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

  // Debug útil en consola
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
    images: Array.isArray(preset?.images) ? preset.images : [],
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

/* -------------------- Auto-init y globals (clave para que funcione en tu Admin) -------------------- */

// Detecta un tema solicitado por URL o storage
function detectRequestedTheme() {
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get('theme') || '';
    const h = (url.hash.match(/theme=([^&]+)/i) || [,''])[1];
    const cand = q || h;
    if (cand) return cand;

    // session/local storage
    const S_KEYS = ['theme_local','theme','selectedTheme'];
    for (const k of S_KEYS) {
      const s = sessionStorage.getItem(k) || localStorage.getItem(k);
      if (s) return s;
    }
  } catch {}
  return null;
}

// Expone API global para que tus botones puedan usarla sin import
if (typeof window !== 'undefined') {
  window.applyThemeLocal = applyThemeLocal;
  window.ThemeAPI = {
    applyThemeLocal,
    initThemeFromSettings,
    listThemes,
    subscribeThemePresets,
    saveThemePreset,
  };

  // Aplica automáticamente si hay un tema solicitado por URL/storage
  const __initial = detectRequestedTheme();
  if (__initial) {
    try { applyThemeLocal(__initial); } catch (e) { console.warn('[theme] auto-init falló', e); }
  }
}
