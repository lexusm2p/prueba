// /shared/collectibles.js
// Utilidades para sets de coleccionables con “sobres” (packs)
//
// Cambios amigables:
// - Validación/normalización suave del set (nombres y campos mínimos).
// - Tolerancia a odds con decimales y suma ≠100 (se normaliza).
// - Picker de rareza precompilado O(1) con tabla acumulada.
// - Soporte RNG con semilla opcional para pruebas/repetibilidad.
// - openPack() con opciones: size, noDuplicates, rng, overrideRarity, whitelist/blacklist.
// - Evita bucles infinitos si no hay pool válido; rellena con rarezas fallback.
// - pickVariantFile() elige entre varias variantes de la misma rareza.
// - bonusOnExtras() intenta variar el arte si hay varias variantes.
//
// Estructura esperada del set (coleccionables.set.json):
// {
//   "rarities": [{ "id":"common","name":"Common","packOdds":70 }, ...],
//   "characters": [
//     { "id":"c01","name":"...","variants":[{"rarity":"common","file":"...png"}, ...] }, ...
//   ],
//   "pack": { "size": 5 }
// }

const DEFAULT_SET_URL = '../shared/collectibles.set.json';

/* =============== Utils =============== */
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

/** RNG seedable (Mulberry32). Si no pasas seed, usa Math.random. */
export function makeRng(seed = null) {
  if (seed == null) return Math.random.bind(Math);
  let t = (seed >>> 0) || 0x12345678;
  return function rng() {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Suma segura con flotantes */
function sum(arr) { return arr.reduce((a, n) => a + (Number(n) || 0), 0); }

/** Normaliza rarezas: asegura id, name y packOdds en [0,100] */
function normalizeRarities(rarities = []) {
  const list = (Array.isArray(rarities) ? rarities : []).map((r, i) => ({
    id: String(r?.id ?? `r${i+1}`),
    name: String(r?.name ?? r?.id ?? `Rarity ${i+1}`),
    packOdds: Number(r?.packOdds ?? 0)
  }));
  // Si la suma no es 100, normalizamos proporcionalmente (pero respetamos ceros)
  const total = sum(list.map(r => r.packOdds));
  if (total > 0 && Math.abs(total - 100) > 0.0001) {
    list.forEach(r => { r.packOdds = (r.packOdds / total) * 100; });
  }
  return list;
}

/** Normaliza personajes/variantes y pre-indexa por rareza */
function normalizeCharacters(chars = []) {
  const list = (Array.isArray(chars) ? chars : []).map((c, i) => ({
    id: String(c?.id ?? `c${i+1}`),
    name: String(c?.name ?? c?.id ?? `Character ${i+1}`),
    variants: Array.isArray(c?.variants) ? c.variants.map(v => ({
      rarity: String(v?.rarity ?? ''),
      file: String(v?.file ?? '')
    })).filter(v => v.rarity) : []
  })).filter(c => c.variants.length);
  return list;
}

/** Construye índices para consultas rápidas */
function buildIndexes(set) {
  const byRarity = new Map();      // rarityId -> array de characters
  const charMap  = new Map();      // charId -> char
  for (const ch of set.characters) {
    charMap.set(ch.id, ch);
    const rarSet = new Set(ch.variants.map(v => v.rarity));
    for (const r of rarSet) {
      if (!byRarity.has(r)) byRarity.set(r, []);
      byRarity.get(r).push(ch);
    }
  }
  return { byRarity, charMap };
}

/* =============== Carga =============== */
export async function loadSet(url = DEFAULT_SET_URL) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('No pude cargar el set');

  const raw = await res.json();
  // Validación/normalización mínima
  const rarities = normalizeRarities(raw?.rarities || []);
  const characters = normalizeCharacters(raw?.characters || []);
  const pack = { size: clamp(Number(raw?.pack?.size ?? 5) || 5, 1, 20) };

  const data = { rarities, characters, pack };
  const odds = Math.round(sum(rarities.map(r => r.packOdds)) * 1000) / 1000;
  if (Math.abs(odds - 100) > 0.01) {
    console.warn('Las odds no suman 100 (se han reescalado):', odds);
  }
  data.__index = buildIndexes(data);
  return data;
}

/* =============== Pickers =============== */
export function buildRarityPicker(rarities, rngFn = Math.random) {
  // Devuelve una función que elige rareza según packOdds acumuladas
  const table = [];
  let acc = 0;
  for (const r of rarities) {
    acc += clamp(r.packOdds, 0, 100);
    table.push([acc, r.id]);
  }
  // En caso extremo de todo 0, caer al índice 0
  const ceiling = acc > 0 ? acc : 100;

  return () => {
    const roll = rngFn() * ceiling;
    for (let i = 0; i < table.length; i++) {
      if (roll < table[i][0]) return table[i][1];
    }
    return table[table.length - 1]?.[1] ?? rarities[0]?.id ?? null;
  };
}

/** Elige un personaje que tenga alguna variante con esa rareza */
export function pickCharacterByRarity(set, rarityId, rngFn = Math.random) {
  const pool = set.__index?.byRarity?.get?.(rarityId) || [];
  if (!pool.length) return null;
  const idx = Math.floor(rngFn() * pool.length);
  return pool[idx] || null;
}

/** Elige un archivo de variante para la rareza dada (si hay varias, sortea una) */
export function pickVariantFile(char, rarityId, rngFn = Math.random) {
  const pool = (char?.variants || []).filter(v => v.rarity === rarityId);
  if (!pool.length) return null;
  if (pool.length === 1) return pool[0].file || null;
  const idx = Math.floor(rngFn() * pool.length);
  return pool[idx]?.file || pool[0]?.file || null;
}

/* =============== Apertura de sobres =============== */
/**
 * Abre un sobre y devuelve los pulls.
 * @param {Object} set - set normalizado por loadSet()
 * @param {Object} opts
 * @param {number} opts.size                      - tamaño del pack (default set.pack.size)
 * @param {boolean} opts.noDuplicates             - evita personajes duplicados en el mismo sobre
 * @param {function} opts.rng                     - RNG a usar (ej. makeRng(123))
 * @param {string|string[]} opts.overrideRarity   - fuerza una o varias rarezas (útil para pruebas)
 * @param {string[]} opts.whitelistRarities       - limita rarezas permitidas
 * @param {string[]} opts.blacklistRarities       - rarezas prohibidas
 * @returns {{id:string, characterId:string, rarity:string, file:string, gold?:boolean, bonus?:boolean}[]}
 */
export function openPack(set, opts = {}) {
  const {
    size = set?.pack?.size || 5,
    noDuplicates = false,
    rng = Math.random,
    overrideRarity = null,
    whitelistRarities = null,
    blacklistRarities = null
  } = opts;

  const s = clamp(Number(size) || 5, 1, 20);
  const rngFn = typeof rng === 'function' ? rng : Math.random;
  const chooseRarityBase = buildRarityPicker(set.rarities, rngFn);

  const allowed = new Set(
    (Array.isArray(whitelistRarities) && whitelistRarities.length)
      ? whitelistRarities
      : set.rarities.map(r => r.id)
  );
  if (Array.isArray(blacklistRarities)) {
    blacklistRarities.forEach(r => allowed.delete(r));
  }
  const allowedArr = Array.from(allowed);

  const chooseRarity = () => {
    if (overrideRarity) {
      if (Array.isArray(overrideRarity)) {
        const idx = Math.floor(rngFn() * overrideRarity.length);
        return overrideRarity[idx] || overrideRarity[0];
      }
      return overrideRarity;
    }
    // Elegir hasta encontrar una rareza permitida (máx 10 intentos)
    for (let i = 0; i < 10; i++) {
      const r = chooseRarityBase();
      if (!r || allowed.has(r)) return r || allowedArr[0] || null;
    }
    // Fallback extremo
    return allowedArr[0] || null;
  };

  const pulls = [];
  const seenChars = new Set();

  let safety = 0;
  while (pulls.length < s && safety++ < s * 20) {
    const rarity = chooseRarity();
    if (!rarity) break;

    let ch = pickCharacterByRarity(set, rarity, rngFn);
    if (!ch) {
      // Si la rareza elegida no tiene pool, intenta con otra permitida al azar
      if (allowedArr.length > 1) {
        const rndR = allowedArr[Math.floor(rngFn() * allowedArr.length)];
        ch = pickCharacterByRarity(set, rndR, rngFn);
      }
    }
    if (!ch) continue;

    if (noDuplicates && seenChars.has(ch.id)) {
      // intenta otro personaje con algunos reintentos
      let alt = null;
      for (let i = 0; i < 5; i++) {
        const r2 = chooseRarity();
        alt = pickCharacterByRarity(set, r2, rngFn);
        if (alt && !seenChars.has(alt.id)) { ch = alt; break; }
        alt = null;
      }
      if (!ch || (noDuplicates && seenChars.has(ch.id))) continue;
    }

    const file = pickVariantFile(ch, rarity, rngFn);
    if (!file) continue;

    seenChars.add(ch.id);
    pulls.push({
      id: `${ch.id}:${rarity}`,
      characterId: ch.id,
      rarity,
      file,
      // Considera “gold” si la rareza contiene la palabra gold o si la ID es "gold"
      gold: /(^gold$|gold)/i.test(String(rarity))
    });
  }

  // Si por alguna razón no pudimos llenar el pack, intenta completar con cualquier rareza válida
  while (pulls.length < s) {
    const anyR = allowedArr[0] ?? set?.rarities?.[0]?.id ?? null;
    if (!anyR) break;
    const ch = pickCharacterByRarity(set, anyR, rngFn);
    if (!ch) break;
    if (noDuplicates && seenChars.has(ch.id)) { continue; }
    const file = pickVariantFile(ch, anyR, rngFn);
    if (!file) break;
    seenChars.add(ch.id);
    pulls.push({
      id: `${ch.id}:${anyR}`,
      characterId: ch.id,
      rarity: anyR,
      file,
      gold: /(^gold$|gold)/i.test(String(anyR))
    });
  }

  return pulls;
}

/* =============== Bonus =============== */
/**
 * Bonus por extras: +1 del mismo nivel de la última carta.
 * - Si el personaje tiene múltiples variantes para esa rareza, se intenta variar el arte.
 * - Mantiene la misma estructura que un pull normal y marca { bonus:true }.
 */
export function bonusOnExtras(set, lastPull, rng = Math.random) {
  if (!lastPull) return null;
  const char = set.__index?.charMap?.get?.(lastPull.characterId) ||
               set.characters.find(c => c.id === lastPull.characterId);
  if (!char) return null;

  // Intentar elegir una variante diferente si existe
  const variants = (char.variants || []).filter(v => v.rarity === lastPull.rarity);
  let file = lastPull.file || null;
  if (variants.length > 1) {
    const others = variants.map(v => v.file).filter(f => f && f !== lastPull.file);
    if (others.length) {
      file = others[Math.floor((typeof rng === 'function' ? rng() : Math.random) * others.length)] || file;
    }
  } else if (!file) {
    file = pickVariantFile(char, lastPull.rarity, typeof rng === 'function' ? rng : Math.random);
  }

  return {
    id: `${char.id}:${lastPull.rarity}:bonus`,
    characterId: char.id,
    rarity: lastPull.rarity,
    file,
    gold: !!lastPull.gold,
    bonus: true
  };
}
