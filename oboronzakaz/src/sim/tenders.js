/* Экспортные тендеры. Партнёр объявляет конкурс; мы предлагаем модификацию, цену, финансирование, офсет и сервис.
   Победитель определяется по полезности для заказчика: цена, техника, политика, офсет, условия оплаты, сроки. */
import { PARTNERS, PARTNER } from "../data/partners.js";
import { COMPETITORS, TCATS, COUNTRIES } from "../data/competitors.js";
import { EXPOS } from "../data/scenario.js";
import { VAR, FAM, eligibleVariants, techOf, listUsd, stdCost } from "./catalog.js";
import { rate } from "./macro.js";
import { chance, uni, irand, clamp, gauss, pickW, shuffle, nextId, lerp, rand, monthOf, yearOf } from "./util.js";
import { logF, fmtM, spend, plAdd } from "./finance.js";
import { signContract } from "./contracts.js";
import { DIFFS } from "./state.js";

const COMP = Object.fromEntries(COMPETITORS.map((c) => [c.id, c]));
export const compById = (id) => COMP[id];

/* Цена в $ млн за единицу для сравнения (для ОДКБ наши цены — в рублях) */
export function bidUsd(G, T, bid) {
  const P = PARTNER[T.partner];
  return P.csto ? bid.price / G.m.usd : bid.price;
}
export function ourList(G, T, vid) {
  const P = PARTNER[T.partner];
  if (P.csto && VAR[vid].mk === "goz") return Math.round(stdCost(G, vid) * 1.12);   // ₽ млн
  return Math.round(listUsd(G, vid) * 10) / 10;                                        // $ млн
}

function polRu(G, P) {
  const pp = G.partners[P.id];
  const caatsa = P.caatsa * (G.m.sanc / 100) * 0.55;
  return (pp.pref.ru || 0) * (0.4 + (0.8 * pp.rel) / 100) - caatsa;
}

function scoreOf(G, T, cand, ref) {
  const P = PARTNER[T.partner];
  const D = DIFFS[G.diff] || DIFFS.normal;
  let s = 2.2 * Math.log(ref / Math.max(0.01, cand.price)) * P.wPrice;
  s += ((cand.tech - 80) / 8) * P.wTech;
  s += 3 * (cand.pol - 0.5) * P.wPol;
  s += P.offset * 4 * (cand.offset || 0);
  if (cand.fin === "state") s += 0.6 + (1 - P.pay);
  else if (cand.fin === "vendor") s += 0.35;
  if (cand.svc) s += 0.3;
  s -= 0.06 * Math.max(0, (cand.months || T.months) - T.months);
  const total = cand.price * T.qty;
  if (total > T.budget) s -= 6 * Math.log(total / T.budget);
  if (cand.us) s += (G.rep - 60) / 40 - D.comp * 0.4;
  return s;
}

/* Вероятности исхода тендера при данной заявке (или без неё) */
export function odds(G, T, bid) {
  const cands = T.comp.map((c) => {
    const C = COMP[c.id];
    return { id: c.id, price: c.price, tech: C.tech, pol: G.partners[T.partner].pref[C.c] || 0, offset: c.offset, fin: c.fin, months: T.months };
  });
  if (bid && bid.v) {
    cands.push({ id: "us", us: true, price: bidUsd(G, T, bid), tech: techOf(G, bid.v), pol: polRu(G, PARTNER[T.partner]), offset: bid.offset || 0, fin: bid.fin, svc: bid.svc, months: bid.months || T.months });
  }
  // Ориентир цены для заказчика — цены конкурентов и справедливая (прейскурантная) цена нашего изделия,
  // а не наша собственная заявка: иначе в прямых запросах цена не влияла бы на решение вплоть до бюджета.
  const prices = cands.filter((c) => !c.us).map((c) => c.price);
  if (bid && bid.v) prices.push(bidUsd(G, T, { ...bid, price: ourList(G, T, bid.v) }));
  prices.sort((a, b) => a - b);
  const ref = prices.length ? prices[Math.floor(prices.length / 2)] : 1;
  const sc = cands.map((c) => scoreOf(G, T, c, ref));
  const none = T.direct ? 0.4 : -1.2;
  const mx = Math.max(none, ...sc);
  const ex = sc.map((s) => Math.exp(s - mx));
  const exNone = Math.exp(none - mx);
  const tot = ex.reduce((a, b) => a + b, 0) + exNone;
  const res = { none: exNone / tot, list: cands.map((c, i) => ({ id: c.id, p: ex[i] / tot, score: sc[i] })) };
  res.us = res.list.find((x) => x.id === "us")?.p || 0;
  return res;
}
/* То, что видит игрок: без анализа рынка оценка шансов неточна */
export function shownOdds(G, T, bid) {
  const o = odds(G, T, bid);
  if (T.intel) return { p: o.us, exact: true, o };
  return { p: clamp(o.us + T.noise, 0.01, 0.97), exact: false, o };
}

