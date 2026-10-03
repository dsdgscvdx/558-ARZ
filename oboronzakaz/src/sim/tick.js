/* Ход — один месяц. Порядок: события прошлого месяца → макроэкономика → кадры и фонды → НИОКР и проекты →
   производство → поставки и оплата → неустойки → финансы и налоги → новые предложения и тендеры → события →
   овердрафт → история и годовые итоги. */
import { PARTNER } from "../data/partners.js";
import { RND } from "../data/rnd.js";
import { stepMacro, rate } from "./macro.js";
import { stepWorkforce, stepAssets, capacity } from "./workforce.js";
import { stepRnd, stepProjects } from "./rnd.js";
import { stepProduction } from "./production.js";
import { stepDeliveries, stepPayments, stepPenalties, stepService, genGozRolling, genUrgentGoz, genCivilOffers, genServiceOffers, expireOffers, remaining } from "./contracts.js";
import { genTenders, resolveTenders, stepExpos } from "./tenders.js";
import { stepEvents, autoResolve, queueEvent } from "./events.js";
import {
  financeMonth, profitTax, overdraft, odLimit, rollMonth, rollYear, plAdd, logF, fmtM, revenue, ebitda, netProfit, pretax,
  debt, fxValue, balance, blankPL, blankCF, rating, withReval,
} from "./finance.js";
import { chance, clamp, monthOf, yearOf, sum, dateStr, uni } from "./util.js";

export const CAMPAIGN_END = 119;

