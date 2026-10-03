/* Форматирование для интерфейса: деньги в млн ₽ → «млн / млрд / трлн ₽», доллары, проценты, даты, склонения. */
import { MONTHS, MONTHS_GEN, MONTHS_PREP, MONTHS_SHORT, yearOf, monthOf } from "../sim/util.js";

const NB = " ";
const nf0 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const minus = (s) => s.replace("-", "−");

export const num = (x, d = 0) => minus((d === 0 ? nf0 : d === 1 ? nf1 : nf2).format(Number.isFinite(x) ? x : 0));

/* x — млн ₽ */
export function rub(x, opts = {}) {
  if (!Number.isFinite(x)) x = 0;
  const a = Math.abs(x), s = x < 0 ? "−" : opts.sign && x > 0 ? "+" : "";
  const cur = opts.noCur ? "" : `${NB}₽`;
  if (a >= 1e6) return `${s}${nf2.format(a / 1e6)}${NB}трлн${cur}`;
  if (a >= 1000) return `${s}${nf1.format(a / 1000)}${NB}млрд${cur}`;
  if (a >= 10 || a === 0) return `${s}${nf0.format(a)}${NB}млн${cur}`;
  return `${s}${nf1.format(a)}${NB}млн${cur}`;
}
/* компактно для плиток и осей: «1,2 трлн», «345 млрд» */
export function rubShort(x) {
  const a = Math.abs(x), s = x < 0 ? "−" : "";
  if (a >= 1e6) return `${s}${nf2.format(a / 1e6)}${NB}трлн`;
  if (a >= 1e5) return `${s}${nf0.format(a / 1000)}${NB}млрд`;
  if (a >= 1000) return `${s}${nf1.format(a / 1000)}${NB}млрд`;
  return `${s}${nf0.format(a)}${NB}млн`;
}
/* x — млн $ */
export function usd(x) {
  const a = Math.abs(x), s = x < 0 ? "−" : "";
  if (a >= 1000) return `${s}$${nf2.format(a / 1000)}${NB}млрд`;
  if (a >= 10) return `${s}$${nf0.format(a)}${NB}млн`;
  return `${s}$${nf1.format(a)}${NB}млн`;
}
const CUR_SIGN = { USD: "$", EUR: "€", CNY: "¥", INR: "₹", AED: "AED ", RUB: "" };
/* сумма в валюте контракта (млн единиц) */
export function money(cur, x) {
  if (cur === "RUB") return rub(x);
  const a = Math.abs(x), s = x < 0 ? "−" : "";
  const v = a >= 1000 ? `${nf2.format(a / 1000)}${NB}млрд` : a >= 10 ? `${nf0.format(a)}${NB}млн` : `${nf1.format(a)}${NB}млн`;
  return `${s}${CUR_SIGN[cur] || ""}${v}`;
}
export const pct = (x, d = 0) => `${minus((d ? nf1 : nf0).format(x * 100))}${NB}%`;
export const pp = (x, d = 1) => `${minus(nf1.format(x))}${NB}%`;
export const date = (t) => `${MONTHS[monthOf(t)]} ${yearOf(t)}`;
export const dateCap = (t) => { const s = date(t); return s[0].toUpperCase() + s.slice(1); };
export const dateGen = (t) => `${MONTHS_GEN[monthOf(t)]} ${yearOf(t)}`;
export const datePrep = (t) => `${MONTHS_PREP[monthOf(t)]} ${yearOf(t)}`;
export const dateShort = (t) => `${MONTHS_SHORT[monthOf(t)]}${NB}${String(yearOf(t)).slice(2)}`;
export function plural(n, forms) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}
export const months = (n) => `${n}${NB}${plural(n, ["месяц", "месяца", "месяцев"])}`;
export const people = (n) => `${num(n)}${NB}чел.`;
export const units = (n, unit = "шт.") => `${num(n)}${NB}${unit}`;
export const tsd = (x) => `${num(x)}${NB}тыс.${NB}₽`;
