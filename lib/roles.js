// lib/roles.js — PINs y rutas por rol
export function verifyPin(pin){
  const map = {
    '1111': {role:'MESERO', redirect:'../mesero/'},
    '2222': {role:'COCINA', redirect:'../cocina/'},
    '9999': {role:'ADMIN',  redirect:'../admin/'}
  };
  return map[pin] || null;
}