export function endMonth(G) {
  if (G.over && G.over.kind !== "final") return null;
  const t = G.t, mo = monthOf(t), yr = yearOf(t);
  const cash0 = G.cash;
  const chk = G._dbg || (() => {});
  G._restrIn = 0; G._restrSpent = 0;
  autoResolve(G);
  chk("события");

  // ── макроэкономика и переоценка валюты
  const keyOld = G.m.key;
  withReval(G, () => stepMacro(G));
  if (G.m.key !== keyOld) logF(G, `ЦБ ${G.m.key > keyOld ? "повысил" : "снизил"} ключевую ставку до ${G.m.key.toFixed(1).replace(".", ",")}%.`, G.m.key > keyOld ? "warn" : "ok");

  // ── кадры, фонды, НИОКР, проекты
  stepWorkforce(G);
  chk("кадры");
  stepAssets(G);
  chk("фонды");
  stepRnd(G);
  chk("НИОКР");
  stepProjects(G);
  chk("проекты");

  // ── производство и поставки
  const prod = stepProduction(G);
  chk("производство");
  const del = stepDeliveries(G);
  chk("поставки");
  stepService(G);
  chk("сервис");
  stepPayments(G);
  chk("оплата");
  stepPenalties(G);
  chk("неустойки");

  // ── финансы
  financeMonth(G);
  chk("финансы");
  profitTax(G);
  chk("налог");

  // ── предложения, тендеры, выставки
  genGozRolling(G);
  if (!G._fc && chance(G, 0.12)) genUrgentGoz(G);
  if (mo % 3 === 1) genCivilOffers(G);
  if (mo === 0) genServiceOffers(G);
  if (!G._fc) { resolveTenders(G); genTenders(G); }
  stepExpos(G);
  expireOffers(G);
  chk("предложения");

  // ── события
  if (!G._fc) stepEvents(G);
  chk("события-2");

  // ── отношения возвращаются к базовым, ограничения шкал
  for (const [pid, pp] of Object.entries(G.partners)) pp.rel = clamp(pp.rel + (PARTNER[pid].rel - pp.rel) * 0.01, 0, 100);
  G.rep += (55 - G.rep) * 0.02;
  G.trust += (55 - G.trust) * 0.015;
  G.trust = clamp(G.trust, 0, 100);
  G.rep = clamp(G.rep, 0, 100);

  // ── овердрафт и кризис неплатежей
  const od = overdraft(G);
  chk("овердрафт");
  const lim = odLimit(G);
  if (od > lim) {
    G.crisis = (G.crisis || 0) + 1;
    for (const e of Object.values(G.ents)) e.arrears = 2;
    G.trust -= 4;
    logF(G, `Денег не хватает даже с овердрафтом (${fmtM(od)} при лимите ${fmtM(lim)}): задержка зарплаты на всех заводах. Доверие государства −4.`, "crit");
    if (!G._fc && G.crisis === 1 && G.t - (G.flags.bailoutT ?? -99) > 36) {
      const amt = Math.round(Math.max(od * 1.3, lim) / 1000) * 1000;
      G.flags.bailoutT = G.t;
      queueEvent(G, "bailout", { p: { amt }, title: "Стабилизационный кредит Минфина", text: `Холдинг не может платить зарплату. Минфин готов выдать бюджетный кредит ${fmtM(amt)} под 3% на 4 года — при условии антикризисного плана и личной ответственности руководителя.`,
        choices: [{ label: "Принять кредит и антикризисный план", hint: "доверие −8, зарплата будет выплачена" }, { label: "Справиться самим", hint: "если через три месяца денег не будет — отставка" }], def: 0 });
    }
  } else G.crisis = 0;

  // ── итоги месяца
  const p = G.pl.m;
  const b = balance(G);
  const backlog = sum(G.contracts.filter((c) => c.status === "active" && c.kind !== "svc"), (c) => remaining(c) * c.price * rate(G, c.cur));
  const staff = sum(Object.values(G.ents), (e) => e.staff);
  const cap = sum(Object.values(G.ents), (e) => e.cap || 0);
  const need = sum(Object.values(G.ents), (e) => Math.min(e.need || 0, e.cap || 0));
  G.hist.push({
    t, cash: G.cash, debt: debt(G), restr: b.restr, fx: b.fx, rev: revenue(p), revGoz: p.revGoz, revExp: p.revExp, revCiv: p.revCiv, revSvc: p.revSvc,
    ebitda: ebitda(p), np: netProfit(p), idle: p.idle, staff, util: cap > 0 ? need / cap : 0, usd: G.m.usd, key: G.m.key, infl: G.m.infl, oil: G.m.oil,
    trust: G.trust, rep: G.rep, backlog, equity: b.equity, inv: b.wip + b.stock,
  });
  if (G.hist.length > 240) G.hist.shift();
  G.monthReport = {
    t, rev: revenue(p), np: netProfit(p), ebitda: ebitda(p), cash: G.cash - cash0, od,
    delivered: del.units, rejects: del.rejects, started: prod.started, waiting: prod.waiting, idle: prod.idle, noCash: !!prod.noCash,
    restrIn: G._restrIn, restrSpent: G._restrSpent,
  };
  // годовая статистика для KPI
  const ys = (G.ystats = G.ystats || { y: yr, gozOnTime: 0, gozLate: 0, expUsd: 0 });
  rollMonth(G);
  G.pl.lastM = G.pl.m;
  G.pl.m = blankPL();
  G.cf.lastM = G.cf.m;
  G.cf.m = blankCF();

  if (mo === 11) yearEnd(G, yr);

  // ── конец игры
  if (G.trust <= 0) {
    G.over = { kind: "fired", t, text: "Правительство потеряло доверие к руководству холдинга. Указом вы освобождены от должности." };
  } else if ((G.crisis || 0) >= 3) {
    G.over = { kind: "bankrupt", t, text: "Три месяца подряд холдинг не может платить зарплату. Банки отказали в кредитах, на заводах протесты. Вы отправлены в отставку, в холдинг вводится временная администрация." };
  } else if (t === CAMPAIGN_END && !G.over) {
    G.over = { kind: "final", t, score: finalScore(G) };
  }
  G.t += 1;
  return G.monthReport;
}

