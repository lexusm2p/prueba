// ESM: vuelve global tus exports (para que coexista con legacy sin duplicar lógica)
import * as DB from './db.js';
import { toast, beep } from './notify.js';

// Exponer globales (útil para utilidades y para que el mismo UI pueda llamarlas sin import)
if (typeof window !== 'undefined') {
  window.DB = window.DB || DB;
  window.toast = window.toast || toast;
  window.beep  = window.beep  || beep;
}

// Re-export para apps modernas
export * from './db.js';
