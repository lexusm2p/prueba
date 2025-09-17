// /shared/theme.js
// Temas para Kiosko/UI: presets integrados + presets guardados.
// - applyThemeLocal(nameOrPreset[, presetObj])
// - initThemeFromSettings({ defaultName })
// - listThemes() -> nombres integrados
// - subscribeThemePresets(cb) -> nombres personalizados (Firestore/local)
// - saveThemePreset(preset) -> guarda preset personalizado

import { db, doc, getDoc, setDoc, onSnapshot } from './firebase.js';

/* -------------------- Presets integrados -------------------- */
const THEMES_BUILTIN = {
  Base: {
    name: 'Base',
    palette: {
      bg: '#0b0f14',
      text: '#e8f0ff',
      panel1: '#0b0e12',
      panel2: '#0b0d15',
      ink1: '#e8f0ff',
      ink2: '#a6b2c7',
      muted: '#94a3b8',
      primary: '#ffc242',
      accent: '#27e1ff',
      ok: '#00c27a',
      warn: '#ffd27f',
      danger: '#ff5d5d',
    },
    fonts: { importUrl: '', base: 'Inter, system-ui, Arial', display: 'inherit' },
    bg: { image: '', overlay: 'rgba(0,0,0,0)', size: 'cover', position: 'center', blur: 0 },
    images: [],
  },

  Independencia: {
    name: 'Independencia',
    palette: {
      bg: '#0b0f1a', text: '#e8ffe6', panel1: '#0b0e12', panel2: '#0b0d15',
      ink1: '#e8ffe6', ink2: '#bdebc0', muted: '#a7ffc0',
      primary: '#2ecc71', accent: '#ff3b3b', ok: '#2ecc71', warn: '#ffd27f', danger: '#ff4d4d',
    },
    fonts: {
      importUrl: 'https://fonts.googleapis.com/css2?family=Bangers&family=Inter:wght@400;600&display=swap',
      base: 'Inter, system-ui, Arial', display: '"Bangers", cursive'
    },
    bg: {
      image: 'https://images.unsplash.com/photo-1526318472351-c75fcf070305?q=80&w=1600&auto=format&fit=crop',
      overlay: 'rgba(0,0,0,.35)', size: 'cover', position: 'center', blur: 0
    },
    images: [],
  },

  'Día de Muertos': {
    name: 'Día de Muertos',
    palette: {
      bg: '#0b0a12', text: '#ffeefb', panel1: '#0e0b16', panel2: '#120f1d',
      ink1: '#ffeefb', ink2: '#f9b9ff', muted: '#ffb4e6',
      primary: '#ff7ab6', accent: '#ffa800', ok: '#60e0a0', warn: '#ffc266', danger: '#ff6b6b',
    },
    fonts: {
      importUrl: 'https://fonts.googleapis.com/css2?family=Creepster&family=Inter:wght@400;600&display=swap',
      base: 'Inter, system-ui, Arial', display: '"Creepster", cursive'
    },
    bg: {
      image: 'https://images.unsplash.com/photo-1573067485645-b3e98f5a56b3?q=80&w=1600&auto=format&fit=crop',
      overlay: 'rgba(0,0,0,.35)', size: 'cover', position: 'center', blur: 0
    },
    images: [],
  },

  'Navidad MX': {
    name: 'Navidad MX',
    palette: {
      bg: '#0b0f12', text: '#f0fff4', panel1: '#0b0e12', panel2: '#0a0c10',
      ink1: '#f0fff4', ink2: '#bdecc7', muted: '#a3f3bd',
      primary: '#d23f3f', accent: '#1db954', ok: '#1db954', warn: '#ffd27f', danger: '#ff5757',
    },
    fonts: {
      importUrl: 'https://fonts.googleapis.com/css2?family=Mountains+of+Christmas:wght@700&family=Inter:wght@400;600&display=swap',
      base: 'Inter, system-ui, Arial', display: '"Mountains of Christmas", cursive'
    },
    bg: {
      image: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?q=80&w=1600&auto=format&fit=crop',
      overlay: 'rgba(0,0,0,.35)', size: 'cover', position: 'center', blur: 0
    },
    images: [],
  },

  '5 de Mayo': {
    name: '5 de Mayo',
    palette: {
      bg: '#0b0f12', text: '#eef7ee', panel1: '#0c1117', panel2: '#0c1015',
      ink1: '#eef7ee', ink2: '#cde9d1', muted: '#b7e3c0',
      primary: '#1fa64a', accent: '#e53935', ok: '#1fa64a', warn: '#ffcf6d', danger: '#e53935',
    },
    fonts: {
      importUrl: 'https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Inter:wght@400;600&display=swap',
      base: 'Inter, system-ui, Arial', display: '"Alfa Slab One", cursive'
    },
    bg: {
      image: 'https://images.unsplash.com/photo-1583795128727-6ec3642408f8?q=80&w=1600&auto=format&fit=crop',
      overlay: 'rgba(0,0,0,.30)', size: 'cover', position: 'center', blur: 0
    },
    images: [],
  },

  'San Valentín': {
    name: 'San Valentín',
    palette: {
      bg: '#120b10', text: '#fff0f6', panel1: '#160d13', panel2: '#190f16',
      ink1: '#fff0f6', ink2: '#ffc7db', muted: '#ffb0cd',
      primary: '#ff4b88', accent: '#ffb3c7', ok: '#4cd6a7', warn: '#ffd27f', danger: '#ff5d7a',
    },
    fonts: {
      importUrl: 'https://fonts.googleapis.com/css2?family=Pacifico&family=Inter:wght@400;600&display=swap',
      base: 'Inter, system-ui, Arial', display: '"Pacifico", cursive'
    },
    bg: {
      image: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?q=80&w=1600&auto=format&fit=crop',
      overlay: 'rgba(0,0,0,.35)', size: 'cover', position: 'center', blur: 0
    },
    images: [],
  },

  Halloween: {
    name: 'Halloween',
    palette: {
      bg: '#0b0a10', text: '#fff3e0', panel1: '#100c14', panel2: '#140f19',
      ink1: '#fff3e0', ink2: '#ffd8a6', muted: '#ffcb85',
      primary: '#ff7a00', accent: '#7f5bff', ok: '#53e0a6', warn: '#ffc266', danger: '#ff6262',
    },
    fonts: {
      importUrl: 'https://fonts.googleapis.com/css2?family=Nosifer&family=Inter:wght@400;600&display=swap',
      base: 'Inter, system-ui, Arial', display: '"Nosifer", cursive'
    },
    bg: {
      image: 'https://images.unsplash.com/photo-1507919909716-c8262e491cde?q=80&w=1600&auto=format&fit=crop',
      overlay: 'rgba(0,0,0,.35)', size: 'cover', position: 'center', blur: 0
    },
    images: [],
  },

  'Reyes Magos': {
    name: 'Reyes Magos',
    palette: {
      bg: '#0b0d16', text: '#f6f3ff', panel1: '#0c0f19', panel2: '#0d1020',
      ink1: '#f6f3ff', ink2: '#d7d0ff', muted: '#c9c1ff',
      primary: '#8e6cff', accent: '#f5c542', ok: '#4bd1a1', warn: '#ffd27f', danger: '#ff6565',
    },
    fonts: {
      importUrl: 'https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700&family=Inter:wght@400;600&display=swap',
      base: 'Inter, system-ui, Arial', display: '"Cinzel Decorative", cursive'
    },
    bg: {
      image: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=1600&auto=format&fit=crop',
      overlay: 'rgba(0,0,0,.35)', size: 'cover', position: 'center', blur: 0
    },
    images: [],
  },

  'Año Nuevo': {
    name: 'Año Nuevo',
    palette: {
      bg: '#0a0a0f', text: '#fefefe', panel1: '#0c0c12', panel2: '#101015',
      ink1: '#fefefe', ink2: '#dedede', muted: '#cfcfcf',
      primary: '#f2c230', accent: '#2dd4ff', ok: '#6fe3b2', warn: '#ffd27f', danger: '#ff6b6b',
    },
    fonts: {
      importUrl: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@700&family=Inter:wght@400;600&display=swap',
      base: 'Inter, system-ui, Arial', display: '"Montserrat", sans-serif'
    },
    bg: {
      image: 'https://images.unsplash.com/photo-1514826786317-59744fe2a548?q=80&w=1600&auto=format&fit=crop',
      overlay: 'rgba(0,0,0,.35)', size: 'cover', position: 'center', blur: 0
    },
    images: [],
  },

  'Día del Niño': {
    name: 'Día del Niño',
    palette: {
      bg: '#0b0f14', text: '#e8f7ff', panel1: '#0c1118', panel2: '#0c1016',
      ink1: '#e8f7ff', ink2: '#bfe7ff', muted: '#a6ddff',
      primary: '#ffb703', accent: '#00c2ff', ok: '#3ee089', warn: '#ffd27f', danger: '#ff6b8b',
    },
    fonts: {
      importUrl: 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@700&family=Inter:wght@400;600&display=swap',
      base: 'Inter, system-ui, Arial', display: '"Baloo 2", cursive'
    },
    bg: {
      image: 'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?q=80&w=1600&auto=format&fit=crop',
      overlay: 'rgba(0,0,0,.25)', size: 'cover', position: 'center', blur: 0
    },
    images: [],
  },

  'Día de la Madre': {
    name: 'Día de la Madre',
    palette: {
      bg: '#120d12', text: '#fff4fb', panel1: '#171017', panel2: '#1a121a',
      ink1: '#fff4fb', ink2: '#ffd1e8', muted: '#ffc0dc',
      primary: '#ff82b0', accent: '#ffa8d1', ok: '#5cd6a9', warn: '#ffd27f', danger: '#ff6b93',
    },
    fonts: {
      importUrl: 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Inter:wght@400;600&display=swap',
      base: 'Inter, system-ui, Arial', display: '"Dancing Script", cursive'
    },
    bg: {
      image: 'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?q=80&w=1600&auto=format&fit=crop',
      overlay: 'rgba(0,0,0,.30)', size: 'cover', position: 'center', blur: 0
    },
    images: [],
  },

  'Día del Padre': {
    name: 'Día del Padre',
    palette: {
      bg: '#0a0f14', text: '#eaf3ff', panel1: '#0b0f15', panel2: '#0a0e12',
      ink1: '#eaf3ff', ink2: '#bed5f5', muted: '#a8c4ed',
      primary: '#2a7de1', accent: '#18c1a3', ok: '#41d19a', warn: '#ffd27f', danger: '#ff6b6b',
    },
    fonts: {
      importUrl: 'https://fonts.googleapis.com/css2?family=Rubik:wght@700&family=Inter:wght@400;600&display=swap',
      base: 'Inter, system-ui, Arial', display: '"Rubik", sans-serif'
    },
    bg: {
      image: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?q=80&w=1600&auto=format&fit=crop',
      overlay: 'rgba(0,0,0,.30)', size: 'cover', position: 'center', blur: 0
    },
    images: [],
  },

  'Revolución Mexicana': {
    name: 'Revolución Mexicana',
    palette: {
      bg: '#0e0c0a', text: '#fff5e9', panel1: '#130f0c', panel2: '#19130e',
      ink1: '#fff5e9', ink2: '#f3d9b5', muted: '#e8c89c',
      primary: '#b04a2e', accent: '#d89b33', ok: '#59d18c', warn: '#e9c36b', danger: '#e45e5e',
    },
    fonts: {
      importUrl: 'https://fonts.googleapis.com/css2?family=Alegreya+SC:wght@700&family=Inter:wght@400;600&display=swap',
      base: 'Inter, system-ui, Arial', display: '"Alegreya SC", serif'
    },
    bg: {
      image: 'https://images.unsplash.com/photo-1519681393152-56cd371ee9a7?q=80&w=1600&auto=format&fit=crop',
      overlay: 'rgba(0,0,0,.35)', size: 'cover', position: 'center', blur: 0
    },
    images: [],
  },

  'Día de la Bandera': {
    name: 'Día de la Bandera',
    palette: {
      bg: '#0b1012', text: '#eef7ee', panel1: '#0c1117', panel2: '#0d1116',
      ink1: '#eef7ee', ink2: '#cfe8d4', muted: '#bfe1c6',
      primary: '#126e3b', accent: '#bf2b2b', ok: '#2bb56a', warn: '#ffd27f', danger: '#e24a4a',
    },
    fonts: {
      importUrl: 'https://fonts.googleapis.com/css2?family=Bangers&family=Inter:wght@400;600&display=swap',
      base: 'Inter, system-ui, Arial', display: '"Bangers", cursive'
    },
    bg: {
      image: 'https://images.unsplash.com/photo-1590502593747-42a5c2f4780d?q=80&w=1600&auto=format&fit=crop',
      overlay: 'rgba(0,0,0,.30)', size: 'cover', position: 'center', blur: 0
    },
    images: [],
  },
};

