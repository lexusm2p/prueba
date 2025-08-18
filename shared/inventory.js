import { COST_BASE, PRICES } from './pricing.js';
import { decrementInventory } from './db.js';

export function analyzeMarginForItem({price, cost}){
  const margin = price>0 ? (price-cost)/price : 0;
  const label = margin>=0.60 ? 'bueno' : margin>=0.45 ? 'medio' : 'bajo';
  return { margin, label };
}

export const RECIPES_DEFAULT = [
  { name:'Aderezo Cheddar', yieldMl:1000, components:[
    { name:'Queso cheddar base', costPerUnit:90, qtyUnit:1, unit:'kg' },
    { name:'Leche', costPerUnit:22, qtyUnit:0.5, unit:'L' },
    { name:'Mantequilla', costPerUnit:50, qtyUnit:0.1, unit:'kg' },
  ]},
];

export function costPerMl(recipe){
  const total = recipe.components.reduce((s,c)=> s + c.costPerUnit*c.qtyUnit,0);
  return total / recipe.yieldMl;
}
export function portionCostFromRecipe(recipe, ml){
  return costPerMl(recipe)*ml;
}

const MAP = {
  'Pan':'pan','Carne 85g':'carne_85g','Queso blanco':'queso_blanco','Queso amarillo':'queso_amarillo',
  'Lechuga':'lechuga','Jitomate':'jitomate','Cebolla':'cebolla','Mayonesa':'mayo','Catsup':'catsup','Mostaza':'mostaza',
  'Piña':'pina','Tocino':'tocino','Salsa Cheddar':'cheddar_ml','Salsa Habanero':'habanero_ml',
};

export async function consumeOnOrder(order){
  if(!order || !order.items) return;
  for(const it of order.items){
    const uniq = new Set(it.ingredients || []);
    const baseList = uniq.size? [...uniq] : ['Pan','Carne 85g'];
    for(const name of baseList){ const id=MAP[name]; if(id) await decrementInventory(id,1); }
    for(const ex of (it.extras||[])){ const id = ex.key; await decrementInventory(id,1); }
    for(const sc of (it.sauces||[])){ const id = sc.key; await decrementInventory(id,1); }
  }
}
