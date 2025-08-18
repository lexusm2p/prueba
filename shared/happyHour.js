import { getSettings, setSettings } from './db.js';
export async function isHappyHour(){ const s = await getSettings(); return !!s.hhActive; }
export async function startHappyHour(minutes=60){ const endAt = Date.now() + minutes*60000; await setSettings({ hhActive:true, hhEndAt:endAt }); }
export async function stopHappyHour(){ await setSettings({ hhActive:false, hhEndAt:null }); }
export function readTimer(msLeft){
  const m = Math.max(0,Math.floor(msLeft/60000));
  const s = Math.max(0,Math.floor((msLeft%60000)/1000));
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
