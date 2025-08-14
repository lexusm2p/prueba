
// shared/auth.js
import { getUsers } from './backend.js';
export function currentUser() {
  try { return JSON.parse(localStorage.getItem('auth_user')); } catch { return null; }
}
export function loginByPin(pin) {
  const user = getUsers().find(u => u.pin === pin);
  if (user) { localStorage.setItem('auth_user', JSON.stringify(user)); return user; }
  return null;
}
export function logout(){ localStorage.removeItem('auth_user'); }
