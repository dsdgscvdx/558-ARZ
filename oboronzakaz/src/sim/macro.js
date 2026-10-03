/* Макроэкономика: инфляция, ключевая ставка ЦБ (8 заседаний в год), курсы валют, нефть, санкции, рынок труда. */
import { gauss, clamp, uni, monthOf, yearOf, r2 } from "./util.js";

export const CURRENCIES = { RUB: "₽", USD: "$", EUR: "€", CNY: "¥", INR: "₹", AED: "AED" };
export const CUR_NAME = { RUB: "рубли", USD: "доллары США", EUR: "евро", CNY: "юани", INR: "индийские рупии", AED: "дирхамы ОАЭ" };
// месяцы заседаний ЦБ по ключевой ставке: февраль, март, апрель, июнь, июль, сентябрь, октябрь, декабрь
export const CB_MONTHS = [1, 2, 3, 5, 6, 8, 9, 11];

export function initMacro(s) {
  const m = {
    usd: s.usd, eurusd: s.eurusd, usdcny: s.usdcny, usdinr: s.usdinr, usdaed: s.usdaed,
    key: s.key, infl: s.infl, cpi: 1, matIdx: 1, wageIdx: 1, usdInfl: 1,
    oil: s.oil, sanc: s.sanc, ekbPrem: s.ekbPrem, labor: s.labor, gozBudget: s.gozBudget,
    realRate: s.realRate, mandSale: s.mandSale, inflTarget: 5.5, oilMean: 64, shockFx: 0,
  };
  syncRates(m);
  return m;
}

/* ₽ за единицу валюты */
export function syncRates(m) {
  m.eur = m.usd * m.eurusd;
  m.cny = m.usd / m.usdcny;
  m.inr = m.usd / m.usdinr;
  m.aed = m.usd / m.usdaed;
}
export function rate(G, cur) {
  const m = G.m;
  switch (cur) {
    case "USD": return m.usd;
    case "EUR": return m.eur;
    case "CNY": return m.cny;
    case "INR": return m.inr;
    case "AED": return m.aed;
    default: return 1;
  }
}
export const toRub = (G, cur, amt) => amt * rate(G, cur);
export const usdToCur = (G, cur, usd) => (usd * G.m.usd) / rate(G, cur);

export function stepMacro(G) {
  const m = G.m, mo = monthOf(G.t), yr = yearOf(G.t);
  const nz = G._fc ? 0 : 1;   // в прогнозе — без шума
  // нефть: возврат к среднему с шумом
  const oilPrev = m.oil;
  m.oil = clamp(m.oil + 0.12 * (m.oilMean - m.oil) + gauss(G) * 3.2 * nz, 30, 120);
  // инфляция: инерция, давление санкций и курса
  const fxPush = m.shockFx * 6;
  m.infl = clamp(m.infl + 0.07 * (m.inflTarget - m.infl) + gauss(G) * 0.22 * nz + fxPush * 0.15, 2.5, 22);
  m.shockFx *= 0.6;
  const mi = m.infl / 100 / 12;
  m.cpi *= 1 + mi;
  m.matIdx *= 1 + mi + gauss(G) * 0.004 * nz + (m.oil - oilPrev) / 2000;
  m.usdInfl *= 1 + 0.025 / 12;
  // реальная ставка ЦБ постепенно снижается к нейтральной
  m.realRate = Math.max(3, m.realRate - 0.035);
  if (CB_MONTHS.includes(mo)) {
    const target = clamp(m.infl + m.realRate, 6, 25);
    let d = clamp(target - m.key, -2, 2);
    d = Math.round(d * 2) / 2;
    if (Math.abs(d) >= 0.5) {
      m.key = clamp(m.key + d, 5, 25);
      G._cb = d;   // для журнала
    } else G._cb = 0;
  }
  // курс доллара: инфляционный дрейф, нефть, шоки
  const drift = (m.infl - 2.5) / 100 / 12;
  const oilEff = -0.35 * Math.log(m.oil / oilPrev);
  const noise = gauss(G) * 0.022 * nz;
  m.usd = clamp(m.usd * Math.exp(drift + oilEff + noise), 55, 220);
  m.eurusd = clamp(m.eurusd * Math.exp(gauss(G) * 0.012 * nz), 0.95, 1.35);
  m.usdcny = clamp(m.usdcny * Math.exp(gauss(G) * 0.004 * nz), 6.6, 7.6);
  m.usdinr = clamp(m.usdinr * Math.exp(0.02 / 12 + gauss(G) * 0.006 * nz), 80, 110);
  syncRates(m);
  // санкционная премия к импортной ЭКБ постепенно снижается (налаживается параллельный импорт)
  m.ekbPrem = clamp(m.ekbPrem - 0.004 + (m.sanc - 70) / 4000, 1.15, 2.8);
  m.sanc = clamp(m.sanc + gauss(G) * 0.8 * nz, 30, 100);
  // рынок труда: дефицит кадров нарастает
  m.labor = clamp(m.labor - 0.0012 + gauss(G) * 0.01 * nz, 0.55, 1.2);
  // зарплаты в регионах растут быстрее инфляции, пока рынок труда перегрет
  const realWage = clamp(0.045 - (yr - 2026) * 0.003, 0.015, 0.05) + (1 - m.labor) * 0.03;
  m.wageIdx *= 1 + (m.infl / 100 + realWage) / 12;
  // бюджет ГОЗ зависит от нефтегазовых доходов
  m.gozBudget = clamp(m.gozBudget + 0.04 * ((m.oil - 55) / 30) / 12 + gauss(G) * 0.005 * nz, 0.7, 1.3);
  return m;
}

/* Процентная ставка по кредиту */
export function loanRate(G, l) {
  if (l.kind === "goz" || l.kind === "state") return l.rate;
  return G.m.key + (l.spread || 3);
}

export function fxShock(G, pct) {
  G.m.usd = clamp(G.m.usd * (1 + pct), 55, 220);
  G.m.shockFx += pct;
  syncRates(G.m);
}

export { r2, uni };