/* ── генерация тендеров */
export function genTenders(G) {
  const made = [];
  const D = DIFFS[G.diff] || DIFFS.normal;
  for (const P of shuffle(G, [...PARTNERS])) {
    const pp = G.partners[P.id];
    if (pp.frozen > 0) continue;
    const open = G.tenders.filter((t) => t.partner === P.id && t.status === "open").length;
    if (open >= (P.budget >= 4 ? 2 : 1)) continue;
    if (G.t - pp.lastTender < 3) continue;
    const expoBoost = pp.expo > G.t ? 1.6 : 1;
    const p = 0.032 * Math.sqrt(P.budget) * (0.55 + pp.rel / 100) * expoBoost;
    if (!chance(G, p)) continue;
    const T = makeTender(G, P);
    if (T) { G.tenders.push(T); made.push(T); pp.lastTender = G.t; }
  }
  return made;
}

export function makeTender(G, P, forceCat) {
  const pp = G.partners[P.id];
  const cats = Object.keys(P.needs);
  let tcat = forceCat;
  let ours = [];
  for (let tries = 0; tries < 6 && !forceCat; tries++) {
    tcat = pickW(G, cats, (k) => P.needs[k]);
    ours = eligibleVariants(G, tcat, P);
    if (ours.length) break;
  }
  if (forceCat) ours = eligibleVariants(G, tcat, P);
  if (!ours.length) return null;
  // конкуренты
  const pool = COMPETITORS.filter((c) => c.cats.includes(tcat) && (pp.pref[c.c] || 0) > 0 && (!c.allies || (pp.pref.us || 0) >= 0.7));
  const direct = pool.length === 0 || ((pp.pref.ru || 0) >= 0.7 && pp.rel >= 65 && chance(G, 0.4));
  const comp = [];
  if (!direct) {
    const pick = [...pool];
    const n = Math.min(pick.length, irand(G, 1, 3));
    for (let i = 0; i < n; i++) {
      const c = pickW(G, pick, (x) => (pp.pref[x.c] || 0) * uni(G, 0.5, 1.5));
      if (!c) break;
      pick.splice(pick.indexOf(c), 1);
      const D = DIFFS[G.diff] || DIFFS.normal;
      comp.push({ id: c.id, price: Math.round(c.usd * G.m.usdInfl * uni(G, 0.9, 1.1) * (1 - D.comp * 0.08) * 10) / 10,
        offset: Math.round(P.offset * uni(G, 0, 0.35) * 100) / 100, fin: c.c === "cn" && chance(G, 0.5) ? "state" : c.c === "us" && chance(G, 0.3) ? "state" : "none" });
    }
  }
  // объём закупки
  const [qa, qb] = TCATS[tcat].qty;
  const ref = ours.map((v) => VAR[v].usd ? listUsd(G, v) : stdCost(G, v) * 1.12 / G.m.usd).reduce((a, b) => a + b, 0) / ours.length;
  let qty = Math.round(lerp(qa, qb, Math.pow(rand(G), 1.3) * Math.min(1, P.budget / 6)));
  const maxTotal = P.budget * 1000 * 2.2;
  if (qty * ref > maxTotal) qty = Math.floor(maxTotal / ref);
  if (qty < Math.max(1, Math.floor(qa / 2))) return null;
  const v0 = VAR[ours[0]];
  const months = clamp(Math.round(v0.cycle + qty / Math.max(0.3, (FAM[v0.fam].slots * 0.4) / v0.cycle) + irand(G, 0, 8)), 10, 48);
  return {
    id: nextId(G, "T"), partner: P.id, tcat, qty, budget: Math.round(qty * ref * uni(G, 1.05, 1.35)), t: G.t,
    close: G.t + irand(G, 2, 4), months, direct, comp, bid: null, intel: false, noise: gauss(G) * 0.12, status: "open", winner: null,
  };
}

export const INTEL_COST = 80;   // млн ₽ — анализ рынка и переговоры через атташе
export function buyIntel(G, id) {
  const T = G.tenders.find((x) => x.id === id);
  if (!T || T.intel) return;
  spend(G, INTEL_COST, "sga"); plAdd(G, "sga", INTEL_COST);
  T.intel = true;
}

export function submitBid(G, id, bid) {
  const T = G.tenders.find((x) => x.id === id);
  if (!T || T.status !== "open") return;
  T.bid = bid ? { ...bid } : null;
}

