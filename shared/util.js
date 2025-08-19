export const $ = s=>document.querySelector(s);
export const $$ = s=>[...document.querySelectorAll(s)];
export const money = n => `$${Number(n).toFixed(0)}`;
export const sleep = ms=>new Promise(r=>setTimeout(r,ms));
