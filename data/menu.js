
// data/menu.js
export const BURGERS = [
  { id:'starter', name:'Starter Burger', price:47, ingredients:['Pan','Carne 85g','Queso amarillo','Queso blanco','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup','Mostaza'], suggested:'Mostaza dulce' },
  { id:'koopa', name:'Koopa Crunch', price:57, ingredients:['Pan','Carne','Queso blanco','Piña','Tocino','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup','Mostaza'], suggested:'Cheddar' },
  { id:'fatality', name:'Fatality Flame', price:67, ingredients:['Pan','Carne','Salsa Cheddar','Tocino','Salsa Habanero','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup','Mostaza'], suggested:'Habanero' },
  { id:'mega', name:'Mega Byte', price:77, ingredients:['Pan','Carne','Salsa Cheddar','Queso blanco','Tocino','Salchicha','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup'], suggested:'Cheddar' },
  { id:'hadouken', name:'Hadouken', price:77, ingredients:['Pan','Carne','Queso blanco','Queso amarillo','Salchicha','Aderezo chipotle','Lechuga','Jitomate','Cebolla'], suggested:'Chipotle' },
  { id:'nintendo', name:'Nintendo Nostalgia', price:67, ingredients:['Pan','Carne','Queso blanco','Piña','Jamón','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup','Mostaza'], suggested:'Mostaza dulce' },
  { id:'final', name:'Final Boss Burger', price:97, ingredients:['Pan','Carne','Salsa Cheddar','Queso blanco','Queso amarillo','Tocino','Jamón','Salchicha','Piña','Salsa Habanero','Aderezo chipotle'], suggested:'Cheddar' }
];

export const MINIS = [
  { id:'mini_starter', name:'Starter Mini', price:27, base:'Starter Burger' },
  { id:'mini_koopa', name:'Koopa Crunch Mini', price:27, base:'Koopa Crunch' },
  { id:'mini_fatality', name:'Fatality Flame Mini', price:37, base:'Fatality Flame' },
  { id:'mini_mega', name:'Mega Byte Mini', price:37, base:'Mega Byte' },
  { id:'mini_hadouken', name:'Hadouken Mini', price:37, base:'Hadouken' },
  { id:'mini_nintendo', name:'Nintendo Nostalgia Mini', price:37, base:'Nintendo Nostalgia' },
  { id:'mini_final', name:'Final Boss Mini', price:47, base:'Final Boss Burger' }
];

export const COMBOS = [
  { id:'combo_7_minis', name:'Combo 7 Minis', desc:'Las 7 versiones mini', price:167 }
];

export const ADEREZOS = [
  'Aderezo Cheddar','Aderezo Chipotle','Aderezo Habanero','Salsa Chimichurri','Mostaza dulce','Jalapeño rostizado','Curry suave','Salsa Secreta Seven'
];

export const EXTRAS = [
  {name:'Piña', price:5},
  {name:'Tocino', price:6},
  {name:'Jamón', price:5},
  {name:'Salchicha', price:8},
  {name:'Queso Cheddar extra', price:3} // opcional como adición
];

export function priceOfAderezo(){ return 5; }
