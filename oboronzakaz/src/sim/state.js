/* Новая игра: предприятия, линии, стартовый портфель контрактов, незавершённое производство и баланс. */
import { ENTERPRISES, ENT } from "../data/enterprises.js";
import { PARTNERS, PARTNER } from "../data/partners.js";
import { RND } from "../data/rnd.js";
import { START, ISO } from "../data/scenario.js";
import { FAM, VAR, FAMS_BY_ENT, compsOf, matCost, stdCost } from "./catalog.js";
import { initMacro, rate } from "./macro.js";
import { digits, nextId } from "./util.js";
import { blankPL, blankCF, balance } from "./finance.js";
import { makeTender } from "./tenders.js";

export const SAVE_VERSION = 1;

export const DIFFS = {
  easy: { name: "Лёгкий", cash: 1.6, loans: 0.6, trust: 10, sanc: -10, ekb: -0.1, gozMargin: 0.03, comp: -0.3, events: 0.8 },
  normal: { name: "Обычный", cash: 1, loans: 1, trust: 0, sanc: 0, ekb: 0, gozMargin: 0, comp: 0, events: 1 },
  hard: { name: "Сложный", cash: 0.6, loans: 1.35, trust: -8, sanc: 12, ekb: 0.2, gozMargin: -0.02, comp: 0.3, events: 1.25 },
};

export function newGame({ seed = (Date.now() ^ 0x5f3759df) >>> 0, diff = "normal", name = "", holding = "" } = {}) {
  const D = DIFFS[diff] || DIFFS.normal;
  const G = {
    v: SAVE_VERSION, seed, rng: seed | 0, uid: 0, diff,
    player: { name: name || "Генеральный директор", holding: holding || "Объединённая оборонно-промышленная корпорация" },
    t: 0, over: null,
    m: initMacro({ ...START.macro, sanc: START.macro.sanc + D.sanc, ekbPrem: START.macro.ekbPrem + D.ekb }),
    trust: START.trust + D.trust, rep: START.rep,
    cash: Math.round(START.cash * D.cash),
    fx: { USD: 0, EUR: 0, CNY: 0, INR: 0, AED: 0 }, autoFx: true,
    loans: [], ents: {}, stock: {}, contracts: [], offers: [], tenders: [], partners: {}, rnd: {},
    unl: {}, bonus: { prod: {}, imp: {}, tech: {}, mat: {}, modCost: 1, quality: 0, swap: {} },
    ev: { queue: [], cd: {}, once: {}, active: {} },
    log: [], news: [], hist: [], expos: {},
    pl: { m: blankPL(), y: blankPL(), all: blankPL(), years: {} },
    cf: { m: blankCF(), y: blankCF(), years: {} },
    flags: {},
    stats: { gozUnits: 0, gozLate: 0, gozOnTime: 0, expUnits: 0, expUsd: 0, tendersWon: 0, tendersLost: 0, rndDone: 0, accidents: 0, rejects: 0, divs: 0, capIn: 0 },
    kpi: {}, tax: { paidYtd: 0, lossCF: 0 }, divReq: null,
    equity0: 0, lastReport: null, monthReport: null, tutorial: 0, settings: {},
  };

  // ── предприятия и линии
  for (const d of ENTERPRISES) {
    const payroll = (d.staff * d.wage * 1.3) / 1000;
    const tr = Math.round(d.staff * 0.008);
    G.ents[d.id] = {
      id: d.id, staff: d.staff, target: d.staff, wageR: d.wage / d.rwage, rwage: d.rwage,
      eq: d.equip, wear: d.wear, fa: Math.round(d.staff * d.capInt), maint: 0.05, oh: payroll * 0.18,
      trainees: Array(12).fill(tr), housing: 0, school: 0, pBonus: 0, pBonusT: 0, arrears: 0, strike: 0,
      lines: FAMS_BY_ENT[d.id].map((fid) => ({ fam: fid, slots: FAM[fid].slots, auto: true, plan: {}, wip: [], hold: false })),
      proj: [], cap: 0, need: 0, util: 0, prodF: 1, last: {},
    };
  }

  // ── кредиты
  for (const l of START.loans) {
    G.loans.push({ id: nextId(G, "L"), bank: l.bank, kind: l.kind, amt: Math.round(l.amt * D.loans), rate: l.rate, spread: l.spread, left: l.left, t0: -6 });
  }

  // ── партнёры
  for (const p of PARTNERS) {
    G.partners[p.id] = { rel: p.rel, fleet: { ...(START.fleets[p.id] || {}) }, lastTender: -99, spent: 0, pref: { ...p.pref }, svcT: -99, credit: 0, frozen: 0 };
  }

  // ── НИОКР
  for (const r of RND) G.rnd[r.id] = { st: "idle", prog: r.done || 0, spent: 0, months: r.months, share: 0, applyT: -99, delay: 0 };

  // ── склад
  for (const [id, n] of Object.entries(START.stock)) G.stock[id] = { n, c: n * stockUnitCost(G, id) };

  // ── контракты
  for (const s of START.contracts) G.contracts.push(makeStartContract(G, s));

  // ── незавершённое производство, отражающее уже идущие работы
  seedWip(G);

  // ── первые запросы партнёров, чтобы с первого месяца было с чем работать
  for (const pid of ["dz", "vn", "eg", "iq", "kz"]) {
    const T = makeTender(G, PARTNER[pid]);
    if (T) { T.close = Math.max(T.close, 2); G.tenders.push(T); G.partners[pid].lastTender = 0; }
    if (G.tenders.length >= 3) break;
  }

  // ── собственный капитал = активы − обязательства на старте
  G.equity0 = balance(G).equity;
  return G;
}

