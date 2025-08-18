
// Menú base y minis (precios cliente, ejemplo). Ingredientes en español.
export const PRODUCTS = [
  { sku:'STARTER',     name:'Starter Burger',       size:'normal', price:47, ingredients:['Pan','Carne','Queso amarillo','Queso blanco','Lechuga','Jitomate','Cebolla','Mayonesa','Cátsup','Mostaza'] },
  { sku:'KOOPA',       name:'Koopa Crunch',         size:'normal', price:57, ingredients:['Pan','Carne','Queso blanco','Piña','Tocino','Lechuga','Jitomate','Cebolla','Mayonesa','Cátsup','Mostaza'] },
  { sku:'FLAME',       name:'Fatality Flame',       size:'normal', price:67, ingredients:['Pan','Carne','Salsa Cheddar','Tocino','Salsa Habanero','Lechuga','Jitomate','Cebolla','Mayonesa','Cátsup','Mostaza'] },
  { sku:'MEGABYTE',    name:'Mega Byte',            size:'normal', price:77, ingredients:['Pan','Carne','Salsa Cheddar','Queso blanco','Tocino','Salchicha','Lechuga','Jitomate','Cebolla','Mayonesa','Cátsup'] },
  { sku:'HADOUKEN',    name:'Hadouken',             size:'normal', price:77, ingredients:['Pan','Carne','Queso blanco','Queso amarillo','Salchicha','Aderezo Chipotle','Lechuga','Jitomate','Cebolla'] },
  { sku:'NOSTALGIA',   name:'Nintendo Nostalgia',   size:'normal', price:67, ingredients:['Pan','Carne','Queso blanco','Piña','Jamón','Lechuga','Jitomate','Cebolla','Mayonesa','Cátsup','Mostaza'] },
  { sku:'FINALBOSS',   name:'Final Boss Burger',    size:'normal', price:97, ingredients:['Pan','Carne','Salsa Cheddar','Queso blanco','Queso amarillo','Tocino','Jamón','Salchicha','Piña','Salsa Habanero','Aderezo Chipotle'] },

  // minis heredan ingredientes de baseOf
  { sku:'STARTER_MINI',   name:'Starter Mini',       size:'mini', price:27, baseOf:'STARTER' },
  { sku:'KOOPA_MINI',     name:'Koopa Crunch Mini',  size:'mini', price:27, baseOf:'KOOPA' },
  { sku:'FLAME_MINI',     name:'Fatality Flame Mini',size:'mini', price:37, baseOf:'FLAME' },
  { sku:'MEGABYTE_MINI',  name:'Mega Byte Mini',     size:'mini', price:37, baseOf:'MEGABYTE' },
  { sku:'HADOUKEN_MINI',  name:'Hadouken Mini',      size:'mini', price:37, baseOf:'HADOUKEN' },
  { sku:'NOSTALGIA_MINI', name:'Nintendo Nostalgia Mini', size:'mini', price:37, baseOf:'NOSTALGIA' },
  { sku:'FINALBOSS_MINI', name:'Final Boss Mini',    size:'mini', price:47, baseOf:'FINALBOSS' },
];

// 8 aderezos (para referencia en otras vistas)
export const SAUCES = [
  'Aderezo de ajo habanero','Aderezo chipotle','Salsa chimichurri','Aderezo cheddar',
  'Aderezo de mostaza dulce','Aderezo de jalapeño rostizado','Aderezo curry madras','Salsa secreta Seven'
];

// Ingredientes extras con precio al cliente
export const EXTRAS = [
  { name:'Tocino', price:6 },
  { name:'Piña', price:5 },
  { name:'Salsa habanero', price:5 },
  { name:'Salsa chimichurri', price:5 },
  { name:'Jamón', price:5 },
  { name:'Salchicha', price:8 },
  { name:'Salsa cheddar', price:5 }
];

export function isMini(item){ return item.size==='mini' || (item.sku||'').includes('_MINI'); }

export function getProductBySku(sku){
  return PRODUCTS.find(p=>p.sku===sku);
}

export function getIngredientsForSku(sku){
  const p = getProductBySku(sku);
  if(!p) return [];
  if(p.ingredients && p.ingredients.length) return p.ingredients;
  if(p.baseOf){
    const base = getProductBySku(p.baseOf);
    return base?.ingredients || [];
  }
  if(p.size==='mini' && p.baseOf){
    const base = getProductBySku(p.baseOf);
    return base?.ingredients || [];
  }
  return [];
}
