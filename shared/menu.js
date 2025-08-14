
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
  {id:'cebolla_caram', name:'Cebolla caramelizada', price:5}
];
export const REMOVIBLES = ['Lechuga','Jitomate','Cebolla','Mayonesa','Cátsup','Mostaza'];
export const BURGERS = [
  { id:'starter', name:'Starter Burger', price:47, suggestedBase:'Mostaza dulce',
    ingredients:['Pan','Carne 85 g','Queso amarillo','Queso blanco','Lechuga','Jitomate','Cebolla','Mayonesa','Cátsup','Mostaza'],
    recommended:['chimichurri','cheddar']
  },
  { id:'koopa', name:'Koopa Crunch', price:57, suggestedBase:'Cheddar',
    ingredients:['Pan','Carne','Queso blanco','Piña','Tocino','Lechuga','Jitomate','Cebolla','Mayonesa','Cátsup','Mostaza'],
    recommended:['chipotle','curry']
  },
  { id:'flame', name:'Fatality Flame', price:67, suggestedBase:'Habanero',
    ingredients:['Pan','Carne','Salsa Cheddar','Tocino','Salsa habanero','Lechuga','Jitomate','Cebolla','Mayonesa','Cátsup','Mostaza'],
    recommended:['chimichurri','mostaza_dulce']
  },
  { id:'mega', name:'Mega Byte', price:77, suggestedBase:'Cheddar',
    ingredients:['Pan','Carne','Salsa Cheddar','Queso blanco','Tocino','Salchicha','Lechuga','Jitomate','Cebolla','Mayonesa','Cátsup'],
    recommended:['chipotle','curry']
  },
  { id:'hadouken', name:'Hadouken', price:77, suggestedBase:'Chipotle',
    ingredients:['Pan','Carne','Queso blanco','Queso amarillo','Salchicha','Aderezo chipotle','Lechuga','Jitomate','Cebolla'],
    recommended:['jalapeno','mostaza_dulce']
  },
  { id:'nostalgia', name:'Nintendo Nostalgia', price:67, suggestedBase:'Mostaza dulce',
    ingredients:['Pan','Carne','Queso blanco','Piña','Jamón','Lechuga','Jitomate','Cebolla','Mayonesa','Cátsup','Mostaza'],
    recommended:['chimichurri','cheddar']
  },
  { id:'boss', name:'Final Boss Burger', price:97, suggestedBase:'Cheddar + Habanero + Chipotle',
    ingredients:['Pan','Carne','Salsa Cheddar','Queso blanco','Queso amarillo','Tocino','Jamón','Salchicha','Piña','Salsa habanero','Aderezo chipotle'],
    recommended:['chimichurri','curry']
  }
];
