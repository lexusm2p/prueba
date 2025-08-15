// Catálogo y recetas estandarizadas (mini vs grande)
export const SAUCES = [
  'Ajo-Habanero','Chipotle','Chimichurri','Cheddar','Mostaza dulce','Jalapeño rostizado','Curry suave','Secreta Seven'
];
export const EXTRAS = [
  'Tocino','Piña','Jamón','Salchicha','Cebolla caramelizada','Queso cheddar','Queso blanco'
];

export const BURGERS = [
  {key:'starter', name:'Starter Burger', price:47, rec:'Pan, Carne 85g, Queso amarillo, Queso blanco, Lechuga, Jitomate, Cebolla, Mayonesa, Catsup, Mostaza'},
  {key:'koopa', name:'Koopa Crunch', price:57, rec:'Pan, Carne, Queso blanco, Piña, Tocino, Lechuga, Jitomate, Cebolla, Mayonesa, Catsup, Mostaza'},
  {key:'fatality', name:'Fatality Flame', price:67, rec:'Pan, Carne, Salsa Cheddar, Tocino, Salsa habanero, Lechuga, Jitomate, Cebolla, Mayonesa, Catsup, Mostaza'},
  {key:'mega', name:'Mega Byte', price:77, rec:'Pan, Carne, Salsa Cheddar, Queso blanco, Tocino, Salchicha, Lechuga, Jitomate, Cebolla, Mayonesa, Catsup'},
  {key:'hadouken', name:'Hadouken', price:77, rec:'Pan, Carne, Queso blanco, Queso amarillo, Salchicha, Aderezo chipotle, Lechuga, Jitomate, Cebolla'},
  {key:'nintendo', name:'Nintendo Nostalgia', price:67, rec:'Pan, Carne, Queso blanco, Piña, Jamón, Lechuga, Jitomate, Cebolla, Mayonesa, Catsup, Mostaza'},
  {key:'finalboss', name:'Final Boss Burger', price:97, rec:'Pan, Carne, Salsa Cheddar, Queso blanco, Queso amarillo, Tocino, Jamón, Salchicha, Piña, Salsa habanero, Aderezo chipotle'}
];

export const MINIS = BURGERS.map(b => ({
  ...b,
  key: b.key + '_mini',
  name: b.name + ' Mini',
  price: ({starter:27, koopa:27, fatality:37, mega:37, hadouken:37, nintendo:37, finalboss:47}[b.key] || 27)
}));

// Porciones estándar para estandarización visual (aprox)
const base = {
  pan: {grande:'1 pza', mini:'1 mini'},
  carne: {grande:'85 g', mini:'45 g'},
  quesoAmarillo:{grande:'1 reb', mini:'1/2 reb'},
  quesoBlanco:{grande:'1 reb', mini:'1/2 reb'},
  lechuga:{grande:'1 hoja', mini:'1/2 hoja'},
  jitomate:{grande:'2 rod', mini:'1 rod'},
  cebolla:{grande:'2 aros', mini:'1 aro'},
  piña:{grande:'1 rod', mini:'1/2 rod'},
  tocino:{grande:'2 tiras', mini:'1 tira'},
  jamon:{grande:'1 reb', mini:'1/2 reb'},
  salchicha:{grande:'1/2 pza', mini:'1/3 pza'},
  salsas:{grande:'20 ml', mini:'10 ml'}
};

// Receta por burger → retorna lista de {item, qty}
export function recipeFor(key, size='grande'){
  const g = {
    starter:[['pan',''],['carne',''],['quesoAmarillo',''],['quesoBlanco',''],['lechuga',''],['jitomate',''],['cebolla',''],['salsas','(mayo/catsup/mostaza)']],
    koopa:[['pan',''],['carne',''],['quesoBlanco',''],['piña',''],['tocino',''],['lechuga',''],['jitomate',''],['cebolla',''],['salsas','']],
    fatality:[['pan',''],['carne',''],['salsas','Cheddar'],['tocino',''],['salsas','Habanero'],['lechuga',''],['jitomate',''],['cebolla',''],['salsas','(mayo/catsup/mostaza)']],
    mega:[['pan',''],['carne',''],['salsas','Cheddar'],['quesoBlanco',''],['tocino',''],['salchicha',''],['lechuga',''],['jitomate',''],['cebolla',''],['salsas','(mayo/catsup)']],
    hadouken:[['pan',''],['carne',''],['quesoBlanco',''],['quesoAmarillo',''],['salchicha',''],['salsas','Chipotle'],['lechuga',''],['jitomate',''],['cebolla','']],
    nintendo:[['pan',''],['carne',''],['quesoBlanco',''],['piña',''],['jamon',''],['lechuga',''],['jitomate',''],['cebolla',''],['salsas','(mayo/catsup/mostaza)']],
    finalboss:[['pan',''],['carne',''],['salsas','Cheddar'],['quesoBlanco',''],['quesoAmarillo',''],['tocino',''],['jamon',''],['salchicha',''],['piña',''],['salsas','Habanero'],['salsas','Chipotle']]
  };
  const k = key.replace('_mini','');
  const items = g[k] || [];
  return items.map(([it, note])=>{
    const portions = base[it] || {grande:'',mini:''};
    return { item: it, qty: portions[size], note };
  });
}
