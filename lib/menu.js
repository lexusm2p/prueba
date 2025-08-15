// lib/menu.js
export const ADEREZOS = [
  { id:'ched', name:'Aderezo Cheddar', price:5 },
  { id:'chip', name:'Aderezo Chipotle', price:5 },
  { id:'haba', name:'Aderezo Habanero', price:5 },
  { id:'chimi', name:'Salsa Chimichurri', price:5 },
  { id:'moss', name:'Mostaza dulce', price:5 },
  { id:'jala', name:'Jalapeño rostizado', price:5 },
  { id:'curry', name:'Curry suave', price:5 },
  { id:'s7', name:'Salsa Secreta Seven', price:5 },
];

export const EXTRAS = [
  { id:'pina', name:'Piña', price:5 },
  { id:'toci', name:'Tocino', price:6 },
  { id:'jamo', name:'Jamón', price:5 },
  { id:'salc', name:'Salchicha', price:8 },
  { id:'cebc', name:'Cebolla caramelizada', price:5 },
];

export const BIG = [
  { id:'starter', name:'Starter Burger', price:47, ingredients:'Pan, Carne, Queso amarillo, Queso blanco, Lechuga, Jitomate, Cebolla, Mayonesa, Catsup, Mostaza', suggest:['chip','haba'] },
  { id:'koopa', name:'Koopa Crunch', price:57, ingredients:'Pan, Carne, Queso blanco, Piña, Tocino, Lechuga, Jitomate, Cebolla, Mayonesa, Catsup, Mostaza', suggest:['moss','chimi'] },
  { id:'flame', name:'Fatality Flame', price:67, ingredients:'Pan, Carne, Salsa Cheddar, Tocino, Salsa habanero, Lechuga, Jitomate, Cebolla, Mayonesa, Catsup, Mostaza', suggest:['chip'] },
  { id:'mega', name:'Mega Byte', price:77, ingredients:'Pan, Carne, Salsa Cheddar, Queso blanco, Tocino, Salchicha, Lechuga, Jitomate, Cebolla, Mayonesa, Catsup', suggest:['ched'] },
  { id:'hado', name:'Hadouken', price:77, ingredients:'Pan, Carne, Queso blanco, Queso amarillo, Salchicha, Aderezo chipotle, Lechuga, Jitomate, Cebolla', suggest:['chip','curry'] },
  { id:'ninten', name:'Nintendo Nostalgia', price:67, ingredients:'Pan, Carne, Queso blanco, Piña, Jamón, Lechuga, Jitomate, Cebolla, Mayonesa, Catsup, Mostaza', suggest:['moss','chimi'] },
  { id:'boss', name:'Final Boss Burger', price:97, ingredients:'Pan, Carne, Salsa Cheddar, Queso blanco, Queso amarillo, Tocino, Jamón, Salchicha, Piña, Salsa habanero, Aderezo chipotle', suggest:['ched','chip'] },
];

export const MINI = [
  { id:'m-starter', name:'Starter Mini', price:27, ref:'starter' },
  { id:'m-koopa', name:'Koopa Crunch Mini', price:27, ref:'koopa' },
  { id:'m-flame', name:'Fatality Mini', price:37, ref:'flame' },
  { id:'m-mega', name:'Mega Byte Mini', price:37, ref:'mega' },
  { id:'m-hado', name:'Hadouken Mini', price:37, ref:'hado' },
  { id:'m-nin', name:'Nintendo Mini', price:37, ref:'ninten' },
  { id:'m-boss', name:'Final Boss Mini', price:47, ref:'boss' },
];

export const COMBO3_MINIS_PRICE = 77;
