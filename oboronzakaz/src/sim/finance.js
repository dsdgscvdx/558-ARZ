/* Финансы и учёт: отчёт о прибылях и убытках, движение денег, баланс, кредиты, валютные счета, налоги. */
import { rate, loanRate, CUR_NAME } from "./macro.js";
import { clamp, monthOf, yearOf, nextId, sum } from "./util.js";
import { BANKS } from "../data/scenario.js";

export const PL_KEYS = ["revGoz", "revExp", "revCiv", "revSvc", "cogs", "idle", "pkg", "rnd", "sga", "pen", "proptax", "other", "otherInc", "dep", "int", "intInc", "fxd", "tax"];
export const PL_NAMES = {
  revGoz: "Выручка: гособоронзаказ", revExp: "Выручка: экспорт", revCiv: "Выручка: гражданская продукция", revSvc: "Выручка: сервис и ремонт",
  cogs: "Себестоимость продаж", idle: "Простой мощностей", pkg: "Экспортное сопровождение и комиссия", rnd: "НИОКР за свой счёт",
  sga: "Коммерческие и управленческие", pen: "Неустойки и штрафы", proptax: "Налог на имущество", other: "Прочие расходы", otherInc: "Прочие доходы",
  dep: "Амортизация", int: "Проценты по кредитам", intInc: "Проценты по депозитам", fxd: "Курсовые разницы", tax: "Налог на прибыль",
};
export const CF_KEYS = ["inGoz", "inExp", "inCiv", "inSvc", "inAdv", "payroll", "materials", "overhead", "rnd", "capex", "maint", "interest", "intInc", "taxes", "penalties", "sga", "other", "loansIn", "loansOut", "divs", "capIn"];
export const CF_NAMES = {
  inGoz: "Оплата поставок по ГОЗ", inExp: "Оплата экспортных поставок", inCiv: "Оплата гражданских заказчиков", inSvc: "Сервисные контракты",
  inAdv: "Авансы по новым контрактам", payroll: "Зарплата и страховые взносы", materials: "Материалы, ЭКБ и комплектующие",
  overhead: "Энергия и накладные расходы", rnd: "НИОКР", capex: "Инвестиции в мощности", maint: "Ремонт основных фондов",
  interest: "Проценты по кредитам", intInc: "Проценты по депозитам", taxes: "Налоги", penalties: "Неустойки и штрафы",
  sga: "Выставки, делегации, сопровождение", other: "Прочие платежи", loansIn: "Получено кредитов", loansOut: "Погашено кредитов",
  divs: "Дивиденды в бюджет", capIn: "Взнос государства в капитал",
};

export const blankPL = () => Object.fromEntries(PL_KEYS.map((k) => [k, 0]));
export const blankCF = () => Object.fromEntries(CF_KEYS.map((k) => [k, 0]));
export const plAdd = (G, k, x) => { G.pl.m[k] += x; };
export const cfAdd = (G, k, x) => { G.cf.m[k] += x; };
export const revenue = (p) => p.revGoz + p.revExp + p.revCiv + p.revSvc;
export const ebitda = (p) => revenue(p) - p.cogs - p.idle - p.pkg - p.rnd - p.sga - p.pen - p.proptax - p.other + p.otherInc;
export const pretax = (p) => ebitda(p) - p.dep - p.int + p.intInc + p.fxd;
export const netProfit = (p) => pretax(p) - p.tax;
export const cfNet = (c) => c.inGoz + c.inExp + c.inCiv + c.inSvc + c.inAdv + c.intInc + c.loansIn + c.capIn
  - c.payroll - c.materials - c.overhead - c.rnd - c.capex - c.maint - c.interest - c.taxes - c.penalties - c.sga - c.other - c.loansOut - c.divs;

