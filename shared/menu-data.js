
export const BURGERS = [
  { id:'starter', name:'Starter Burger', price:47, ingredients:['Pan','Carne','Queso amarillo','Queso blanco','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup','Mostaza'], sauceSuggestion:null },
  { id:'koopa', name:'Koopa Crunch', price:57, ingredients:['Pan','Carne','Queso blanco','Piña','Tocino','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup','Mostaza'], sauceSuggestion:null },
  { id:'fatality', name:'Fatality Flame', price:67, ingredients:['Pan','Carne','Salsa Cheddar','Tocino','Salsa Habanero','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup','Mostaza'], sauceSuggestion:'Habanero' },
  { id:'megabyte', name:'Mega Byte', price:77, ingredients:['Pan','Carne','Salsa Cheddar','Queso blanco','Tocino','Salchicha','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup','Mostaza'], sauceSuggestion:'Cheddar' },
  { id:'hadouken', name:'Hadouken', price:77, ingredients:['Pan','Carne','Queso blanco','Queso amarillo','Salchicha','Aderezo Chipotle','Lechuga','Jitomate','Cebolla','Catsup','Mostaza'], sauceSuggestion:'Chipotle' },
  { id:'nintendo', name:'Nintendo Nostalgia', price:67, ingredients:['Pan','Carne','Queso blanco','Piña','Jamón','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup','Mostaza'], sauceSuggestion:null },
  { id:'finalboss', name:'Final Boss Burger', price:97, ingredients:['Pan','Carne','Salsa Cheddar','Queso blanco','Queso amarillo','Tocino','Jamón','Salchicha','Piña','Salsa Habanero','Aderezo Chipotle','Lechuga','Jitomate','Cebolla','Catsup','Mayonesa','Mostaza'], sauceSuggestion:'Cheddar' }
];

export const MINIS = [
  { id:'starter_m', name:'Starter Mini', price:27, base:'starter' },
  { id:'koopa_m', name:'Koopa Mini', price:27, base:'koopa' },
  { id:'fatality_m', name:'Fatality Mini', price:37, base:'fatality' },
  { id:'megabyte_m', name:'Mega Byte Mini', price:37, base:'megabyte' },
  { id:'hadouken_m', name:'Hadouken Mini', price:37, base:'hadouken' },
  { id:'nintendo_m', name:'Nintendo Mini', price:37, base:'nintendo' },
  { id:'finalboss_m', name:'Final Boss Mini', price:47, base:'finalboss' }
];

export const EXTRAS_ING = [
  { key:'Tocino', price:6 },
  { key:'Piña', price:5 },
  { key:'Queso amarillo', price:5 },
  { key:'Queso blanco', price:5 },
  { key:'Jamón', price:6 },
  { key:'Salchicha', price:8 },
  { key:'Cebolla caramelizada', price:5 }
];

export const EXTRAS_SAUCES = [
  'Aderezo Chipotle','Salsa Habanero','Salsa Cheddar','Salsa Chimichurri','Mostaza dulce','Jalapeño rostizado','Curry','Salsa Secreta Seven'
];
