/* Контракты: поставки и приёмка, выручка и себестоимость, оплата, неустойки, предложения ГОЗ и гражданских заказчиков,
   сервисные контракты. */
import { PARTNER } from "../data/partners.js";
import { GOZ_CLIENTS } from "../data/scenario.js";
import { CIV_CLIENTS } from "../data/products.js";
import { ENT } from "../data/enterprises.js";
import { FAM, VAR, stdCost, unlocked, famOf, entOfVar, compsOf } from "./catalog.js";
import { STOCK_ONLY } from "../data/products.js";
import { rate, toRub } from "./macro.js";
import { rand, uni, irand, chance, clamp, monthOf, yearOf, nextId, dateStr, sum, pickW } from "./util.js";
import { spend, receive, receiveFx, plAdd, cfAdd, logF, fmtM } from "./finance.js";
import { contractNo, pkgShare, DIFFS } from "./state.js";
import { capacity } from "./workforce.js";

export const clientName = (c) => GOZ_CLIENTS[c.client] || CIV_CLIENTS[c.client] || PARTNER[c.client]?.name || c.client;
export const remaining = (c) => c.qty - c.done;
export const value = (c) => c.qty * c.price;

/* Вероятность брака на приёмке военным представительством */
export function defectRate(G, e) {
  const tr = sum(e.trainees) / Math.max(1, e.staff);
  return clamp(0.03 + 0.12 * Math.max(0, e.wear - 0.4) + 0.25 * tr - 0.015 * (e.eq - 3) - G.bonus.quality, 0.005, 0.3);
}

/* ── поставки со склада по контрактам */
export function stepDeliveries(G) {
  const rep = { units: {}, rev: 0, rejects: 0 };
  const act = G.contracts.filter((c) => c.status === "active" && !c.hold && c.kind !== "svc" && remaining(c) > 0)
    .sort((a, b) => (b.prio || 0) - (a.prio || 0) || a.due - b.due);
  for (const c of act) {
    const s = G.stock[c.v];
    if (!s || s.n <= 0) continue;
    let k = Math.min(s.n, remaining(c));
    if (k <= 0) continue;
    const unitC = s.c / s.n;
    // приёмка ВП МО: бракованные изделия возвращаются на доработку
    if (c.kind === "goz" && !G._fc) {
      const ent = G.ents[famOf(c.v).ent];
      const q = defectRate(G, ent);
      let bad = 0;
      for (let i = 0; i < k; i++) if (chance(G, q)) bad++;
      if (bad > 0) {
        const line = ent.lines.find((l) => l.fam === VAR[c.v].fam);
        for (let i = 0; i < bad; i++) line.wip.push({ v: c.v, p: 0.85, c: unitC * 1.03, w: 0, r: 1, cc: 1, t: G.t });
        s.n -= bad; s.c -= unitC * bad;
        const extra = unitC * 0.03 * bad;
        spend(G, extra, "materials");
        rep.rejects += bad; G.stats.rejects += bad;
        G.trust -= 0.2 * bad * clamp(c.price / 2000, 0.02, 1);
        logF(G, `Военное представительство вернуло на доработку: ${VAR[c.v].name} × ${bad}. Брак на ${ENT[ent.id].short} — ${Math.round(q * 100)}% (износ фондов, доля новичков).`, "warn");
        k -= bad;
        if (k <= 0) continue;
      }
    }
    deliver(G, c, k, unitC);
    rep.units[c.v] = (rep.units[c.v] || 0) + k;
  }
  return rep;
}

