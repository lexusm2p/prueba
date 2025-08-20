// lib/recipes.js
export const RECIPES = [
  { id:'ajo-habanero', name:'Aderezo de ajo habanero', versiones:[
    { ml:200, ingredientes:[
      {i:'Habanero (sin cola)', q:12.5, u:'g'},
      {i:'Ajo frito', q:15, u:'g'},
      {i:'Queso crema', q:25, u:'g'},
      {i:'Mayonesa', q:100, u:'ml'},
      {i:'Sal', q:1, u:'g'}
    ], pasos:['Freír el ajo','Licuar con habanero, queso crema y mayonesa','Ajustar sal','Refrigerar 12h'] }
  ]},
  { id:'chipotle', name:'Aderezo chipotle', versiones:[
    { ml:200, ingredientes:[
      {i:'Chipotle', q:25, u:'g'},
      {i:'Queso crema', q:25, u:'g'},
      {i:'Mayonesa', q:100, u:'ml'},
      {i:'Pimienta', q:1, u:'g'},
      {i:'Sal', q:1, u:'g'}
    ], pasos:['Licuar todo hasta cremoso','Refrigerar 12h'] }
  ]},
  { id:'chimichurri', name:'Salsa chimichurri', versiones:[
    { ml:200, ingredientes:[
      {i:'Chile de árbol', q:5, u:'pzas'},
      {i:'Ajo', q:2.5, u:'pzas'},
      {i:'Mostaza', q:0.5, u:'cda'},
      {i:'Huevo', q:1, u:'pza'},
      {i:'Perejil', q:8, u:'g'},
      {i:'Vinagre', q:65, u:'ml'},
      {i:'Aceite', q:110, u:'ml'},
      {i:'Sal', q:2, u:'g'}
    ], pasos:['Triturar chile y ajo','Emulsionar con huevo, vinagre, aceite','Añadir mostaza, perejil y sal'] }
  ]},
  { id:'cheddar', name:'Aderezo cheddar', versiones:[
    { ml:500, ingredientes:[
      {i:'Mantequilla', q:50, u:'g'},
      {i:'Harina', q:50, u:'g'},
      {i:'Leche', q:500, u:'ml'},
      {i:'Queso cheddar', q:200, u:'g'},
      {i:'Sal', q:2, u:'g'},
      {i:'Pimienta', q:1, u:'g'}
    ], pasos:['Hacer roux con mantequilla y harina','Incorporar leche','Fundir cheddar','Sazonar'] }
  ]},
  { id:'mostaza-dulce', name:'Aderezo de mostaza dulce', versiones:[
    { ml:200, ingredientes:[
      {i:'Mostaza amarilla', q:60, u:'ml'},
      {i:'Miel', q:40, u:'ml'},
      {i:'Mayonesa', q:80, u:'ml'},
      {i:'Vinagre', q:20, u:'ml'}
    ], pasos:['Mezclar todo y reposar 6h'] }
  ]},
  { id:'jalapeño', name:'Aderezo de jalapeño rostizado', versiones:[
    { ml:200, ingredientes:[
      {i:'Jalapeño', q:60, u:'g'},
      {i:'Ajo', q:5, u:'g'},
      {i:'Mayonesa', q:120, u:'ml'},
      {i:'Limón', q:10, u:'ml'}
    ], pasos:['Rostizar jalapeño y ajo','Licuar con mayonesa y limón'] }
  ]},
  { id:'curry', name:'Aderezo curry suave', versiones:[
    { ml:200, ingredientes:[
      {i:'Pasta de curry suave', q:10, u:'g'},
      {i:'Mayonesa', q:170, u:'ml'},
      {i:'Miel', q:20, u:'ml'}
    ], pasos:['Mezclar y reposar 6h'] }
  ]},
  { id:'secreta', name:'Salsa secreta Seven', versiones:[
    { ml:200, ingredientes:[
      {i:'Base mayo', q:140, u:'ml'},
      {i:'Pepinillo picado', q:20, u:'g'},
      {i:'Catsup', q:20, u:'ml'},
      {i:'Mostaza', q:10, u:'ml'},
      {i:'Pimentón', q:2, u:'g'}
    ], pasos:['Integrar y reposar 12h'] }
  ]},
];
