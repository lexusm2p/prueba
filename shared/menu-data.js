// /shared/menu-data.js
// Alineado 1:1 con lib/menu.js

/* ===================== BURGERS (grandes) ===================== */
export const MENU = [
  { id:'starter',   name:'Starter Burger',      price:47, base:['Pan','Carne 85g','Queso amarillo','Queso blanco','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup','Mostaza'] },
  { id:'koopa',     name:'Koopa Crunch',        price:57, base:['Pan','Carne 85g','Queso blanco','Piña','Tocino','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup','Mostaza'] },
  { id:'fatality',  name:'Fatality Flame',      price:67, base:['Pan','Carne 85g','Salsa cheddar','Tocino','Salsa habanero','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup','Mostaza'] },
  { id:'megabyte',  name:'Mega Byte',           price:77, base:['Pan','Carne 85g','Salsa cheddar','Queso blanco','Tocino','Salchicha','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup','Mostaza'] },
  { id:'hadouken',  name:'Hadouken',            price:77, base:['Pan','Carne 85g','Queso blanco','Queso amarillo','Salchicha','Aderezo chipotle','Lechuga','Jitomate','Cebolla','Catsup','Mostaza'] },
  { id:'nintendo',  name:'Nintendo Nostalgia',  price:67, base:['Pan','Carne 85g','Queso blanco','Piña','Jamón','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup','Mostaza'] },
  { id:'finalboss', name:'Final Boss Burger',   price:97, base:['Pan','Carne 85g','Salsa cheddar','Queso blanco','Queso amarillo','Tocino','Jamón','Salchicha','Piña','Salsa habanero','Aderezo chipotle','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup','Mostaza'] },
];

/* ========================= MINIS ========================= */
export const MINIS = [
  { id:'starter-mini',   name:'Starter Mini',    price:27, isMini:true, base:['Pan mini','Carne 45g','Queso amarillo','Queso blanco','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup','Mostaza'] },
  { id:'koopa-mini',     name:'Koopa Mini',      price:27, isMini:true, base:['Pan mini','Carne 45g','Queso blanco','Piña','Tocino','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup','Mostaza'] },
  { id:'fatality-mini',  name:'Fatality Mini',   price:37, isMini:true, base:['Pan mini','Carne 45g','Salsa cheddar','Tocino','Salsa habanero','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup','Mostaza'] },
  { id:'megabyte-mini',  name:'Mega Byte Mini',  price:37, isMini:true, base:['Pan mini','Carne 45g','Salsa cheddar','Queso blanco','Tocino','Salchicha','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup','Mostaza'] },
  { id:'hadouken-mini',  name:'Hadouken Mini',   price:37, isMini:true, base:['Pan mini','Carne 45g','Queso blanco','Queso amarillo','Salchicha','Aderezo chipotle','Lechuga','Jitomate','Cebolla','Catsup','Mostaza'] },
  { id:'nintendo-mini',  name:'Nintendo Mini',   price:37, isMini:true, base:['Pan mini','Carne 45g','Queso blanco','Piña','Jamón','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup','Mostaza'] },
  { id:'finalboss-mini', name:'Final Boss Mini', price:47, isMini:true, base:['Pan mini','Carne 45g','Salsa cheddar','Queso blanco','Queso amarillo','Tocino','Jamón','Salchicha','Piña','Salsa habanero','Aderezo chipotle','Lechuga','Jitomate','Cebolla','Mayonesa','Catsup','Mostaza'] },
];

/* ====================== DOGS / SNACKS ====================== */
/** Nuevo producto: vendible y también usado como plantilla de regalo */
export const DOGS = [
  {
    id: 'powerdog-mini',
    name: 'PowerDog Mini',
    price: 27,                // venta individual
    isMini: true,
    isHotdog: true,
    category: 'snacks',
    base: [
      'Pan mini', 'Salchicha',
      'Queso blanco', 'Aderezo cheddar',
      'Cebolla blanca', 'Salsa chimichurri'
    ],
    image: 'powerdog.png',    // sprite pixel-art (añádelo a /assets/ o donde corresponda)
    sounds: { add: 'combo-unlocked.mp3' } // opcional
  }
];

/* ======================== ADEREZOS ======================== */
export const SAUCES = [
  { id:'ajo-habanero',   name:'Aderezo de ajo habanero',       price:5 },
  { id:'chipotle',       name:'Aderezo chipotle',               price:5 },
  { id:'chimichurri',    name:'Salsa chimichurri',              price:5 },
  { id:'cheddar',        name:'Aderezo cheddar',                price:5 },
  { id:'mostaza-dulce',  name:'Aderezo de mostaza dulce',       price:5 },
  { id:'jalapeño',       name:'Aderezo de jalapeño rostizado',  price:5 },
  { id:'curry',          name:'Aderezo curry suave',            price:5 },
  { id:'secreta',        name:'Salsa secreta Seven',            price:5 },
];

/* ========================= EXTRAS ========================= */
export const EXTRAS = [
  { id:'tocino',         name:'Tocino',                price:6 },
  { id:'piña',           name:'Piña',                  price:5 },
  { id:'jamon',          name:'Jamón',                 price:5 },
  { id:'salchicha',      name:'Salchicha',             price:8 },
  { id:'cebolla-caram',  name:'Cebolla caramelizada',  price:5 },
  { id:'carne-extra',    name:'Carne extra 85g',       price:20 }, // extra para hamburguesa grande
];

/* ===================== PROMOS / REGALOS ===================== */
/** Regla de desbloqueo del regalo por ticket */
export const GIFT_RULES = {
  threshold: 117,           // monto para desbloquear
  giftProductId: 'powerdog-mini',
  autoPrompt: true,         // mostrar modal automático al rebasar
  sound: 'combo-unlocked.mp3',
  // Texto sugerido para el modal (UI la puede ignorar y usar su propio copy)
  modal: {
    title: '🎉 ¡Logro desbloqueado!',
    message: 'Superaste $117. ¿Quieres reclamar tu PowerDog Mini gratis?',
    accept: '✅ Sí, agregar',
    reject: '❌ No, gracias'
  }
};

/** Plantilla del ítem regalo (línea de carrito con precio 0) */
export const GIFT_TEMPLATES = {
  'powerdog-mini': {
    id: 'powerdog-mini',
    name: 'PowerDog Mini (Regalo)',
    price: 0,
    isGift: true,
    isMini: true,
    isHotdog: true,
    base: [
      'Pan mini', 'Salchicha',
      'Queso blanco', 'Aderezo cheddar',
      'Cebolla blanca', 'Salsa chimichurri'
    ],
    image: 'powerdog.png'
  }
};

/* ============== Sugerencias para la barra derecha (opcional) ============== */
export const SUGGESTIONS = [
  { ref:'starter-mini',  label:'Starter Mini',  price:27 },
  { ref:'koopa-mini',    label:'Koopa Mini',    price:33 },
  { ref:'fatality-mini', label:'Fatality Mini', price:37 },
  { ref:'powerdog-mini', label:'PowerDog Mini', price:27, badge:'🆕' } // nuevo
];