export function deliver(G, c, k, unitC) {
  const s = G.stock[c.v];
  s.n -= k; s.c -= unitC * k;
  if (s.n <= 0) { s.n = 0; s.c = 0; }
  const cogs = unitC * k;
  const advCur = (c.adv * k) / c.qty;
  const offset = Math.min(c.advLeft, (c.advRub * k) / c.qty);
  c.advLeft -= offset;
  const dueCur = k * c.price - advCur;
  const r = rate(G, c.cur);
  const rev = offset + dueCur * r;
  plAdd(G, "cogs", cogs);
  const seg = c.kind === "goz" ? "revGoz" : c.kind === "exp" ? "revExp" : "revCiv";
  plAdd(G, seg, rev);
  c.done += k; c.rev += rev; c.cost += cogs;
  const onTime = G.t <= c.due;
  if (c.kind === "goz") {
    G.stats.gozUnits += k; if (onTime) G.stats.gozOnTime += k; else G.stats.gozLate += k;
    if (G.ev.active.sequester) c.recv.push({ amt: dueCur, due: G.t + irand(G, 1, 3) });
    else receive(G, dueCur, "inGoz");
  } else if (c.kind === "civ") {
    receive(G, dueCur, "inCiv");
  } else {
    const P = PARTNER[c.client];
    G.stats.expUnits += k;
    // экспортное сопровождение: обучение, ЗИП, документация, комиссия спецэкспортёра; офсет
    const pkg = (c.pkg + c.offset * 0.5) * k * c.price * r;
    spend(G, pkg, "sga"); plAdd(G, "pkg", pkg);
    const delay = c.fin === "vendor" ? 18 : c.statePay ? 1 : payDelay(G, P);
    c.recv.push({ amt: dueCur, due: G.t + delay });
    const pp = G.partners[c.client];
    pp.fleet[VAR[c.v].fam] = (pp.fleet[VAR[c.v].fam] || 0) + k;
    pp.rel = clamp(pp.rel + 0.3 * k * (onTime ? 1 : 0.3), 0, 100);
    // рекламации проявятся позже
    const q = defectRate(G, G.ents[famOf(c.v).ent]) * 0.5;
    for (let i = 0; i < k; i++) if (chance(G, q)) (G._claims = G._claims || []).push({ c: c.id, t: G.t + irand(G, 1, 6), amt: c.price * r * 0.03 });
  }
  if (c.done >= c.qty) completeContract(G, c);
  return rev;
}

function payDelay(G, P) {
  const p = P.pay - (G.ev.active.payChannel ? 0.2 : 0);
  if (p >= 0.9) return 1;
  if (p >= 0.75) return irand(G, 1, 3);
  if (p >= 0.6) return irand(G, 2, 6);
  return irand(G, 3, 12);
}

export function completeContract(G, c) {
  c.status = "done";
  c.doneT = G.t;
  if (c.restr > 0) { receive(G, c.restr, "inGoz"); c.restr = 0; }
  if (c.advLeft > 0.01) { plAdd(G, "otherInc", c.advLeft); c.advLeft = 0; }
  const onTime = G.t <= c.due;
  const valRub = c.qty * c.price * rate(G, c.cur);
  if (c.kind === "goz") {
    const dt = clamp(valRub / 80000, 0.1, 1.2) * (onTime ? 1 : -0.6);
    G.trust += dt;
    logF(G, `Контракт ${c.no} (${VAR[c.v].name} × ${c.qty}) исполнен${onTime ? " в срок" : " с опозданием"}. Доверие государства ${dt >= 0 ? "+" : ""}${dt.toFixed(1)}`, onTime ? "ok" : "warn", { c: c.id });
  } else if (c.kind === "exp") {
    G.rep += onTime ? clamp(valRub / 60000, 0.3, 2) : -0.5;
    G.partners[c.client].rel = clamp(G.partners[c.client].rel + (onTime ? 4 : -2), 0, 100);
    logF(G, `Экспортный контракт ${c.no} с заказчиком «${clientName(c)}» исполнен${onTime ? " в срок" : " с опозданием"}.`, onTime ? "ok" : "warn", { c: c.id });
  } else {
    logF(G, `Гражданский контракт ${c.no} (${VAR[c.v].name} × ${c.qty}) исполнен.`, "ok", { c: c.id });
  }
}

