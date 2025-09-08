// /shared/theme.js
// Sistema de temas: colores + fuentes por festividad (MX).
// Se aplican como CSS Variables en :root y body.data-theme="Nombre".
// Permite cambiar en vivo y persistir en Firestore (via subscribeTheme/setTheme).
// ---------------------------------------------------------------------------

import { subscribeTheme } from './db.js';

const FONT_LINK_ID = 'theme-font-loader';

// 🎉 Paletas + fuentes (puedes ajustar colores/fontes a tu marca)
export const THEMES = {
  // 🇲🇽 16 de Septiembre (Independencia)
  Independencia: {
    vars: {
      '--bg': '#041A04',
      '--panel': '#0E2A0E',
      '--text': '#F1F5F2',
      '--accent': '#00B341',     // verde bandera
      '--accent-2': '#D31E1E',   // rojo bandera
      '--accent-3': '#F7F3D0'    // dorado tenue
    },
    fontFamily: "'Chakra Petch', system-ui, sans-serif",
    fontHref: "https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;700&display=swap"
  },

  // 💀 Día de Muertos
  'Día de Muertos': {
    vars: {
      '--bg': '#0B0414',
      '--panel': '#1B0A2A',
      '--text': '#FFEFFD',
      '--accent': '#FF8C00',     // cempasúchil
      '--accent-2': '#7E57C2',   // morado altar
      '--accent-3': '#00C2A8'    // turquesa papel picado
    },
    fontFamily: "'Varela Round', system-ui, sans-serif",
    fontHref: "https://fonts.googleapis.com/css2?family=Varela+Round&display=swap"
  },

  // 🎄 Posadas / Navidad
  Navidad: {
    vars: {
      '--bg': '#0C1A14',
      '--panel': '#11251D',
      '--text': '#F8FFFB',
      '--accent': '#E53935',     // rojo
      '--accent-2': '#43A047',   // verde
      '--accent-3': '#FFD54F'    // luz cálida
    },
    fontFamily: "'Nunito', system-ui, sans-serif",
    fontHref: "https://fonts.googleapis.com/css2?family=Nunito:wght@700;900&display=swap"
  },

  // 🎭 Fiestas Patrias (alterno nocturno)
  'Patrias Neon': {
    vars: {
      '--bg': '#020810',
      '--panel': '#0A1524',
      '--text': '#E6F7FF',
      '--accent': '#39FF14',     // verde neón
      '--accent-2': '#FF073A',   // rojo neón
      '--accent-3': '#C0FF00'
    },
    fontFamily: "'Press Start 2P', system-ui, monospace",
    fontHref: "https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap"
  }
};

// 🧩 Aplica variables al :root
function applyCssVars(vars) {
  const root = document.documentElement;
  for (const k in vars) root.style.setProperty(k, vars[k]);
}

// 🔤 Carga la fuente del tema (inserta <link> si no existe o cambia href)
function loadFont(href) {
  let link = document.getElementById(FONT_LINK_ID);
  if (!link) {
    link = document.createElement('link');
    link.id = FONT_LINK_ID;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  link.href = href;
}

// 🎨 Aplica un tema localmente (sin escribir en Firestore)
export function applyThemeLocal(name, overrides = {}) {
  const t = THEMES[name]; if (!t) return;
  // variables base + overrides
  applyCssVars({ ...t.vars, ...overrides });
  document.body.style.setProperty('--font-ui', t.fontFamily);
  loadFont(t.fontHref);
  document.body.dataset.theme = name;
}

// 🖲️ Inicializa y queda suscrito a Firestore (/settings/theme)
export function initThemeFromSettings({ defaultName = 'Independencia' } = {}) {
  // Aplica default instantáneo (evita flash)
  applyThemeLocal(defaultName);
  // Suscribe a cambios remotos
  return subscribeTheme((data) => {
    if (!data?.name) return;
    applyThemeLocal(data.name, data.overrides || {});
  });
}

// 🧾 Utilidad para UI: lista de temas
export function listThemes() {
  return Object.keys(THEMES);
}
