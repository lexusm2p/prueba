// /shared/theme.js
// Temas: integrados + personalizados (Firestore).
// Aplica paletas CSS, fuentes Google y fondo con una sola llamada.

import {
  db, doc, setDoc, getDoc, collection, onSnapshot,
  serverTimestamp
} from './firebase.js';

/* ============ Temas integrados (puedes ajustar colores a gusto) ============ */
const DEFAULT_THEMES = {
  Base: {
    name:'Base',
    fonts: { importUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap', base:'Inter, system-ui, Arial', display:'inherit' },
    palette: { bg:'#0b0f14', surface:'#121823', card:'#0f1420', text:'#e8f0ff', muted:'rgba(255,255,255,.6)', primary:'#ffc242', accent:'#27e1ff', success:'#87f59b', warn:'#ffd27f', danger:'#ff8a8a' },
    bg: { image:'', overlay:'rgba(0,0,0,.20)', size:'cover', position:'center', blur:0 },
    images:[]
  },
  Independencia: {
    name:'Independencia',
    fonts:{ importUrl:'https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Inter:wght@400;700&display=swap', base:'Inter, system-ui', display:'"Alfa Slab One", cursive' },
    palette:{ bg:'#06140b', surface:'#0b2415', card:'#0b1911', text:'#f6fff4', muted:'rgba(255,255,255,.70)', primary:'#2bbb6f', accent:'#e53c3c', success:'#8bf59f', warn:'#ffd27f', danger:'#ff8a8a' },
    bg:{ image:'', overlay:'rgba(0,0,0,.25)', size:'cover', position:'center', blur:0 },
    images:[]
  },
  Muertos: {
    name:'Muertos',
    fonts:{ importUrl:'https://fonts.googleapis.com/css2?family=Fugaz+One&family=Inter:wght@400;700&display=swap', base:'Inter, system-ui', display:'"Fugaz One", cursive' },
    palette:{ bg:'#0f0a10', surface:'#1b1320', card:'#140d17', text:'#fff4ff', muted:'rgba(255,255,255,.72)', primary:'#ff9f1a', accent:'#7b5cff', success:'#8fffce', warn:'#ffd27f', danger:'#ff9090' },
    bg:{ image:'', overlay:'rgba(0,0,0,.30)', size:'cover', position:'center', blur:0 },
    images:[]
  },
  Navidad: {
    name:'Navidad',
    fonts:{ importUrl:'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&family=Mountains+of+Christmas:wght@700&display=swap', base:'Montserrat, system-ui', display:'"Mountains of Christmas", cursive' },
    palette:{ bg:'#08110c', surface:'#0f1f17', card:'#0b1712', text:'#f3fff7', muted:'rgba(255,255,255,.7)', primary:'#1ecb7f', accent:'#e85050', success:'#9af5c3', warn:'#ffd27f', danger:'#ff8a8a' },
    bg:{ image:'', overlay:'rgba(0,0,0,.22)', size:'cover', position:'center', blur:0 },
    images:[]
  },
  'San Valentín': {
    name:'San Valentín',
    fonts:{ importUrl:'https://fonts.googleapis.com/css2?family=Pacifico&family=Inter:wght@400;700&display=swap', base:'Inter, system-ui', display:'Pacifico, cursive' },
    palette:{ bg:'#160a11', surface:'#24131e', card:'#1b0f17', text:'#fff1f6', muted:'rgba(255,255,255,.74)', primary:'#ff6ea8', accent:'#ffa3d2', success:'#9cf0c4', warn:'#ffe38a', danger:'#ff8a8a' },
    bg:{ image:'', overlay:'rgba(0,0,0,.28)', size:'cover', position:'center', blur:0 },
    images:[]
  },
  Halloween: {
    name:'Halloween',
    fonts:{ importUrl:'https://fonts.googleapis.com/css2?family=Creepster&family=Inter:wght@400;700&display=swap', base:'Inter, system-ui', display:'Creepster, cursive' },
    palette:{ bg:'#0b0a06', surface:'#141208', card:'#0e0d07', text:'#fffbef', muted:'rgba(255,255,255,.72)', primary:'#ff8c00', accent:'#7b5cff', success:'#8fffce', warn:'#ffd27f', danger:'#ff9090' },
    bg:{ image:'', overlay:'rgba(0,0,0,.35)', size:'cover', position:'center', blur:0 },
    images:[]
  },
  Fútbol: {
    name:'Fútbol',
    fonts:{ importUrl:'https://fonts.googleapis.com/css2?family=Bungee&family=Inter:wght@400;700&display=swap', base:'Inter, system-ui', display:'Bungee, cursive' },
    palette:{ bg:'#06140b', surface:'#0b2415', card:'#0a1d12', text:'#effff4', muted:'rgba(255,255,255,.70)', primary:'#21c25c', accent:'#2ab3ff', success:'#8bf59f', warn:'#ffd27f', danger:'#ff8a8a' },
    bg:{ image:'', overlay:'rgba(0,0,0,.25)', size:'cover', position:'center', blur:0 },
    images:[]
  },
  'Lucha Libre': {
    name:'Lucha Libre',
    fonts:{ importUrl:'https://fonts.googleapis.com/css2?family=Bangers&family=Inter:wght@400;700&display=swap', base:'Inter, system-ui', display:'Bangers, cursive' },
    palette:{ bg:'#0b0d16', surface:'#121638', card:'#0e1230', text:'#eef1ff', muted:'rgba(255,255,255,.70)', primary:'#f7d23e', accent:'#e94141', success:'#9cf5c9', warn:'#ffd27f', danger:'#ff8a8a' },
    bg:{ image:'', overlay:'rgba(0,0,0,.30)', size:'cover', position:'center', blur:0 },
    images:[]
  },
  'Pixel Art': {
    name:'Pixel Art',
    fonts:{ importUrl:'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap', base:'system-ui, Arial', display:'"Press Start 2P", monospace' },
    palette:{ bg:'#0a0a12', surface:'#111126', card:'#0c0c1b', text:'#eaf1ff', muted:'rgba(255,255,255,.7)', primary:'#00ffb3', accent:'#ffe500', success:'#9bf5d6', warn:'#ffef8a', danger:'#ff8a8a' },
    bg:{ image:'', overlay:'rgba(0,0,0,.25)', size:'cover', position:'center', blur:0 },
    images:[]
  },
  'Retro Arcade': {
    name:'Retro Arcade',
    fonts:{ importUrl:'https://fonts.googleapis.com/css2?family=VT323&display=swap', base:'system-ui, Arial', display:'VT323, monospace' },
    palette:{ bg:'#0c0b12', surface:'#171427', card:'#121022', text:'#eaf1ff', muted:'rgba(255,255,255,.7)', primary:'#ff4aa2', accent:'#00e5ff', success:'#9bf5d6', warn:'#ffd27f', danger:'#ff8a8a' },
    bg:{ image:'', overlay:'rgba(0,0,0,.25)', size:'cover', position:'center', blur:0 },
    images:[]
  },
  Y2K: {
    name:'Y2K',
    fonts:{ importUrl:'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap', base:'system-ui, Arial', display:'Orbitron, sans-serif' },
    palette:{ bg:'#0b0d11', surface:'#121627', card:'#0f1426', text:'#eaf3ff', muted:'rgba(255,255,255,.72)', primary:'#9d7eff', accent:'#00f0ff', success:'#9bf5d6', warn:'#ffd27f', danger:'#ff8a8a' },
    bg:{ image:'', overlay:'rgba(0,0,0,.28)', size:'cover', position:'center', blur:0 },
    images:[]
  }
};

/* =================== cache de personalizados =================== */
window.__customThemes = window.__customThemes || {};
const FONT_TAG = 'data-theme-font';

/* =================== utilidades =================== */
function normalizePreset(p){
  const name = String(p?.name || 'Base').trim();
  const palette = { ...DEFAULT_THEMES.Base.palette, ...(p?.palette||{}) };
  const fonts   = { ...DEFAULT_THEMES.Base.fonts,   ...(p?.fonts||{}) };
  const bg      = { ...DEFAULT_THEMES.Base.bg,      ...(p?.bg||{}) };
  const images  = Array.isArray(p?.images) ? p.images : [];
  return { name, palette, fonts, bg, images };
}

function ensureFont(url){
  if (!url) return;
  if (document.querySelector(`link[${FONT_TAG}="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  link.setAttribute(FONT_TAG, url);
  document.head.appendChild(link);
}

function setVar(k, v){ document.documentElement.style.setProperty(`--${k}`, String(v)); }

/* =================== API pública =================== */

// Lista sincrónica: integrados + últimos personalizados cacheados
export function listThemes(){
  let custom = [];
  try { custom = JSON.parse(sessionStorage.getItem('customThemeNames') || '[]'); } catch {}
  return Array.from(new Set([...Object.keys(DEFAULT_THEMES), ...custom]));
}

// Aplica un tema a la UI (solo local). `overrides` permite retoques al vuelo.
export function applyThemeLocal(name, overrides = {}){
  const preset = window.__customThemes?.[name] || DEFAULT_THEMES[name] || DEFAULT_THEMES.Base;
  const t = normalizePreset({ ...preset, ...overrides, palette:{...preset.palette, ...(overrides.palette||{})} });

  ensureFont(t.fonts?.importUrl);
  document.documentElement.style.fontFamily = t.fonts?.base || 'system-ui';
  document.documentElement.style.setProperty('--display-font', t.fonts?.display || 'inherit');

  setVar('bg',      t.palette.bg);
  setVar('surface', t.palette.surface);
  setVar('card',    t.palette.card);
  setVar('text',    t.palette.text);
  setVar('muted',   t.palette.muted);
  setVar('primary', t.palette.primary);
  setVar('accent',  t.palette.accent);
  setVar('success', t.palette.success);
  setVar('warn',    t.palette.warn);
  setVar('danger',  t.palette.danger);

  // Fondo
  document.body.style.backgroundColor = t.palette.bg;
  document.body.style.backgroundImage = t.bg?.image ? `linear-gradient(${t.bg.overlay||'rgba(0,0,0,.25)'}, ${t.bg.overlay||'rgba(0,0,0,.25)'}), url("${t.bg.image}")` : '';
  document.body.style.backgroundSize = t.bg?.size || 'cover';
  document.body.style.backgroundPosition = t.bg?.position || 'center';
  document.body.style.backgroundRepeat = 'no-repeat';
  document.body.style.backdropFilter = t.bg?.blur ? `blur(${t.bg.blur}px)` : '';

  document.body.setAttribute('data-theme', name);
}

// Suscripción a **settings/theme** → aplica global; si hay “localTheme” en sessionStorage lo respeta
export function initThemeFromSettings({ defaultName = 'Base' } = {}){
  try { const local = sessionStorage.getItem('localTheme'); if (local) { applyThemeLocal(local); return () => {}; } } catch {}
  const ref = doc(db,'settings','theme');
  return onSnapshot(ref, (snap)=>{
    const d = snap.data() || { name: defaultName, overrides:{} };
    applyThemeLocal(d.name || defaultName, d.overrides || {});
  });
}

// Suscripción a presets personalizados (colección `themes`)
export function subscribeThemePresets(cb){
  const colRef = collection(db,'themes');
  return onSnapshot(colRef, (snap)=>{
    const map = {}; const names = [];
    snap.docs.forEach(d=>{
      const val = normalizePreset(d.data() || {});
      const name = val.name || d.id;
      names.push(name); map[name] = val;
    });
    window.__customThemes = map;
    try { sessionStorage.setItem('customThemeNames', JSON.stringify(names)); } catch {}
    cb?.(names);
  });
}

// Guarda/actualiza un preset personalizado y (opcionalmente) lo publica como GLOBAL (setTheme en settings/theme lo haces desde /shared/db.js)
export async function saveThemePreset(preset){
  const clean = normalizePreset(preset);
  const id = (clean.name || 'custom').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  await setDoc(doc(db,'themes', id), { ...clean, updatedAt: serverTimestamp() }, { merge:true });

  // Mantener un arreglo de nombres en settings/app.themes (para compat con tu app.js)
  try {
    const appRef = doc(db,'settings','app');
    const snap = await getDoc(appRef);
    const prev = Array.isArray(snap.data()?.themes) ? snap.data().themes : [];
    const next = Array.from(new Set([...prev, clean.name]));
    await setDoc(appRef, { themes: next, updatedAt: serverTimestamp() }, { merge:true });
  } catch {}

  return { ok:true, name: clean.name };
}