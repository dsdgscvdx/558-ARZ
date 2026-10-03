/* Кадры и основные фонды предприятий: зарплаты, текучесть, найм, обучение новичков, износ и ремонт. */
import { ENT } from "../data/enterprises.js";
import { clamp, sum, chance, uni, pick } from "./util.js";
import { spend, plAdd, logF, fmtM } from "./finance.js";

import { eqF, wearF } from "./catalog.js";
export { eqF, wearF };

/* Производственная мощность предприятия в человеко-месяцах */
export function capacity(G, e) {
  const d = ENT[e.id];
  let eff = e.staff;
  for (let i = 0; i < 12; i++) eff -= e.trainees[i] * (1 - (0.4 + (0.6 * i) / 12));
  const bonus = 1 + (G.bonus.prod[d.sector] || 0) + (G.bonus.prod.all || 0) + e.pBonus + (e.prodPerm || 0) - (e.strike > 0 ? 0.25 : 0) - (e.arrears > 0 ? 0.15 : 0);
  const prodF = eqF(e.eq) * wearF(e.wear) * Math.max(0.3, bonus);
  return { cap: Math.max(0, eff) * prodF, eff, prodF };
}
export const wage = (e) => e.wageR * e.rwage;                         // тыс. ₽
export const payroll = (e) => (e.staff * wage(e) * 1.3) / 1000;        // млн ₽ в месяц
export const traineeCount = (e) => sum(e.trainees);
export const attrition = (e) => clamp(0.009 * Math.exp(-3.2 * (e.wageR - 1.08)), 0.0025, 0.05) * (e.arrears > 0 ? 3 : 1) * (e.strike > 0 ? 1.5 : 1);
export function hirePool(G, e) {
  const d = ENT[e.id];
  return e.staff * 0.012 * d.pool * G.m.labor * Math.pow(Math.max(0.5, e.wageR) / 1.08, 4) * (1 + e.housing * 0.5 + e.school * 0.3);
}

export function stepWorkforce(G) {
  for (const e of Object.values(G.ents)) {
    const d = ENT[e.id];
    e.rwage = d.rwage * G.m.wageIdx;
    // текучесть
    const leave = Math.round(e.staff * attrition(e) * uni(G, 0.8, 1.2));
    // новички уходят чаще — забираем часть из когорт
    let fromTr = Math.min(Math.round(leave * 0.35), traineeCount(e));
    for (let i = 0; i < 12 && fromTr > 0; i++) { const k = Math.min(e.trainees[i], fromTr); e.trainees[i] -= k; fromTr -= k; }
    e.staff -= leave;
    // обучение: когорты стареют
    e.trainees.pop(); e.trainees.unshift(0);
    // найм или сокращение до целевой численности
    if (e.target > e.staff) {
      const hires = Math.min(e.target - e.staff, Math.round(hirePool(G, e) * uni(G, 0.85, 1.15)));
      e.staff += hires; e.trainees[0] += hires;
      e.last.hired = hires;
    } else if (e.target < e.staff) {
      const fire = e.staff - e.target;
      e.staff -= fire;
      const sev = (fire * wage(e) * 2 * 1.3) / 1000;   // выходное пособие — два оклада
      spend(G, sev, "other"); plAdd(G, "other", sev);
      e.last.hired = -fire;
      // сокращения на оборонных заводах — болезненная тема для власти
      if (fire > 200) { const dt = Math.min(6, fire / 400); G.trust -= dt; logF(G, `${d.short}: сокращено ${fire} чел. Выходные пособия ${fmtM(sev)}. Доверие государства −${dt.toFixed(1)}`, "warn"); }
      let k = fire;
      for (let i = 0; i < 12 && k > 0; i++) { const q = Math.min(e.trainees[i], k); e.trainees[i] -= q; k -= q; }
    } else e.last.hired = 0;
    e.last.left = leave;
    if (e.arrears > 0) e.arrears--;
    if (e.strike > 0) e.strike--;
    if (e.pBonusT > 0 && --e.pBonusT === 0) e.pBonus = 0;
  }
}

/* Износ основных фондов, ремонт (капитализируется), аварии */
export function stepAssets(G) {
  for (const e of Object.values(G.ents)) {
    const d = ENT[e.id];
    const base = d.staff * d.capInt * G.m.cpi;              // восстановительная стоимость
    const cost = (base * e.maint) / 12;
    spend(G, cost, "maint");
    e.fa += cost;
    e.wear = clamp(e.wear + 0.0042 - e.maint / 12 * 1.0 + uni(G, -0.0008, 0.0008), 0.05, 0.95);
    // авария
    const p = 0.003 * (1 + 8 * Math.max(0, e.wear - 0.45));
    if (!G._fc && chance(G, p)) accident(G, e);
  }
}

function accident(G, e) {
  const d = ENT[e.id];
  const units = e.lines.flatMap((l) => l.wip);
  let lost = 0;
  for (const u of units) if (chance(G, 0.25)) { const dp = Math.min(u.p, uni(G, 0.05, 0.2)); const dc = u.c * dp * 0.5; u.p -= dp; u.c -= dc; lost += dc; }
  const repair = d.staff * d.capInt * 0.006 * uni(G, 0.6, 1.6);
  spend(G, repair, "other"); plAdd(G, "other", repair + lost);
  e.pBonus = -0.12; e.pBonusT = 3;
  G.stats.accidents++;
  const what = ["пожар в механосборочном цехе", "авария на подстанции", "обрушение кровли склада", "выход из строя пресса", "разрушение шпинделя обрабатывающего центра"];
  logF(G, `Авария на ${d.short}: ${pick(G, what)}. Ремонт ${fmtM(repair)}, потери НЗП ${fmtM(lost)}, мощность −12% на 3 месяца. Причина — износ фондов ${Math.round(e.wear * 100)}%.`, "crit", { ent: e.id });
}