/* Изменение курсов с переоценкой валютных счетов и дебиторской задолженности (курсовые разницы) */
export function withReval(G, fn) {
  const curs = ["USD", "EUR", "CNY", "INR", "AED"];
  const old = Object.fromEntries(curs.map((c) => [c, rate(G, c)]));
  fn();
  let d = 0;
  for (const [cur, amt] of Object.entries(G.fx)) d += amt * (rate(G, cur) - old[cur]);
  for (const c of G.contracts) if (c.cur !== "RUB") for (const r of c.recv) d += r.amt * (rate(G, c.cur) - old[c.cur]);
  plAdd(G, "fxd", d);
  return d;
}

/* Списание денег с указанием статьи движения денежных средств */
export function spend(G, amt, cfKey) { G.cash -= amt; if (cfKey) cfAdd(G, cfKey, amt); }
export function receive(G, amt, cfKey) { G.cash += amt; if (cfKey) cfAdd(G, cfKey, amt); }

export function debt(G) { return sum(G.loans, (l) => l.amt); }
export function fxValue(G) { return sum(Object.entries(G.fx), ([c, a]) => a * rate(G, c)); }
export function recvValue(G) { let s = 0; for (const c of G.contracts) for (const r of c.recv) s += r.amt * rate(G, c.cur); return s; }

export function balance(G) {
  const cash = G.cash;
  const restr = sum(G.contracts, (c) => c.restr || 0);
  const fx = fxValue(G);
  const recv = recvValue(G);
  let wip = 0, stock = 0;
  for (const e of Object.values(G.ents)) for (const l of e.lines) for (const u of l.wip) wip += u.c;
  for (const s of Object.values(G.stock)) stock += s.c;
  let cip = 0, fa = 0;
  for (const e of Object.values(G.ents)) { fa += e.fa; for (const p of e.proj) cip += p.spent; }
  const loans = debt(G);
  const adv = sum(G.contracts, (c) => c.advLeft || 0);
  const assets = cash + restr + fx + recv + wip + stock + cip + fa;
  const liab = loans + adv;
  return { cash, restr, fx, recv, wip, stock, cip, fa, assets, loans, adv, liab, equity: assets - liab };
}

/* ── кредитный рейтинг по отношению чистого долга к EBITDA за 12 месяцев */
export function ebitda12(G) {
  const h = G.hist.slice(-12);
  if (h.length === 0) return 0;
  const s = sum(h, (x) => x.ebitda);
  return (s * 12) / h.length;
}
export function rating(G) {
  const e12 = ebitda12(G);
  const nd = debt(G) - G.cash - fxValue(G);
  const ratio = e12 > 0 ? nd / e12 : nd > 0 ? 99 : 0;
  let r;
  if (ratio < 1.5) r = { code: "AA", spread: 1.5, mult: 4 };
  else if (ratio < 3) r = { code: "A", spread: 2.5, mult: 4 };
  else if (ratio < 4.5) r = { code: "BBB", spread: 3.75, mult: 5 };
  else if (ratio < 6) r = { code: "BB", spread: 5.5, mult: 6 };
  else r = { code: "B", spread: 8, mult: 0 };
  const limit = r.mult ? Math.max(0, r.mult * Math.max(e12, 0) - nd) : 0;
  return { ...r, ratio, e12, nd, limit: Math.round(limit) };
}

/* Предложения банков. Ставка плавающая: ключевая ставка ЦБ + маржа (зависит от рейтинга и срока). */
export function loanOffers(G) {
  const r = rating(G), out = [];
  const banks = [["sber", 0], ["vtb", 0.25], ["gpb", 0.5], ["psb", -0.25]];
  if (r.limit > 0) {
    for (const [b, add] of banks) {
      for (const term of [12, 36, 60]) {
        const spread = r.spread + add + (term - 12) / 48 * 0.75;
        out.push({ bank: b, kind: "mkt", term, spread: Math.round(spread * 100) / 100, max: r.limit, rate: G.m.key + spread });
      }
    }
  }
  // льготный кредит под исполнение ГОЗ
  const backlog = gozBacklog(G);
  const used = sum(G.loans.filter((l) => l.kind === "goz"), (l) => l.amt);
  const gozMax = Math.max(0, Math.round(backlog * 0.25 - used));
  if (G.trust >= 40 && gozMax > 1000) out.unshift({ bank: "psb", kind: "goz", term: 24, rate: Math.max(5, Math.round((G.m.key - 6) * 2) / 2), max: gozMax, special: true });
  return out;
}
export function gozBacklog(G) {
  return sum(G.contracts.filter((c) => c.status === "active" && c.kind === "goz"), (c) => (c.qty - c.done) * c.price);
}

