
// shared/menu.js
export const ADEREZOS = [
  {id:'cheddar', name:'Aderezo Cheddar', price:5},
  {id:'chipotle', name:'Aderezo Chipotle', price:5},
  {id:'habanero', name:'Aderezo Habanero', price:5},
  {id:'chimichurri', name:'Salsa Chimichurri', price:5},
  {id:'mostaza_dulce', name:'Mostaza dulce', price:5},
  {id:'jalapeno', name:'Jalapeño rostizado', price:5},
  {id:'curry', name:'Curry suave', price:5},
  {id:'secreta', name:'Salsa Secreta Seven', price:5},
];
export const EXTRAS = [
  {id:'tocino', name:'Tocino', price:6},
  {id:'pina', name:'Piña', price:5},
  {id:'jamon', name:'Jamón', price:5},
  {id:'salchicha', name:'Salchicha', price:8},
  {id:'queso_blanco', name:'Queso blanco', price:5}
];
export const REMOVIBLES = ['Lechuga','Jitomate','Cebolla','Mayonesa','Cátsup','Mostaza'];

export const BURGERS = [
  {
    id:'starter', name:'Starter Burger', price:47, suggested:'Mostaza dulce',
    ingredients:['Pan','Carne 85 g','Queso amarillo','Queso blanco','Lechuga','Jitomate','Cebolla','Mayonesa','Cátsup','Mostaza'],
    costInternal: 28.1
  },
  {
    id:'koopa', name:'Koopa Crunch', price:57, suggested:'Cheddar',
    ingredients:['Pan','Carne','Queso blanco','Piña','Tocino','Lechuga','Jitomate','Cebolla','Mayonesa','Cátsup','Mostaza'],
    costInternal: 34.0
  },
  {
    id:'flame', name:'Fatality Flame', price:67, suggested:'Habanero',
    ingredients:['Pan','Carne','Salsa Cheddar','Tocino','Salsa habanero','Lechuga','Jitomate','Cebolla','Mayonesa','Cátsup','Mostaza'],
    costInternal: 39.5
  },
  {
    id:'mega', name:'Mega Byte', price:77, suggested:'Cheddar',
    ingredients:['Pan','Carne','Salsa Cheddar','Queso blanco','Tocino','Salchicha','Lechuga','Jitomate','Cebolla','Mayonesa','Cátsup'],
    costInternal: 45.2
  },
  {
    id:'hadouken', name:'Hadouken', price:77, suggested:'Chipotle',
    ingredients:['Pan','Carne','Queso blanco','Queso amarillo','Salchicha','Aderezo chipotle','Lechuga','Jitomate','Cebolla'],
    costInternal: 44.3
  },
  {
    id:'nostalgia', name:'Nintendo Nostalgia', price:67, suggested:'Mostaza dulce',
    ingredients:['Pan','Carne','Queso blanco','Piña','Jamón','Lechuga','Jitomate','Cebolla','Mayonesa','Cátsup','Mostaza'],
    costInternal: 38.9
  },
  {
    id:'boss', name:'Final Boss Burger', price:97, suggested:'Cheddar + Habanero',
    ingredients:['Pan','Carne','Salsa Cheddar','Queso blanco','Queso amarillo','Tocino','Jamón','Salchicha','Piña','Salsa habanero','Aderezo chipotle'],
    costInternal: 56.8
  }
];
