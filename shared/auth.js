
// shared/auth.js
// Roles: kiosk (default view, no login), mesero, cocina, admin
export const Auth = {
  get role(){ return localStorage.getItem('sb_role') || 'kiosk'; },
  set role(r){ localStorage.setItem('sb_role', r); },
  get waiter(){ try{return JSON.parse(localStorage.getItem('sb_waiter')||'null')}catch(e){return null} },
  set waiter(w){ localStorage.setItem('sb_waiter', JSON.stringify(w)); },
  logout(){ localStorage.removeItem('sb_role'); localStorage.removeItem('sb_waiter'); location.href = '../kiosk/index.html'; }
}
