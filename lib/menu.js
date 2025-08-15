// Catálogo unificado + recetario + costos por defecto
export const MENU = [
  { id:'starter', name:'Starter Burger', price:47, ingredients:['Pan','Carne 85g','Queso amarillo','Queso blanco','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup','Mostaza'], desc:'Clásica con doble queso y frescura vegetal.' },
  { id:'koopa', name:'Koopa Crunch', price:57, ingredients:['Pan','Carne','Queso blanco','Piña','Tocino','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup','Mostaza'], desc:'Toque tropical con piña y tocino crujiente.' },
  { id:'fatality', name:'Fatality Flame', price:67, ingredients:['Pan','Carne','Salsa Cheddar','Tocino','Salsa Habanero','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup','Mostaza'], desc:'Patada ardiente con cheddar y habanero.' },
  { id:'mega', name:'Mega Byte', price:77, ingredients:['Pan','Carne','Salsa Cheddar','Queso blanco','Tocino','Salchicha','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup'], desc:'Potente combo con salchicha y doble queso.' },
  { id:'hadouken', name:'Hadouken', price:77, ingredients:['Pan','Carne','Queso blanco','Queso amarillo','Salchicha','Aderezo Chipotle','Lechuga','Jitomate','Cebolla'], desc:'Golpe de sabor con chipotle y doble queso.' },
  { id:'nintendo', name:'Nintendo Nostalgia', price:67, ingredients:['Pan','Carne','Queso blanco','Piña','Jamón','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup','Mostaza'], desc:'Nostalgia con piña y jamón.' },
  { id:'final', name:'Final Boss Burger', price:97, ingredients:['Pan','Carne','Salsa Cheddar','Queso blanco','Queso amarillo','Tocino','Jamón','Salchicha','Piña','Salsa Habanero','Aderezo Chipotle'], desc:'El jefe final: todo el poder.' }
];

export const MINIS = [
  { id:'m_starter', name:'Starter Mini', price:27, desc:'Mini clásica', base:'starter'},
  { id:'m_koopa', name:'Koopa Crunch Mini', price:27, desc:'Mini tropical', base:'koopa'},
  { id:'m_fatality', name:'Fatality Flame Mini', price:37, desc:'Mini picante', base:'fatality'},
  { id:'m_mega', name:'Mega Byte Mini', price:37, desc:'Mini poderosa', base:'mega'},
  { id:'m_hadouken', name:'Hadouken Mini', price:37, desc:'Mini enérgica', base:'hadouken'},
  { id:'m_nintendo', name:'Nintendo Nostalgia Mini', price:37, desc:'Mini nostálgica', base:'nintendo'},
  { id:'m_final', name:'Final Boss Mini', price:47, desc:'Mini jefazo', base:'final'}
];

export const SAUCES = [
  { id:'ched', name:'Aderezo Cheddar', price:5 },
  { id:'chip', name:'Aderezo Chipotle', price:5 },
  { id:'haba', name:'Aderezo Habanero', price:5 },
  { id:'chimi', name:'Salsa Chimichurri', price:5 },
  { id:'most', name:'Mostaza dulce', price:5 },
  { id:'jala', name:'Jalapeño rostizado', price:5 },
  { id:'curr', name:'Curry suave', price:5 },
  { id:'ss7', name:'Salsa Secreta Seven', price:5 },
];

export const EXTRAS = [
  { id:'tocino', name:'Tocino', price:5 },
  { id:'piña', name:'Piña', price:5 },
  { id:'jamon', name:'Jamón', price:5 },
  { id:'salchicha', name:'Salchicha', price:8 },
  { id:'cebolla', name:'Cebolla caramelizada', price:5 },
  { id:'carne_extra', name:'Carne extra (85g)', price:17 },
];

export const PRICES = { combo3Minis: 77 };

// ----- Recetas estandarizadas (para Cocina) -----
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
const SCHEMA = {
  starter:[['pan',''],['carne',''],['quesoAmarillo',''],['quesoBlanco',''],['lechuga',''],['jitomate',''],['cebolla',''],['salsas','(mayo/catsup/mostaza)']],
  koopa:[['pan',''],['carne',''],['quesoBlanco',''],['piña',''],['tocino',''],['lechuga',''],['jitomate',''],['cebolla',''],['salsas','']],
  fatality:[['pan',''],['carne',''],['salsas','Cheddar'],['tocino',''],['salsas','Habanero'],['lechuga',''],['jitomate',''],['cebolla',''],['salsas','(mayo/catsup/mostaza)']],
  mega:[['pan',''],['carne',''],['salsas','Cheddar'],['quesoBlanco',''],['tocino',''],['salchicha',''],['lechuga',''],['jitomate',''],['cebolla',''],['salsas','(mayo/catsup)']],
  hadouken:[['pan',''],['carne',''],['quesoBlanco',''],['quesoAmarillo',''],['salchicha',''],['salsas','Chipotle'],['lechuga',''],['jitomate',''],['cebolla','']],
  nintendo:[['pan',''],['carne',''],['quesoBlanco',''],['piña',''],['jamon',''],['lechuga',''],['jitomate',''],['cebolla',''],['salsas','(mayo/catsup/mostaza)']],
  final:[['pan',''],['carne',''],['salsas','Cheddar'],['quesoBlanco',''],['quesoAmarillo',''],['tocino',''],['jamon',''],['salchicha',''],['piña',''],['salsas','Habanero'],['salsas','Chipotle']]
};
export function recipeForById(id, size='grande'){
  let key = id.replace(/^m_/,''); if(!(key in SCHEMA)) key='starter';
  return SCHEMA[key].map(([it, note])=>({ item:it, qty:(base[it]||{})[size]||'', note }));
}

// ----- Costos por defecto (editables desde Admin → Ajustes) -----
export const DEFAULT_COSTS = {
  pan: 10/6,              // paquete 6 piezas $69 → luego comentaste $60 → ~ $10/6, conservador
  carne85g: 10,           // costo por carne
  quesoAmarillo: 195/40,  // rollo 2kg aprox 40 rebanadas → $4.875
  quesoBlanco: 12/8,      // paquete $12 / 8 rebanadas = $1.5
  lechuga: 30/12,         // por unidad rinde ~12 hojas
  jitomateRodaja: 3/6,    // 6 rodajas por jitomate
  cebollaAro: 10/12,      // 1 cebolla $10 rinde ~12 aros
  piñaRodaja: 5/2,        // mini / grande aproximación
  tocinoTira: 235/40,     // 1kg rinde aprox 40 tiras → $5.875
  jamonReb: 3.66,         // rebanada
  salchichaPorcion: 5.5/2,// media porción aprox
  salsaBase20ml: 0.5,     // mayo/catsup/mostaza
  salsaExtra10ml: 5,      // precio al cliente; costo marginal estimado (editable) 
  bote1oz: 0.6            // si se usa empaque porcionado
};

export const SAUCE_LOOKUP = Object.fromEntries(SAUCES.map(s=>[s.id,s.name]));
export const EXTRA_LOOKUP = Object.fromEntries(EXTRAS.map(e=>[e.id,e.name]));
