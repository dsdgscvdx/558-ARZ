/* Производство. Каждая линия ведёт до slots изделий одновременно. Запуск изделия оплачивает материалы и ЭКБ
   (для ГОЗ — с отдельного счёта контракта). Каждый месяц изделие продвигается на 1/cycle, если хватает людей;
   на окончательной сборке ставятся двигатели собственного производства — без них изделие ждёт.
   Зарплата и накладные распределяются на изделия в работе, неиспользованная часть — простой. */
import { ENT } from "../data/enterprises.js";
import { STOCK_ONLY } from "../data/products.js";
import { FAM, VAR, compsOf, matCost, unlocked, isComp } from "./catalog.js";
import { capacity, payroll } from "./workforce.js";
import { spend, cfAdd, plAdd, logF, odLimit } from "./finance.js";
import { sum } from "./util.js";

/* ── спрос: незакрытые заказы по вариантам и потребность в двигателях */
export function demand(G) {
  const out = {}, due = {};
  for (const c of G.contracts) {
    if (c.status !== "active" || c.hold) continue;
    const rem = c.qty - c.done;
    if (rem <= 0) continue;
    out[c.v] = (out[c.v] || 0) + rem;
    due[c.v] = Math.min(due[c.v] ?? 1e9, c.due);
  }
  const wipN = {}, wipNoComp = {};
  for (const e of Object.values(G.ents)) for (const l of e.lines) for (const u of l.wip) {
    wipN[u.v] = (wipN[u.v] || 0) + 1;
    if (!u.cc) wipNoComp[u.v] = (wipNoComp[u.v] || 0) + 1;
  }
  const net = {};
  for (const [v, n] of Object.entries(out)) net[v] = n - (G.stock[v]?.n || 0) - (wipN[v] || 0);
  // ручной план запуска тоже создаёт потребность в двигателях
  const planned = {};
  for (const e of Object.values(G.ents)) for (const l of e.lines) if (!l.auto) for (const [v, n] of Object.entries(l.plan)) planned[v] = (planned[v] || 0) + n * 3;
  const comp = {};
  const compDue = {};
  for (const vid of new Set([...Object.keys(out), ...Object.keys(wipNoComp), ...Object.keys(planned)])) {
    if (!VAR[vid]) continue;
    const units = (wipNoComp[vid] || 0) + Math.max(0, net[vid] || 0) + (planned[vid] || 0);
    if (units <= 0) continue;
    for (const [cid, k] of Object.entries(compsOf(G, vid))) {
      comp[cid] = (comp[cid] || 0) + units * k;
      compDue[cid] = Math.min(compDue[cid] ?? 1e9, due[vid] ?? G.t + 24);
    }
  }
  for (const [cid, n] of Object.entries(comp)) {
    if (!VAR[cid]) continue;
    net[cid] = (net[cid] || 0) + n + 2 - (G.stock[cid]?.n || 0) - (wipN[cid] || 0) - (out[cid] ? 0 : 0);
    due[cid] = Math.min(due[cid] ?? 1e9, (compDue[cid] ?? 1e9) - 2);
  }
  return { out, net, due, wipN, comp };
}

/* Какой счёт платит: для ГОЗ сначала отдельные счета контрактов по этому изделию */
export function payFor(G, vid, amt, cfKey) {
  if (amt <= 0) return;
  let rest = amt;
  if (VAR[vid] && VAR[vid].mk === "goz") {
    const cs = G.contracts.filter((c) => c.status === "active" && c.kind === "goz" && c.v === vid && c.restr > 0).sort((a, b) => a.due - b.due);
    for (const c of cs) {
      const k = Math.min(c.restr, rest);
      c.restr -= k; rest -= k;
      G._restrSpent = (G._restrSpent || 0) + k;
      if (rest <= 0) break;
    }
  }
  if (rest > 0) spend(G, rest, cfKey);
}
/* Сколько денег доступно для запуска изделия: целевые средства ГОЗ по этому изделию + свободные деньги сверх резерва */
export function restrFor(G, vid) {
  if (!VAR[vid] || VAR[vid].mk !== "goz") return 0;
  return sum(G.contracts.filter((c) => c.status === "active" && c.kind === "goz" && c.v === vid), (c) => c.restr);
}
export function fundsFor(G, vid, extra = 0, reserve = 0) {
  return restrFor(G, vid) + Math.max(0, G.cash + extra - reserve);
}

