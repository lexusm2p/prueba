// lib/roles.js
export function openLogin(){
  const pin = prompt('PIN (Mesero=1111, Cocina=2222, Admin=9999):');
  if(!pin) return;
  const map = { '1111':'mesero', '2222':'cocina', '9999':'admin' };
  const role = map[pin.trim()];
  if(!role){ alert('PIN inválido'); return; }
  localStorage.setItem('role', role);
  // redirigir
  if(role==='mesero') location.href = './mesero/';
  if(role==='cocina') location.href = './cocina/';
  if(role==='admin') location.href = './admin/';
}
export function logoutRole(){
  localStorage.removeItem('role');
  alert('Sesión cerrada');
}