/* ── годовые итоги: KPI от правительства ── */
export function kpiTargets(G, yr) {
  const k = yr - 2026;
  return {
    goz: 0.9,
    exp: 1500 + 150 * k,                         // $ млн новых экспортных контрактов за год
    civ: Math.min(0.09, 0.045 + 0.0075 * k),      // доля гражданской продукции в выручке: 4,5% в 2026, потолок 9% с 2032 года
    lev: 4,                                       // чистый долг / EBITDA
  };
}
function yearEnd(G, yr) {
  const py = G.pl.y;
  const ys = G.ystats || { gozOnTime: 0, gozLate: 0 };
  const tg = kpiTargets(G, yr);
  const gozUnits = G.stats.gozOnTime - (G._ysPrev?.gozOnTime || 0) + G.stats.gozLate - (G._ysPrev?.gozLate || 0);
  const gozOnT = G.stats.gozOnTime - (G._ysPrev?.gozOnTime || 0);
  const gozShare = gozUnits > 0 ? gozOnT / gozUnits : 1;
  const overdueGoz = G.contracts.filter((c) => c.status === "active" && c.kind === "goz" && c.late > 0).length;
  const expUsd = G.stats.expUsd - (G._ysPrev?.expUsd || 0);
  const rev = revenue(py);
  const civShare = rev > 0 ? (py.revCiv) / rev : 0;
  const r = rating(G);
  const kpis = [
    { id: "goz", name: "Гособоронзаказ: поставки в срок", target: `≥ ${Math.round(tg.goz * 100)}%, просрочек не больше двух`, actual: `${Math.round(gozShare * 100)}%${overdueGoz ? `, просрочено контрактов: ${overdueGoz}` : ""}`, ok: gozShare >= tg.goz && overdueGoz <= 2, w: 3 },
    { id: "exp", name: "Новые экспортные контракты", target: `≥ $${(tg.exp / 1000).toFixed(2).replace(".", ",")} млрд`, actual: `$${(expUsd / 1000).toFixed(2).replace(".", ",")} млрд`, ok: expUsd >= tg.exp, w: 1.5 },
    { id: "civ", name: "Доля гражданской продукции", target: `≥ ${Math.round(tg.civ * 100)}%`, actual: `${Math.round(civShare * 100)}%`, ok: civShare >= tg.civ, w: 1.5 },
    { id: "lev", name: "Долговая нагрузка (чистый долг / EBITDA)", target: `≤ ${tg.lev}`, actual: r.e12 > 0 ? r.ratio.toFixed(1).replace(".", ",") : "EBITDA ≤ 0", ok: r.e12 > 0 && r.ratio <= tg.lev, w: 1.5 },
  ];
  let dt = 0;
  for (const k of kpis) { k.dt = k.ok ? k.w : -k.w; dt += k.dt; }
  G.trust = clamp(G.trust + dt, 0, 100);
  G.lastReport = { year: yr, pl: { ...py }, cf: { ...G.cf.y }, kpis, dt, np: netProfit(py), rev, ebitda: ebitda(py), seen: false,
    staff: sum(Object.values(G.ents), (e) => e.staff), debt: debt(G), cash: G.cash };
  G.kpi[yr] = kpis.map((k) => ({ id: k.id, ok: k.ok }));
  G._ysPrev = { gozOnTime: G.stats.gozOnTime, gozLate: G.stats.gozLate, expUsd: G.stats.expUsd };
  logF(G, `Итоги ${yr} года: выручка ${fmtM(rev)}, чистая прибыль ${fmtM(netProfit(py))}. Выполнено показателей: ${kpis.filter((k) => k.ok).length} из ${kpis.length}. Доверие государства ${dt >= 0 ? "+" : ""}${dt.toFixed(1)}.`, "year");
  rollYear(G, yr);
}

/* ── итоговая оценка в декабре 2035 года ── */
export function finalScore(G) {
  const onT = G.stats.gozOnTime, all = G.stats.gozOnTime + G.stats.gozLate;
  const goz = all ? (100 * onT) / all : 50;
  const exp = clamp(G.stats.expUsd / 300, 0, 100);
  // прибыль в ценах 2026 года
  let npReal = 0;
  for (const [y, p] of Object.entries(G.pl.years)) npReal += netProfit(p) / Math.pow(1.06, y - 2026);
  const fin = clamp(npReal / 8000, 0, 100);
  const r = rating(G);
  const lev = r.e12 > 0 ? clamp(100 - Math.max(0, r.ratio - 1) * 20, 0, 100) : 0;
  const tech = (100 * Object.values(G.rnd).filter((s) => s.st === "done").length) / RND.length;
  const trust = G.trust;
  const total = goz * 0.2 + exp * 0.2 + fin * 0.2 + lev * 0.1 + tech * 0.15 + trust * 0.15;
  const parts = [
    { name: "Гособоронзаказ в срок", v: goz, w: 20 },
    { name: "Экспортные контракты", v: exp, w: 20 },
    { name: "Прибыль за десять лет", v: fin, w: 20 },
    { name: "Технологии (НИОКР)", v: tech, w: 15 },
    { name: "Доверие государства", v: trust, w: 15 },
    { name: "Долговая нагрузка", v: lev, w: 10 },
  ];
  let title;
  if (total >= 85) title = "Выдающийся результат: звание Героя Труда Российской Федерации";
  else if (total >= 70) title = "Отлично: орден «За заслуги перед Отечеством»";
  else if (total >= 55) title = "Хорошо: благодарность Правительства";
  else if (total >= 40) title = "Удовлетворительно: переведены на другую работу";
  else title = "Неудовлетворительно: отставка без почестей";
  return { total, parts, title, npReal };
}