/* -------------------- Estado en memoria -------------------- */
const CUSTOM = Object.create(null); // presets personalizados (Firestore/local)
let _unsubTheme = null;
let _unsubPresets = null;

/* -------------------- Utilidades -------------------- */
const slug = (s = '') =>
  String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'custom';

function getPresetByName(name) {
  if (!name) return null;
  if (THEMES_BUILTIN[name]) return THEMES_BUILTIN[name];
  for (const t of Object.values(THEMES_BUILTIN)) {
    if (t.name.toLowerCase() === String(name).toLowerCase()) return t;
  }
  for (const p of Object.values(CUSTOM)) {
    if (p.name.toLowerCase() === String(name).toLowerCase()) return p;
  }
  return null;
}

function ensureFontImport(importUrl) {
  const id = 'theme-font-link';
  let link = document.getElementById(id);
  if (!importUrl) { if (link) link.remove(); return; }
  if (!link) { link = document.createElement('link'); link.id = id; link.rel = 'stylesheet'; document.head.appendChild(link); }
  link.href = importUrl;
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
  } else {
    body.style.backgroundImage = 'none';
  }
}

/* -------------------- API pública -------------------- */
export function applyThemeLocal(nameOrPreset, presetObj = null) {
  const preset = presetObj || (typeof nameOrPreset === 'string'
    ? getPresetByName(nameOrPreset)
    : nameOrPreset) || THEMES_BUILTIN.Base;

  const pal = preset.palette || {};
  const fonts = preset.fonts || {};
  const root = document.documentElement;

  const vars = {
    '--bg': pal.bg, '--text': pal.text,
    '--panel1': pal.panel1 || '#0b0e12', '--panel2': pal.panel2 || '#0b0d15',
    '--ink1': pal.ink1 || pal.text || '#fff', '--ink2': pal.ink2 || '#b9c3d1',
    '--muted': pal.muted || '#94a3b8',
    '--primary': pal.primary || '#ffc242', '--accent': pal.accent || '#27e1ff',
    '--ok': pal.ok || '#00c27a', '--warn': pal.warn || '#ffd27f', '--danger': pal.danger || '#ff5d5d',
    '--font-base': fonts.base || 'Inter, system-ui, Arial',
    '--font-display': fonts.display || 'inherit',
  };
  Object.entries(vars).forEach(([k, v]) => v && root.style.setProperty(k, v));

  ensureFontImport(fonts.importUrl || '');
  applyBackground(preset.bg || {});

  const name = preset.name || (typeof nameOrPreset === 'string' ? nameOrPreset : 'Custom');
  root.setAttribute('data-theme-name', name);
  document.body.setAttribute('data-theme-name', name);
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
  return Object.keys(THEMES_BUILTIN);
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

const slug = (s = '') =>
  String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'custom';

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
  const cur = (await getDoc(ref).catch(() => null))?.data?.() || {};
  const next = { ...(cur || {}), presets: { ...(cur?.presets || {}), [key]: p } };
  await setDoc(ref, next, { merge: true });
  return { ok: true, key, name: p.name };
}