export function takeLoan(G, offer, amt) {
  amt = Math.round(Math.min(amt, offer.max));
  if (amt <= 0) return null;
  const l = { id: nextId(G, "L"), bank: offer.bank, kind: offer.kind, amt, left: offer.term, t0: G.t };
  if (offer.kind === "goz") l.rate = offer.rate; else l.spread = offer.spread;
  G.loans.push(l);
  receive(G, amt, "loansIn");
  logF(G, `Получен кредит ${BANKS[offer.bank].name}: ${fmtM(amt)} на ${offer.term} мес.`, "fin");
  return l;
}
export function repayLoan(G, id, amt) {
  const l = G.loans.find((x) => x.id === id);
  if (!l) return 0;
  amt = Math.min(amt, l.amt, Math.max(0, G.cash));
  if (amt <= 0) return 0;
  l.amt -= amt;
  spend(G, amt, "loansOut");
  if (l.amt < 1) G.loans = G.loans.filter((x) => x !== l);
  return amt;
}

/* ── валютные счета: экспортная выручка поступает в валюте; часть подлежит обязательной продаже */
export function receiveFx(G, cur, amt, cfKey) {
  if (cur === "RUB") { receive(G, amt, cfKey); return; }
  const rub = amt * rate(G, cur);
  cfAdd(G, cfKey, rub);
  const sell = G.autoFx ? 1 : cur === "INR" ? 0 : G.m.mandSale / 100;
  const disc = cur === "INR" ? INR_DISCOUNT : 0;
  G.cash += rub * sell * (1 - disc);
  if (disc && sell) plAdd(G, "fxd", -rub * sell * disc);
  G.fx[cur] += amt * (1 - sell);
}
export const INR_DISCOUNT = 0.06;
export function convertFx(G, cur, amt) {
  amt = Math.min(amt, G.fx[cur]);
  if (amt <= 0) return 0;
  const r = rate(G, cur);
  const disc = cur === "INR" ? INR_DISCOUNT : 0.003;
  G.fx[cur] -= amt;
  G.cash += amt * r * (1 - disc);
  plAdd(G, "fxd", -amt * r * disc);
  if (cur === "INR") logF(G, `Рупии проданы с дисконтом ${Math.round(disc * 100)}%: ${fmtM(amt * r * (1 - disc))}`, "fin");
  return amt;
}

/* ── ежемесячные финансовые операции (после производства и поставок) */
export function financeMonth(G) {
  const m = G.m;
  // проценты по депозитам на остаток свободных денег
  if (G.cash > 0) { const inc = (G.cash * Math.max(0, m.key - 2)) / 100 / 12; G.cash += inc; plAdd(G, "intInc", inc); cfAdd(G, "intInc", inc); }
  // проценты и погашение кредитов
  for (const l of G.loans) {
    const i = (l.amt * loanRate(G, l)) / 100 / 12;
    spend(G, i, "interest"); plAdd(G, "int", i);
    l.left -= 1;
  }
  const due = G.loans.filter((l) => l.left <= 0 && l.kind !== "od");
  for (const l of due) {
    if (G.cash >= l.amt) { spend(G, l.amt, "loansOut"); G.loans = G.loans.filter((x) => x !== l); logF(G, `Погашен кредит ${BANKS[l.bank].name}: ${fmtM(l.amt)}`, "fin"); }
    else {
      const r = rating(G);
      if (r.mult > 0) { l.left = 12; l.kind = "mkt"; l.spread = r.spread + 1; logF(G, `Кредит ${BANKS[l.bank].name} ${fmtM(l.amt)} пролонгирован на 12 мес. под ключевую + ${l.spread.toFixed(2)}%`, "warn"); }
      else { G.cash -= l.amt; cfAdd(G, "loansOut", l.amt); G.loans = G.loans.filter((x) => x !== l); logF(G, `Банк отказал в пролонгации: кредит ${fmtM(l.amt)} погашен за счёт овердрафта`, "crit"); }
    }
  }
  // амортизация, налог на имущество
  let dep = 0, ptax = 0;
  for (const e of Object.values(G.ents)) { const d = (e.fa * 0.06) / 12; e.fa -= d; dep += d; ptax += (e.fa * 0.022) / 12; }
  plAdd(G, "dep", dep);
  spend(G, ptax, "taxes"); plAdd(G, "proptax", ptax);
}