function stockUnitCost(G, id) {
  if (VAR[id]) {
    const v = VAR[id];
    return matCost(G, id) + v.lab * 0.15;
  }
  return id === "d136" ? 300 : 48;
}

export const round3 = (x) => { const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.abs(x))) - 2)); return Math.round(x / p) * p; };

export function contractNo(G, kind, client) {
  const yy = String(2026 + Math.floor(Math.max(0, G.t) / 12)).slice(2);
  if (kind === "goz") return `ИГК ${yy}${digits(G, 6)}${digits(G, 11)}${digits(G, 6)}`;
  if (kind === "exp") return `Р/643/${ISO[client] || "000"}/${yy}-${digits(G, 4)}`;
  if (kind === "svc") return `С/643/${ISO[client] || "000"}/${yy}-${digits(G, 4)}`;
  return `${yy}-${digits(G, 4)}/ГП`;
}

function makeStartContract(G, s) {
  const v = VAR[s.v];
  const P = s.kind === "exp" ? PARTNER[s.client] : null;
  let cur = "RUB", price = s.price, advRub, advCur;
  if (price == null) price = round3(stdCost(G, s.v) * (1 + (s.m ?? 0.06)));
  if (P && !P.csto) {
    cur = P.cur;
    const usd = s.price;                              // цена задана в $ млн
    price = (usd * G.m.usd) / rate(G, cur);           // в валюте контракта
    advCur = price * s.qty * s.adv;
    advRub = usd * s.qty * s.adv * (s.rate || G.m.usd);
  } else {
    advCur = price * s.qty * s.adv;
    advRub = advCur;
  }
  const c = {
    id: nextId(G, "C"), no: contractNo(G, s.kind, s.client), kind: s.kind, client: s.client, v: s.v, qty: s.qty, done: 0,
    price, cur, due: s.due, t0: -Math.max(3, Math.round(VAR[s.v].cycle * 0.6)), adv: advCur, advRub, advLeft: advRub,
    restr: s.kind === "goz" ? advRub * 0.42 : 0, recv: [], pen: 0, status: "active", prio: 0, hold: false,
    pkg: s.kind === "exp" ? pkgShare(v, P) : 0, offset: 0, fin: "none", svc: false, late: 0, rev: 0, cost: 0,
  };
  return c;
}

