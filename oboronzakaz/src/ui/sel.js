/* Производные данные для интерфейса: что требует решения, прогресс KPI, сводки по предприятиям. */
import { ENT } from "../data/enterprises.js";
import { PARTNER } from "../data/partners.js";
import { VAR, FAM, compName, stdCost } from "../sim/catalog.js";
import { capacity, payroll, wage, attrition, hirePool, traineeCount } from "../sim/workforce.js";
import { rate } from "../sim/macro.js";
import { remaining, defectRate } from "../sim/contracts.js";
import { kpiTargets } from "../sim/tick.js";
import { revenue, rating, debt } from "../sim/finance.js";
import { yearOf, monthOf, sum } from "../sim/util.js";
import { forecast } from "../sim/forecast.js";
import { S } from "./store.js";
import { rub, usd, pct, dateGen, datePrep, date } from "./fmt.js";

export const activeContracts = (G) => G.contracts.filter((c) => c.status === "active");
export const lateContracts = (G) => G.contracts.filter((c) => c.status === "active" && c.kind !== "svc" && c.late > 0);
export const openTenders = (G) => G.tenders.filter((T) => T.status === "open");

/* Прогноз денег кэшируется до следующего изменения состояния */
export function getForecast(G) {
  if (S.fcV === S.v && S.fc) return S.fc;
  try { S.fc = forecast(G, 6); } catch (e) { S.fc = []; console.error(e); }
  S.fcV = S.v;
  return S.fc;
}

export function entStats(G, e) {
  const d = ENT[e.id];
  const { cap, prodF } = capacity(G, e);
  let need = 0, waiting = 0, wip = 0;
  for (const l of e.lines) for (const u of l.wip) { wip++; if (u.w) waiting++; else need += (u.r ? 0.5 : 1) * VAR[u.v].lab / VAR[u.v].cycle; }
  const util = cap > 0 ? Math.min(1, need / cap) : 0;
  const over = cap > 0 ? need / cap : 0;
  return { d, cap, prodF, need, util, over, waiting, wip, pay: payroll(e), wage: wage(e), attr: attrition(e), pool: hirePool(G, e), tr: traineeCount(e), defect: defectRate(G, e) };
}

export function alerts(G) {
  const out = [];
  for (const ev of G.ev.queue) out.push({ tone: "warn", icon: "flag", text: `Нужно решение: ${ev.title}`, modal: ["event", { id: ev.id }] });
  const goz = G.offers.filter((o) => o.kind === "goz");
  if (goz.length) out.push({ tone: "info", icon: "doc", text: `Проекты контрактов ГОЗ: ${goz.length}. Без ответа будут подписаны в конце ${dateGen(Math.min(...goz.map((o) => o.exp)))}`, go: ["orders", { tab: "offers" }] });
  const civ = G.offers.filter((o) => o.kind === "civ" || o.kind === "svc");
  if (civ.length) out.push({ tone: "info", icon: "doc", text: `Гражданские и сервисные предложения: ${civ.length}`, go: ["orders", { tab: "offers" }] });
  const tn = openTenders(G).filter((T) => !T.bid);
  if (tn.length) out.push({ tone: "info", icon: "export", text: `Тендеры без нашей заявки: ${tn.length}`, go: ["export", {}] });
  const late = lateContracts(G);
  if (late.length) {
    const pen = sum(late, (c) => (c.kind === "goz" ? ((c.qty - c.done) * c.price * G.m.key) / 1000 : (c.qty - c.done) * c.price * rate(G, c.cur) * 0.005));
    out.push({ tone: "crit", icon: "warn", text: `Просрочено контрактов: ${late.length}. Неустойки около ${rub(pen)} в месяц`, go: ["orders", { tab: "active", filter: "late" }] });
  }
  const wait = G._prod?.waiting || {};
  const wk = Object.entries(wait).filter(([, n]) => n > 0);
  if (wk.length) out.push({ tone: "crit", icon: "engine", text: `Изделия ждут двигателей: ${wk.map(([k, n]) => `${compName(k)} — ${n} шт.`).join(", ")}`, go: ["prod", { focus: "comps" }] });
  const fc = getForecast(G);
  const neg = fc.find((x) => x.od > 0);
  if (neg) out.push({ tone: "crit", icon: "fin", text: `По прогнозу с ${dateGen(neg.t)} не хватит денег: овердрафт ${rub(neg.od)}`, go: ["finance", { tab: "loans" }] });
  const over = [], idle = [], lowWage = [], wear = [], shrink = [];
  for (const e of Object.values(G.ents)) {
    const st = entStats(G, e);
    if (st.over > 1.08) over.push([e.id, `${st.d.short} ${pct(st.over)}`]);
    else if (st.util < 0.6 && e.staff > 1000) idle.push([e.id, `${st.d.short} ${pct(st.util)}`]);
    if (e.wageR < 1.0) lowWage.push([e.id, st.d.short]);
    else if (e.target > e.staff * 1.04 && e.last.hired >= 0 && (e.last.left || 0) > (e.last.hired || 0)) shrink.push([e.id, st.d.short]);
    if (e.wear > 0.68) wear.push([e.id, `${st.d.short} ${pct(e.wear)}`]);
  }
  const grp = (list, tone, icon, head) => { if (list.length) out.push({ tone, icon, text: `${head}: ${list.map((x) => x[1]).join(", ")}`, modal: list.length === 1 ? ["ent", { id: list[0][0] }] : null, go: list.length > 1 ? ["ents", {}] : null }); };
  grp(over, "warn", "people", "Не хватает людей, изделия задерживаются");
  grp(idle, "warn", "ent", "Простаивают мощности — простой съедает деньги");
  grp(lowWage, "warn", "people", "Зарплата ниже средней по региону — люди уходят");
  grp(shrink, "warn", "people", "Персонал убывает: уходит больше, чем удаётся нанять");
  grp(wear, "warn", "wrench", "Высокий износ фондов — риск аварий");
  if (G.lastReport && !G.lastReport.seen) out.unshift({ tone: "info", icon: "chart", text: `Итоги ${G.lastReport.year} года готовы`, modal: ["year", {}] });
  return out;
}

