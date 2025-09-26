import { toast, beep } from './notify.js';
if (typeof window !== 'undefined') {
  window.toast = window.toast || toast;
  window.beep  = window.beep  || beep;
}
export { toast, beep };