/* Доля экспортного сопровождения: обучение, ЗИП, документация и комиссия спецэкспортёра */
export function pkgShare(v, P) {
  if (P && P.csto) return 0.05;
  if (v.unit === "двигатель" || v.unit === "комплект" || v.unit === "машинокомплект") return 0.07;
  return 0.19;
}

/* Расставляет по линиям изделия в работе так, чтобы поставки по старым контрактам шли с первых месяцев. */
function seedWip(G) {
  const out = {};
  for (const c of G.contracts) out[c.v] = (out[c.v] || 0) + (c.qty - c.done);
  for (const [id, s] of Object.entries(G.stock)) if (out[id]) out[id] = Math.max(0, out[id] - s.n);
  const fill = (f) => (f.cat === "engine" ? 0.8 : 0.92);
  const plan = {};   // сколько изделий каждого варианта поставить в работу
  // в работе столько изделий, сколько нужно, чтобы успеть к сроку (с запасом 15%)
  const due = {};
  for (const c of G.contracts) due[c.v] = Math.min(due[c.v] ?? 1e9, c.due);
  const wipNeed = (v) => {
    const n = out[v.id] || 0;
    if (!n) return 0;
    const months = Math.max(v.cycle, (due[v.id] ?? v.cycle * 2) + 1);
    return Math.min(n, Math.ceil((n / months) * v.cycle * 1.15));
  };
  const place = (line, f) => {
    const vs = f.variants.filter((v) => !v.locked && wipNeed(v) > 0);
    const want = Object.fromEntries(vs.map((v) => [v.id, wipNeed(v)]));
    const total = vs.reduce((s, v) => s + want[v.id], 0);
    if (!total) return;
    const cap = Math.floor(line.slots * fill(f));
    if (total <= cap) { for (const v of vs) plan[v.id] = want[v.id]; return; }
    let used = 0;
    const shares = vs.map((v) => { const x = (cap * want[v.id]) / total; const n = Math.max(1, Math.floor(x)); used += n; return { v, n, frac: x - Math.floor(x) }; });
    shares.sort((a, b) => b.frac - a.frac);
    for (const sh of shares) if (used < cap) { sh.n++; used++; }
    for (const sh of shares) plan[sh.v.id] = Math.min(want[sh.v.id], sh.n);
  };
  // сначала конечные изделия
  for (const e of Object.values(G.ents)) for (const line of e.lines) { const f = FAM[line.fam]; if (!f.locked && f.cat !== "engine") place(line, f); }
  // потребность в двигателях: изделия в работе + ещё не запущенные по контрактам
  const compNeed = {};
  for (const [vid, n] of Object.entries(out)) for (const [cid, k] of Object.entries(compsOf(G, vid))) compNeed[cid] = (compNeed[cid] || 0) + n * k;
  for (const [cid, n] of Object.entries(compNeed)) if (VAR[cid]) out[cid] = (out[cid] || 0) + Math.max(0, n - (G.stock[cid]?.n || 0));
  for (const e of Object.values(G.ents)) for (const line of e.lines) { const f = FAM[line.fam]; if (!f.locked && f.cat === "engine") place(line, f); }
  // изделия равномерно по стадиям готовности
  for (const e of Object.values(G.ents)) {
    const labRate = (e.wageR * e.rwage * 1.3) / 1000 + e.oh / e.staff;
    for (const line of e.lines) {
      for (const v of FAM[line.fam].variants) {
        const n = plan[v.id] || 0;
        for (let i = 0; i < n; i++) {
          const p = n === 1 ? 0.6 : 0.05 + (0.9 * (i + 0.5)) / n;
          line.wip.push({ v: v.id, p, c: matCost(G, v.id) + p * v.lab * labRate, w: 0, r: 0 });
        }
      }
    }
  }
}
