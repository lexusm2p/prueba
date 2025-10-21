
export const MODE={LEGACY:false,OFFLINE:false,READONLY:false};
export function detectLegacy(){const ua=navigator.userAgent.toLowerCase();const weak=(navigator.deviceMemory&&navigator.deviceMemory<=2)||window.devicePixelRatio<=1.5;const old=ua.includes('ipad')||ua.includes('iphone');return old||weak;}