/* Прогресс KPI текущего года */
export function kpiProgress(G) {
  const yr = yearOf(G.t);
  const tg = kpiTargets(G, yr);
  const prev = G._ysPrev || { gozOnTime: 0, gozLate: 0, expUsd: 0 };
  const onT = G.stats.gozOnTime - (prev.gozOnTime || 0), lateU = G.stats.gozLate - (prev.gozLate || 0);
  const gozShare = onT + lateU > 0 ? onT / (onT + lateU) : 1;
  const overdue = G.contracts.filter((c) => c.status === "active" && c.kind === "goz" && c.late > 0).length;
  const expUsd = G.stats.expUsd - (prev.expUsd || 0);
  const ytd = G.pl.y;
  const rev = revenue(ytd);
  const civ = rev > 0 ? ytd.revCiv / rev : 0;
  const r = rating(G);
  return [
    { id: "goz", name: "ГОЗ в срок", val: gozShare, target: tg.goz, ok: gozShare >= tg.goz && overdue <= 2, text: `${pct(gozShare)}${overdue ? ` · просрочено ${overdue}` : ""}`, ttext: `≥ ${pct(tg.goz)}, просрочек ≤ 2` },
    { id: "exp", name: "Новый экспорт", val: expUsd / tg.exp, target: 1, ok: expUsd >= tg.exp, text: usd(expUsd), ttext: `≥ ${usd(tg.exp)}` },
    { id: "civ", name: "Доля гражданской продукции", val: tg.civ ? civ / tg.civ : 1, target: 1, ok: civ >= tg.civ, text: pct(civ), ttext: `≥ ${pct(tg.civ)}` },
    { id: "lev", name: "Чистый долг / EBITDA", val: r.e12 > 0 ? Math.max(0, 1 - r.ratio / (tg.lev * 1.5)) : 0, target: 1 - 1 / 1.5, ok: r.e12 > 0 && r.ratio <= tg.lev, text: !G.hist.length ? "нет данных" : r.e12 > 0 ? r.ratio.toFixed(1).replace(".", ",") : "EBITDA ≤ 0", ttext: `≤ ${tg.lev}` },
  ];
}

export function segRows(G, n = 24) {
  return G.hist.slice(-n).map((h) => ({ t: h.t, goz: h.revGoz, exp: h.revExp, civ: h.revCiv, svc: h.revSvc }));
}

export function contractValueRub(G, c) {
  return c.kind === "svc" ? c.price * rate(G, c.cur) : c.qty * c.price * rate(G, c.cur);
}
export function unitPriceRub(G, c) { return c.price * rate(G, c.cur); }

/* Маржа по контракту на единицу: цена (без экспортного сопровождения) против нормативной себестоимости */
export function unitMargin(G, vid, priceRub, pkg = 0) {
  const cost = stdCost(G, vid);
  const net = priceRub * (1 - pkg);
  return { cost, net, m: net / cost - 1 };
}
export { remaining, date };
