/* Общие утилиты интерфейса и случайных чисел */
export const rnd = (a, b) => a + Math.random() * (b - a);
export const rint = (a, b) => Math.floor(rnd(a, b + 1));
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const fmt = (n) => Math.round(n).toLocaleString("ru-RU") + " руб.";
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export const $ = (id) => document.getElementById(id);