/* ── оплата дебиторской задолженности, рекламации, неустойки */
export function stepPayments(G) {
  for (const c of G.contracts) {
    if (!c.recv.length) continue;
    const P = PARTNER[c.client];
    const keep = [];
    for (const r of c.recv) {
      if (r.due > G.t) { keep.push(r); continue; }
      const pPay = c.kind === "exp" ? (c.statePay ? 0.98 : clamp(P.pay + 0.15 - (G.ev.active.payChannel ? 0.25 : 0), 0.05, 0.98)) : 0.9;
      if (chance(G, pPay)) {
        const key = c.kind === "goz" ? "inGoz" : c.kind === "civ" ? "inCiv" : c.kind === "svc" ? "inSvc" : "inExp";
        receiveFx(G, c.cur, r.amt, key);
      } else {
        r.late = (r.late || 0) + 1;
        r.due = G.t + 1;
        if (c.kind === "exp" && r.late > 9 && chance(G, (1 - P.pay) * 0.12)) {
          const loss = r.amt * rate(G, c.cur);
          const ins = c.ins ? loss * 0.9 : 0;
          plAdd(G, "other", loss); if (ins) { plAdd(G, "otherInc", ins); receive(G, ins, "inExp"); }
          G.partners[c.client].rel -= 5;
          logF(G, `${P.name} не оплатила поставку по контракту ${c.no}: списано ${fmtM(loss)}${ins ? `, страховка ЭКСАР возместила ${fmtM(ins)}` : ""}.`, "crit", { c: c.id });
          continue;
        }
        keep.push(r);
      }
    }
    c.recv = keep;
  }
  // рекламации по экспортным поставкам
  if (G._claims && G._claims.length) {
    const rest = [];
    for (const cl of G._claims) {
      if (cl.t > G.t) { rest.push(cl); continue; }
      const c = G.contracts.find((x) => x.id === cl.c);
      if (!c) continue;
      spend(G, cl.amt, "other"); plAdd(G, "other", cl.amt);
      G.rep -= 0.3;
      G.partners[c.client].rel = clamp(G.partners[c.client].rel - 1.5, 0, 100);
      logF(G, `Рекламация от заказчика «${clientName(c)}» по ${VAR[c.v].name}: гарантийный ремонт ${fmtM(cl.amt)}.`, "warn", { c: c.id });
    }
    G._claims = rest;
  }
}

export function stepPenalties(G) {
  for (const c of G.contracts) {
    if (c.status !== "active" || c.kind === "svc") continue;
    const rem = remaining(c);
    if (rem <= 0 || G.t <= c.due) continue;
    c.late = (c.late || 0) + 1;
    const r = rate(G, c.cur);
    const overdue = rem * c.price * r;
    let pen = 0;
    if (c.kind === "goz") {
      pen = overdue * (G.m.key / 100) / 10;     // 1/300 ключевой ставки за каждый день просрочки
      const w = clamp(overdue / 15000, 0.3, 2);
      G.trust -= 0.3 * w;
      if (c.late === 12) { G.trust -= 3; pen += overdue * 0.05; logF(G, `Минобороны взыскало через арбитраж штраф по контракту ${c.no}: просрочка год.`, "crit", { c: c.id }); }
    } else {
      const cap = 0.1 * c.qty * c.price * r;
      pen = Math.min(overdue * (c.kind === "exp" ? 0.005 : 0.003), Math.max(0, cap - c.pen));
      if (c.kind === "exp") {
        G.partners[c.client].rel = clamp(G.partners[c.client].rel - 1, 0, 100);
        G.rep -= clamp(overdue / 40000, 0.03, 0.25);
        if (c.late > 12 && chance(G, 0.25)) { cancelByClient(G, c); continue; }
      }
    }
    if (pen > 0) { c.pen += pen; spend(G, pen, "penalties"); plAdd(G, "pen", pen); }
  }
}