/* Налог на прибыль: авансовые платежи нарастающим итогом с начала года, перенос убытков (не более 50% базы) */
export function profitTax(G) {
  const ytd = pretax(sumPL(G.pl.y, G.pl.m));
  const base = ytd > 0 ? ytd - Math.min(G.tax.lossCF, ytd * 0.5) : 0;
  const due = Math.max(0, base) * 0.25;
  const pay = due - G.tax.paidYtd;
  if (Math.abs(pay) > 0.01) {
    G.tax.paidYtd += pay;
    plAdd(G, "tax", pay);
    if (pay > 0) spend(G, pay, "taxes"); else { G.cash -= pay; cfAdd(G, "taxes", pay); }
  }
}
export function sumPL(a, b) { const o = {}; for (const k of PL_KEYS) o[k] = (a[k] || 0) + (b[k] || 0); return o; }
export function sumCF(a, b) { const o = {}; for (const k of CF_KEYS) o[k] = (a[k] || 0) + (b[k] || 0); return o; }

/* Овердрафт: при нехватке денег банк автоматически кредитует под ключевую + 6%; при излишке — гасится первым */
export function overdraft(G) {
  let od = G.loans.find((l) => l.kind === "od");
  if (G.cash < 0) {
    const need = -G.cash;
    if (!od) { od = { id: nextId(G, "L"), bank: "od", kind: "od", amt: 0, spread: 6, left: 999, t0: G.t }; G.loans.push(od); }
    od.amt += need; G.cash = 0; cfAdd(G, "loansIn", need);
  } else if (od && G.cash > 0) {
    const pay = Math.min(od.amt, G.cash);
    od.amt -= pay; G.cash -= pay; cfAdd(G, "loansOut", pay);
    if (od.amt < 1) G.loans = G.loans.filter((l) => l !== od);
  }
  od = G.loans.find((l) => l.kind === "od");
  return od ? od.amt : 0;
}
export function odLimit(G) {
  const h = G.hist.slice(-12);
  const rev12 = h.length ? (sum(h, (x) => x.rev) * 12) / h.length : 1200000;
  return Math.max(40000, rev12 * 0.06);
}

export function rollMonth(G) {
  G.pl.y = sumPL(G.pl.y, G.pl.m);
  G.pl.all = sumPL(G.pl.all, G.pl.m);
  G.cf.y = sumCF(G.cf.y, G.cf.m);
}
export function rollYear(G, year) {
  G.pl.years[year] = G.pl.y;
  G.cf.years[year] = G.cf.y;
  const ytd = pretax(G.pl.y);
  if (ytd > 0) G.tax.lossCF = Math.max(0, G.tax.lossCF - ytd * 0.5);
  else G.tax.lossCF += -ytd;
  G.tax.paidYtd = 0;
  G.pl.y = blankPL();
  G.cf.y = blankCF();
}

/* ── журнал */
export function logF(G, text, tone = "info", extra) {
  G.log.push({ t: G.t, text, tone, ...(extra || {}) });
  if (G.log.length > 600) G.log.splice(0, G.log.length - 600);
}
export function fmtM(x) {
  const a = Math.abs(x), s = x < 0 ? "−" : "";
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(2).replace(".", ",")} трлн ₽`;
  if (a >= 1000) return `${s}${(a / 1000).toFixed(1).replace(".", ",")} млрд ₽`;
  return `${s}${Math.round(a)} млн ₽`;
}
export { clamp, monthOf, yearOf, CUR_NAME };