export function lineNeed(line) {
  let n = 0;
  for (const u of line.wip) if (!u.w) n += unitNeed(u);
  return n;
}
export const unitNeed = (u) => (u.r ? 0.5 : 1) * VAR[u.v].lab / VAR[u.v].cycle;

/* Запуск одного изделия на линии */
export function startUnit(G, line, vid) {
  const cost = matCost(G, vid);
  payFor(G, vid, cost, "materials");
  line.wip.push({ v: vid, p: 0, c: cost, w: 0, r: 0, t: G.t });
  return cost;
}

const ORDER = (e) => (ENT[e.id].sector === "engine" ? 0 : 1);

export function stepProduction(G) {
  const D = demand(G);
  const report = { started: {}, done: {}, waiting: {}, idle: 0 };
  const ents = Object.values(G.ents).sort((a, b) => ORDER(a) - ORDER(b));
  // минимальный остаток денег, ниже которого автоплан не запускает новые изделия (резерв на зарплату)
  const reserve = sum(Object.values(G.ents), (e) => payroll(e)) * 0.25;
  const odNow = sum(G.loans.filter((l) => l.kind === "od"), (l) => l.amt);
  const odRoom = Math.max(0, odLimit(G) * 0.7 - odNow);
  for (const e of ents) {
    const { cap, prodF } = capacity(G, e);
    e.cap = cap; e.prodF = prodF;
    // ── запуск: сначала ручные планы, затем общая очередь завода по срокам заказов
    let need = sum(e.lines, lineNeed);
    const usable = (line) => { const f = FAM[line.fam]; return !(f.locked && !G.unl[f.id]) && !line.hold; };
    for (const line of e.lines) {
      if (!usable(line) || line.auto) continue;
      let free = line.slots - line.wip.length;
      for (const [vid, k] of Object.entries(line.plan)) {
        if (!unlocked(G, vid)) continue;
        for (let i = 0; i < k && free > 0; i++) {
          const cost = matCost(G, vid);
          if (fundsFor(G, vid, odRoom, 0) < cost) { report.noCash = true; break; }
          startUnit(G, line, vid);
          need += VAR[vid].lab / VAR[vid].cycle; free--;
          report.started[vid] = (report.started[vid] || 0) + 1;
        }
      }
    }
    const cands = [];
    for (const line of e.lines) {
      if (!usable(line) || !line.auto) continue;
      for (const v of FAM[line.fam].variants) if (unlocked(G, v.id) && (D.net[v.id] || 0) > 0) cands.push({ line, v, due: D.due[v.id] ?? 1e9 });
    }
    cands.sort((a, b) => a.due - b.due);
    for (const { line, v } of cands) {
      let n = Math.ceil(D.net[v.id]);
      while (n > 0 && line.wip.length < line.slots) {
        const add = v.lab / v.cycle;
        if (need + add > cap * 1.03 && need > 0) break;
        const cost = matCost(G, v.id);
        if (fundsFor(G, v.id, odRoom, reserve) < cost) { report.noCash = true; break; }
        startUnit(G, line, v.id);
        need += add; n--; D.net[v.id]--;
        report.started[v.id] = (report.started[v.id] || 0) + 1;
      }
    }
    // ── продвижение работ
    const r = need > 0 ? Math.min(1, cap / need) : 0;
    const used = need * r;
    const util = cap > 0 ? used / cap : 0;
    e.need = need; e.util = util; e.ratio = r;
    const pay = payroll(e);
    const oh = e.oh * G.m.cpi * (0.6 + 0.4 * util);
    const pool = pay + oh;
    // зарплата и накладные
    const gozShare = {};
    for (const line of e.lines) for (const u of line.wip) {
      if (u.w) continue;
      const nd = unitNeed(u) * r;
      const share = cap > 0 ? (pool * nd) / cap : 0;
      u.c += share;
      if (VAR[u.v].mk === "goz") gozShare[u.v] = (gozShare[u.v] || 0) + share;
      const step = (u.r ? 2 : 1) * r / VAR[u.v].cycle;
      u.p = Math.min(1, u.p + step);
    }
    // часть фонда оплаты по изделиям ГОЗ оплачивается с отдельных счетов
    let fromRestr = 0;
    for (const [vid, amt] of Object.entries(gozShare)) {
      const before = G.cash;
      payFor(G, vid, amt, null);
      fromRestr += amt - (before - G.cash);
    }
    // остальное — из свободных денег (payFor уже списал недостающее без статьи — восстановим разбивку)
    const cashPart = pool - fromRestr;
    const gozCash = sum(Object.values(gozShare)) - fromRestr;
    G.cash -= cashPart - gozCash;
    cfAdd(G, "payroll", pay * (cashPart / pool));
    cfAdd(G, "overhead", oh * (cashPart / pool));
    const idle = pool * (1 - util);
    plAdd(G, "idle", idle);
    report.idle += idle;
    e.last.pay = pay; e.last.oh = oh; e.last.idle = idle;
  }
  // ── окончательная сборка: двигатели в порядке срочности заказов
  const ready = [];
  for (const e of ents) for (const line of e.lines) for (const u of line.wip) if (u.p >= 1) ready.push({ e, line, u });
  ready.sort((a, b) => ORDER(a.e) - ORDER(b.e) || (D.due[a.u.v] ?? 1e9) - (D.due[b.u.v] ?? 1e9));
  for (const { line, u } of ready) {
    const comps = u.cc ? {} : compsOf(G, u.v);
    let ok = true;
    for (const [cid, k] of Object.entries(comps)) if ((G.stock[cid]?.n || 0) < k) { ok = false; report.waiting[cid] = (report.waiting[cid] || 0) + k; }
    if (!ok) { u.w = 1; continue; }
    for (const [cid, k] of Object.entries(comps)) {
      const s = G.stock[cid];
      const unitC = s.c / s.n;
      s.n -= k; s.c -= unitC * k; u.c += unitC * k;
      if (s.n <= 0) { s.n = 0; s.c = 0; }
    }
    u.cc = 1; u.w = 0;
    line.wip.splice(line.wip.indexOf(u), 1);
    const s = (G.stock[u.v] = G.stock[u.v] || { n: 0, c: 0 });
    s.n += 1; s.c += u.c;
    report.done[u.v] = (report.done[u.v] || 0) + 1;
  }
  // ожидающие двигателей изделия занимают место, но не требуют людей
  for (const e of ents) for (const line of e.lines) for (const u of line.wip) if (u.p < 1) u.w = 0;
  G._prod = report;
  return report;
}

/* Сводка по линии для интерфейса */
export function lineInfo(G, e, line) {
  const f = FAM[line.fam];
  const wip = line.wip;
  const waiting = wip.filter((u) => u.w).length;
  const byV = {};
  for (const u of wip) byV[u.v] = (byV[u.v] || 0) + 1;
  const rate = sum(wip.filter((u) => !u.w), (u) => (e.ratio || 0) / VAR[u.v].cycle);
  return { f, used: wip.length, waiting, byV, rate, locked: f.locked && !G.unl[f.id] };
}

/* Себестоимость ожидаемой единицы на складе */
export function stockAvg(G, vid) { const s = G.stock[vid]; return s && s.n > 0 ? s.c / s.n : 0; }
export { STOCK_ONLY, isComp };