function cancelByClient(G, c) {
  const refund = c.advLeft;
  G.cash -= refund; cfAdd(G, "other", refund);
  c.advLeft = 0;
  c.status = "cancelled";
  G.partners[c.client].rel = clamp(G.partners[c.client].rel - 15, 0, 100);
  G.rep -= 4;
  logF(G, `${PARTNER[c.client].name} расторгла контракт ${c.no} из-за срыва сроков и потребовала вернуть аванс ${fmtM(refund)}.`, "crit", { c: c.id });
}

/* ── сервисные контракты: ежемесячная выручка, 55% — себестоимость запчастей и работ */
export function stepService(G) {
  for (const c of G.contracts) {
    if (c.kind !== "svc" || c.status !== "active") continue;
    const monthly = c.price / 12;
    const r = rate(G, c.cur);
    plAdd(G, "revSvc", monthly * r);
    const cost = monthly * r * 0.55;
    spend(G, cost, "materials"); plAdd(G, "cogs", cost);
    c.recv.push({ amt: monthly, due: G.t + (PARTNER[c.client].pay > 0.8 ? 0 : 2) });
    c.done += 1;
    c.rev += monthly * r; c.cost += cost;
    if (c.done >= c.qty) { c.status = "done"; c.doneT = G.t; }
  }
}

/* ── предложения ───────────────────────────────────────────── */
function gozMargin(G) { return 0.085 + (G.trust - 50) / 600 + (DIFFS[G.diff]?.gozMargin || 0); }
const round3 = (x) => { const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.abs(x))) - 2)); return Math.round(x / p) * p; };
const endOfYear = (t) => Math.floor(t / 12) * 12 + 11;

function deliveryMonths(G, vid, qty) {
  const v = VAR[vid], f = FAM[v.fam];
  const line = G.ents[f.ent].lines.find((l) => l.fam === f.id);
  const perMonth = Math.max(0.05, (0.55 * line.slots) / v.cycle);
  return clamp(Math.ceil(v.cycle + qty / perMonth), 8, 54);
}

export function makeGozOffer(G, vid, qty, opts = {}) {
  const v = VAR[vid];
  const margin = gozMargin(G) + (opts.urgent ? 0.04 : 0) + uni(G, -0.015, 0.015);
  const price = round3(stdCost(G, vid) * (1 + margin));
  const months = deliveryMonths(G, vid, qty) + (opts.urgent ? 0 : irand(G, 1, 5));
  const backlog = sum(G.contracts.filter((c) => c.status === "active" && c.v === vid), remaining);
  const v0 = VAR[vid], line = G.ents[FAM[v0.fam].ent].lines.find((l) => l.fam === v0.fam);
  const queue = Math.ceil(backlog / Math.max(0.05, (0.55 * line.slots) / v0.cycle));   // очередь на линии
  const due = opts.urgent ? G.t + months : opts.rolling ? endOfYear(G.t + Math.max(months, queue + Math.ceil(months * 0.6))) : endOfYear(endOfYear(G.t) + months);
  return {
    id: nextId(G, "O"), kind: "goz", client: opts.client || (vid === "tigrm" ? "rosgv" : "mo"), v: vid, qty, price, cur: "RUB",
    adv: v.cycle >= 18 ? uni(G, 0.6, 0.8) : uni(G, 0.5, 0.8), due, exp: opts.urgent || opts.rolling ? G.t + 2 : endOfYear(G.t), margin, urgent: !!opts.urgent,
    neg: {}, t: G.t, note: opts.note || "",
  };
}

/* Гособоронзаказ поступает непрерывно: когда задел по изделию становится меньше цикла изготовления плюс 4 месяца,
   Минобороны присылает проект нового контракта (или дополнительного соглашения к долгосрочному). */
