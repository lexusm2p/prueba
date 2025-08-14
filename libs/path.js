// /lib/path.js
export const BASE = location.pathname.includes('/prueba/') ? '/prueba' : '';
export const url = (p) => `${BASE}${p}`;

import { url } from '../lib/path.js';
const menu = await fetch(url('/data/menu.json')).then(r => r.json());
