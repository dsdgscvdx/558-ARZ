/* Общие помощники движка: детерминированный генератор случайных чисел (его состояние хранится в сохранении),
   арифметика и календарь. Все функции движка получают состояние игры G первым аргументом. */

export function rand(G) {
  // mulberry32
  let t = (G.rng = (G.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const uni = (G, a, b) => a + rand(G) * (b - a);
export const irand = (G, a, b) => Math.floor(uni(G, a, b + 1));
export const chance = (G, p) => rand(G) < p;
export function gauss(G) {
  let u = 0, v = 0;
  while (u === 0) u = rand(G);
  while (v === 0) v = rand(G);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export function pick(G, arr) { return arr[Math.floor(rand(G) * arr.length)]; }
export function pickW(G, items, w) {
  let s = 0;
  for (const it of items) s += Math.max(0, w(it));
  if (s <= 0) return null;
  let r = rand(G) * s;
  for (const it of items) { r -= Math.max(0, w(it)); if (r <= 0) return it; }
  return items[items.length - 1];
}
export function shuffle(G, arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand(G) * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + f(x), 0);
export const r1 = (x) => Math.round(x * 10) / 10;
export const r2 = (x) => Math.round(x * 100) / 100;
export const fin = (x) => (Number.isFinite(x) ? x : 0);

export const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
export const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
export const MONTHS_PREP = ["январе", "феврале", "марте", "апреле", "мае", "июне", "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"];
export const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
export const BASE_YEAR = 2026;
export const yearOf = (t) => BASE_YEAR + Math.floor(t / 12);
export const monthOf = (t) => ((t % 12) + 12) % 12;
export const dateStr = (t) => `${MONTHS[monthOf(t)]} ${yearOf(t)}`;
export const dateShort = (t) => `${MONTHS_SHORT[monthOf(t)]} ${String(yearOf(t)).slice(2)}`;
/* «до конца декабря 2027» */
export const dueStr = (t) => `${MONTHS[monthOf(t)]} ${yearOf(t)}`;

export function nextId(G, prefix = "x") { G.uid = (G.uid || 0) + 1; return `${prefix}${G.uid}`; }
export function digits(G, n) { let s = ""; for (let i = 0; i < n; i++) s += Math.floor(rand(G) * 10); return s; }