export function genGozRolling(G) {
  const made = [];
  for (const v of Object.values(VAR)) {
    if (v.mk !== "goz" || !v.goz || !unlocked(G, v.id)) continue;
    if (G.offers.some((o) => o.kind === "goz" && o.v === v.id)) continue;
    const rate = v.goz / 12;
    const backlog = sum(G.contracts.filter((c) => c.status === "active" && c.kind === "goz" && c.v === v.id), remaining);
    const cover = backlog / rate;
    if (cover >= v.cycle + 4) continue;
    const k = G.m.gozBudget * (0.65 + G.trust / 250);
    if (!chance(G, clamp(0.45 * k, 0.1, 0.8))) continue;
    let qty;
    if (v.goz < 1) qty = 1;
    else if (v.goz <= 3) qty = Math.max(1, Math.round(v.goz * uni(G, 0.8, 1.6) * k));
    else qty = Math.max(1, Math.round(rate * uni(G, 9, 18) * k));
    const o = makeGozOffer(G, v.id, qty, { rolling: true });
    G.offers.push(o); made.push(o);
  }
  if (made.length) {
    const total = sum(made, (o) => o.qty * o.price);
    logF(G, `Минобороны направило ${made.length === 1 ? "проект контракта" : `проекты контрактов (${made.length})`}: ${made.map((o) => `${VAR[o.v].name} × ${o.qty}`).join(", ")} — на ${fmtM(total)}. Без ответа за два месяца будут подписаны на условиях заказчика.`, "goz");
  }
  return made;
}

/* (прежняя годовая кампания — используется в тестах сценариев) */
export function genGozCampaign(G) {
  const k = G.m.gozBudget * (0.75 + G.trust / 200);
  const list = [];
  for (const v of Object.values(VAR)) {
    if (v.mk !== "goz" || !v.goz || !unlocked(G, v.id)) continue;
    let qty;
    const base = v.goz * k * uni(G, 0.7, 1.3);
    if (v.goz <= 3) qty = chance(G, Math.min(1, base)) ? Math.max(1, Math.round(base)) : 0;
    else qty = Math.round(base);
    // если по изделию уже большой задел — заказ меньше
    const backlog = sum(G.contracts.filter((c) => c.status === "active" && c.v === v.id), remaining);
    if (backlog > v.goz * 1.5) qty = Math.round(qty * 0.5);
    if (qty < 1) continue;
    list.push(makeGozOffer(G, v.id, qty));
  }
  G.offers.push(...list);
  const total = sum(list, (o) => o.qty * o.price);
  logF(G, `Минобороны направило проекты контрактов ГОЗ на ${yearOf(G.t) + 1} год: ${list.length} позиций на ${fmtM(total)}. Не принятые до конца декабря будут заключены на условиях заказчика.`, "goz");
  return list;
}

export function genUrgentGoz(G) {
  const vs = Object.values(VAR).filter((v) => v.mk === "goz" && v.goz && unlocked(G, v.id) && v.cycle <= 10);
  const v = pickW(G, vs, (x) => Math.sqrt(x.goz));
  if (!v) return null;
  const qty = Math.max(1, Math.round(v.goz * uni(G, 0.15, 0.35)));
  const o = makeGozOffer(G, v.id, qty, { urgent: true, note: "Срочный дополнительный заказ" });
  G.offers.push(o);
  logF(G, `Срочный дополнительный заказ Минобороны: ${v.name} × ${qty}, срок до ${dateStr(o.due)}.`, "goz");
  return o;
}

export function civDemand(G, v) {
  const key = G.m.key;
  switch (v.client) {
    case "rail": return clamp(1.55 - key / 18, 0.25, 1.3);
    case "aero": case "gtlk": return clamp(1.35 - key / 28, 0.5, 1.15);
    case "gazprom": return clamp(G.m.oil / 65, 0.6, 1.3);
    default: return 1;
  }
}