/* ── подведение итогов */
export function resolveTenders(G) {
  for (const T of G.tenders) {
    if (T.status !== "open" || T.close > G.t) continue;
    const P = PARTNER[T.partner], pp = G.partners[T.partner];
    const o = odds(G, T, T.bid);
    let r = rand(G);
    let win = null;
    for (const x of o.list) { r -= x.p; if (r <= 0) { win = x.id; break; } }
    T.status = win === "us" ? "won" : win ? "lost" : "cancelled";
    T.winner = win;
    T.decided = G.t;
    if (win === "us") {
      const v = VAR[T.bid.v];
      const cur = P.cur;
      const priceCur = P.csto ? T.bid.price : (T.bid.price * G.m.usd) / rate(G, cur);
      const adv = T.bid.fin === "vendor" ? 0.1 : P.pay >= 0.85 ? 0.3 : 0.2;
      const usdTotal = bidUsd(G, T, T.bid) * T.qty;
      const c = signContract(G, { kind: "exp", client: P.id, v: v.id, qty: T.qty, price: priceCur, cur, adv, due: G.t + (T.bid.months || T.months),
        offset: T.bid.offset || 0, fin: T.bid.fin, svcPack: T.bid.svc, ins: T.bid.ins, usd: usdTotal });
      if (T.bid.fin === "state") { G.trust -= 1.5; c.statePay = true; }
      T.contract = c.id;
      G.stats.tendersWon++; G.stats.expUsd += usdTotal;
      pp.rel = clamp(pp.rel + 3, 0, 100);
      G.rep += 0.5;
      logF(G, `Победа в тендере: ${P.name} покупает ${v.name} × ${T.qty} на $${Math.round(usdTotal).toLocaleString("ru-RU")} млн.`, "star", { tender: T.id });
    } else if (win) {
      const C = COMP[win];
      pp.pref[C.c] = clamp((pp.pref[C.c] || 0) + 0.02, 0, 1);
      if (T.bid) {
        G.stats.tendersLost++;
        logF(G, `Тендер проигран: ${P.name} выбрала ${C.name} (${COUNTRIES[C.c]}). ${T.intel ? `Цена конкурента — $${T.comp.find((x) => x.id === win).price} млн за единицу.` : ""}`, "warn", { tender: T.id });
      } else logF(G, `${P.name} закупила ${C.name} (${COUNTRIES[C.c]}) — ${TCATS[T.tcat].name.toLowerCase()}, ${T.qty} ед. Мы не участвовали.`, "info", { tender: T.id });
    } else if (T.bid) logF(G, `${P.name} отменила конкурс: ${TCATS[T.tcat].name.toLowerCase()}.`, "info", { tender: T.id });
  }
  // хранить только недавние итоги
  G.tenders = G.tenders.filter((T) => T.status === "open" || G.t - T.decided < 12);
}

/* ── выставки и дипломатия */
export function exposThisYear(G) {
  const y = yearOf(G.t);
  return EXPOS.filter((x) => (x.odd ? y % 2 === 1 : y % 2 === 0)).map((x) => ({ ...x, t: (y - 2026) * 12 + x.month }));
}
export function joinExpo(G, id) {
  const ex = exposThisYear(G).find((x) => x.id === id);
  if (!ex || G.expos[`${id}${yearOf(G.t)}`]) return;
  const cost = ex.cost * G.m.cpi;
  spend(G, cost, "sga"); plAdd(G, "sga", cost);
  G.expos[`${id}${yearOf(G.t)}`] = { t: ex.t, done: false };
  logF(G, `Подтверждено участие в выставке ${ex.name} (${ex.city}). Расходы ${fmtM(cost)}.`, "exp");
}
export function stepExpos(G) {
  for (const ex of exposThisYear(G)) {
    if (ex.t !== G.t) continue;
    const reg = G.expos[`${ex.id}${yearOf(G.t)}`];
    if (!reg) continue;
    reg.done = true;
    for (const pid of ex.focus) {
      const pp = G.partners[pid];
      if (!pp) continue;
      pp.rel = clamp(pp.rel + uni(G, 2, 5), 0, 100);
      pp.expo = G.t + 6;
    }
    G.rep += 1;
    logF(G, `Выставка ${ex.name}: переговоры с делегациями (${ex.focus.map((p) => PARTNER[p]?.name).filter(Boolean).join(", ")}). Отношения улучшились, ждём запросов.`, "exp");
  }
}
export const DELEGATION_COST = 150;
export function sendDelegation(G, pid) {
  const pp = G.partners[pid];
  if (!pp || pp.deleg > G.t) return;
  const cost = DELEGATION_COST * G.m.cpi;
  spend(G, cost, "sga"); plAdd(G, "sga", cost);
  pp.rel = clamp(pp.rel + uni(G, 2, 6), 0, 100);
  pp.deleg = G.t + 6;
  pp.expo = Math.max(pp.expo || 0, G.t + 3);
  logF(G, `Делегация в ${PARTNER[pid].name}: переговоры о военно-техническом сотрудничестве. Расходы ${fmtM(cost)}.`, "exp");
}

export { COMP, COUNTRIES, TCATS };
