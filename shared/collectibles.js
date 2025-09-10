// /shared/collectibles.js
export async function loadSet(url = '../shared/collectibles.set.json') {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('No pude cargar el set');
  const data = await res.json();
  // Validación mínima
  const odds = data.rarities.reduce((a,r)=>a+(r.packOdds||0),0);
  if (odds !== 100) console.warn('Las odds no suman 100:', odds);
  return data;
}

export function buildRarityPicker(rarities) {
  // Devuelve una función que elige rareza según packOdds
  const table = [];
  let acc = 0;
  rarities.forEach(r=>{
    acc += r.packOdds;
    table.push([acc, r.id]);
  });
  return () => {
    const roll = Math.random()*100;
    return table.find(([t]) => roll < t)?.[1] || rarities[0].id;
  };
}

export function pickCharacterByRarity(set, rarityId) {
  // Filtra personajes que tengan variante con esa rareza
  const pool = set.characters.filter(c => c.variants.some(v=>v.rarity===rarityId));
  if (!pool.length) return null;
  return pool[Math.floor(Math.random()*pool.length)];
}

export function pickVariantFile(char, rarityId) {
  return char.variants.find(v=>v.rarity===rarityId)?.file || null;
}

/** Abre un sobre y devuelve los 5 pulls */
export function openPack(set, { size = set.pack?.size || 5 } = {}) {
  const chooseRarity = buildRarityPicker(set.rarities);
  const pulls = [];
  for (let i=0;i<size;i++){
    const r = chooseRarity();
    const ch = pickCharacterByRarity(set, r);
    if (!ch) { i--; continue; } // reintento si no hay pool
    pulls.push({
      id: `${ch.id}:${r}`,
      characterId: ch.id,
      rarity: r,
      file: pickVariantFile(ch, r),
      gold: r==='gold'
    });
  }
  return pulls;
}

/** Bonus por extras: +1 del mismo nivel de la última carta */
export function bonusOnExtras(set, lastPull) {
  if (!lastPull) return null;
  const ch = set.characters.find(c=>c.id===lastPull.characterId);
  if (!ch) return null;
  return {
    ...lastPull,
    id: `${ch.id}:${lastPull.rarity}:bonus`,
    bonus: true
  };
}