export function genCivilOffers(G) {
  const made = [];
  for (const v of Object.values(VAR)) {
    if (v.mk !== "civ" || !unlocked(G, v.id)) continue;
    const dem = civDemand(G, v);
    if (!chance(G, 0.65 * Math.min(1, dem))) continue;
    const qty = Math.max(1, Math.round((v.civ / 4) * dem * uni(G, 0.6, 1.6)));
    const price = round3(stdCost(G, v.id) * uni(G, 1.03, 1.12));
    const months = deliveryMonths(G, v.id, qty) + irand(G, 2, 8);
    const o = { id: nextId(G, "O"), kind: "civ", client: v.client, v: v.id, qty, price, cur: "RUB", adv: uni(G, 0.1, 0.3), due: G.t + months, exp: G.t + 2, neg: {}, t: G.t };
    G.offers.push(o); made.push(o);
  }
  return made;
}

/* Сервисные контракты на поддержание парка нашей техники у партнёров (каждый январь) */
export function genServiceOffers(G) {
  for (const [pid, pp] of Object.entries(G.partners)) {
    const P = PARTNER[pid];
    if (pp.rel < 30 || pp.frozen > 0) continue;
    if (G.contracts.some((c) => c.kind === "svc" && c.client === pid && c.status === "active")) continue;
    let usd = 0;
    for (const [fid, n] of Object.entries(pp.fleet)) {
      const f = FAM[fid]; if (!f || !n) continue;
      const ev = f.variants.find((x) => x.mk === "exp") || f.variants[0];
      const unitUsd = ev.usd || (ev.price || 0) / G.m.usd;
      usd += n * unitUsd;
    }
    let annualUsd = usd * 0.5 * 0.02 * clamp(pp.rel / 80, 0.4, 1.2);
    if (annualUsd < 5) continue;
    const cur = P.cur;
    const amt = (annualUsd * G.m.usd) / rate(G, cur);
    signContract(G, { kind: "svc", client: pid, v: null, qty: 12, price: amt, cur, adv: 0, due: G.t + 12, usd: annualUsd });
  }
}

/* ── решения по предложениям ── */
export function acceptOffer(G, id) {
  const o = G.offers.find((x) => x.id === id);
  if (!o) return null;
  G.offers = G.offers.filter((x) => x !== o);
  return signContract(G, o);
}

export function signContract(G, o) {
  const r = rate(G, o.cur);
  const advCur = o.qty * o.price * (o.adv || 0);
  const advRub = advCur * r;
  const P = PARTNER[o.client];
  const c = {
    id: nextId(G, "C"), no: contractNo(G, o.kind, o.client), kind: o.kind, client: o.client, v: o.v, qty: o.qty, done: 0,
    price: o.price, cur: o.cur, due: o.due, t0: G.t, adv: advCur, advRub, advLeft: advRub, restr: 0, recv: [], pen: 0,
    status: "active", prio: 0, hold: false, pkg: o.kind === "exp" ? pkgShare(VAR[o.v], P) : 0, offset: o.offset || 0,
    fin: o.fin || "none", svc: !!o.svcPack, late: 0, rev: 0, cost: 0, ins: !!o.ins, usd: o.usd || 0,
  };
  if (o.kind === "goz") { c.restr = advRub; G._restrIn = (G._restrIn || 0) + advRub; }
  else if (advCur > 0) receiveFx(G, o.cur, advCur, "inAdv");
  if (o.ins) { const prem = o.qty * o.price * r * 0.025; spend(G, prem, "sga"); plAdd(G, "sga", prem); }
  if (o.kind === "svc") { c.advLeft = 0; }
  G.contracts.push(c);
  const what = o.kind === "svc" ? `сервисное обслуживание парка, ${fmtM(o.price * r)} в год` : `${VAR[o.v].name} × ${o.qty} на ${fmtM(o.qty * o.price * r)}`;
  logF(G, `Подписан контракт ${c.no} — ${clientName(c)}: ${what}, срок до ${dateStr(c.due)}.`, o.kind === "goz" ? "goz" : o.kind === "exp" || o.kind === "svc" ? "exp" : "civ", { c: c.id });
  return c;
}

export function declineOffer(G, id) {
  const o = G.offers.find((x) => x.id === id);
  if (!o) return;
  G.offers = G.offers.filter((x) => x !== o);
  if (o.kind === "goz") {
    const dt = clamp(1 + (o.qty * o.price) / 50000, 1, 5);
    G.trust -= dt;
    logF(G, `Отказ от контракта ГОЗ (${VAR[o.v].name} × ${o.qty}). Доверие государства −${dt.toFixed(1)}`, "warn");
  } else if (o.kind === "svc") {
    G.partners[o.client].rel -= 3;
  }
}

/* Переговоры по проекту контракта ГОЗ: поднять цену на 5% или сдвинуть срок на полгода */
export function negotiate(G, id, what) {
  const o = G.offers.find((x) => x.id === id);
  if (!o || o.kind !== "goz" || o.neg[what]) return null;
  o.neg[what] = true;
  const p = what === "price" ? clamp(0.2 + G.trust / 180, 0.1, 0.75) : clamp(0.35 + G.trust / 200, 0.2, 0.85);
  const ok = chance(G, p);
  if (ok) {
    if (what === "price") { o.price = round3(o.price * 1.05); o.margin += 0.05; }
    else o.due += 6;
    logF(G, `Переговоры с Минобороны по ${VAR[o.v].name}: ${what === "price" ? "цена повышена на 5%" : "срок продлён на 6 месяцев"}.`, "ok");
  } else {
    G.trust -= what === "price" ? 0.6 : 0.3;
    logF(G, `Минобороны отклонило ${what === "price" ? "повышение цены" : "перенос срока"} по ${VAR[o.v].name}. Доверие государства −${what === "price" ? "0,6" : "0,3"}`, "warn");
  }
  return ok;
}
export const negotiateChance = (G, what) => (what === "price" ? clamp(0.2 + G.trust / 180, 0.1, 0.75) : clamp(0.35 + G.trust / 200, 0.2, 0.85));

/* Истёкшие предложения: ГОЗ принимается на условиях заказчика, остальные снимаются */
export function expireOffers(G) {
  const exp = G.offers.filter((o) => o.exp <= G.t);
  for (const o of exp) {
    G.offers = G.offers.filter((x) => x !== o);
    if (o.kind === "goz") signContract(G, o);
    else if (o.kind === "svc") G.partners[o.client].rel -= 2;
  }
}

/* Оценка: сколько месяцев нужно, чтобы выполнить заказ, с учётом текущей загрузки линии */
export function feasibility(G, o) {
  const v = VAR[o.v], f = FAM[v.fam], e = G.ents[f.ent];
  const line = e.lines.find((l) => l.fam === f.id);
  const backlog = sum(G.contracts.filter((c) => c.status === "active" && VAR[c.v] && VAR[c.v].fam === f.id), remaining);
  const cap = capacity(G, e).cap;
  const laborRate = cap * 0.9 / Math.max(1, v.lab);                     // изделий в месяц, если всё предприятие делает только это
  const slotRate = line.slots / v.cycle;
  const rateU = Math.max(0.01, Math.min(laborRate, slotRate));
  const months = Math.ceil(v.cycle + (backlog + o.qty) / rateU);
  // двигатели, которые больше не выпускаются (Д-136, PW207K), — только из запаса
  let short = null;
  for (const [cid, k] of Object.entries(compsOf(G, o.v))) {
    if (!STOCK_ONLY[cid]) continue;
    // всё, что ещё не поставлено по контрактам, потребует двигателей из того же запаса
    const committed = sum(G.contracts.filter((c) => c.status === "active" && VAR[c.v] && (compsOf(G, c.v)[cid] || 0) > 0), (c) => remaining(c) * (compsOf(G, c.v)[cid] || 0));
    const free = (G.stock[cid]?.n || 0) - committed;
    if (free < o.qty * k) short = { id: cid, need: o.qty * k, free: Math.max(0, Math.floor(free)) };
  }
  return { months, ok: G.t + months <= o.due && !short, backlog, slotRate, laborRate, short };
}

export { entOfVar, toRub };
