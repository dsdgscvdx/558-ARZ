/* Прогноз денег на несколько месяцев вперёд: копия состояния прогоняется без случайных событий,
   новых тендеров и аварий — «если ничего не менять». */
import { endMonth } from "./tick.js";
import { debt } from "./finance.js";

export function cloneGame(G) {
  return typeof structuredClone === "function" ? structuredClone(G) : JSON.parse(JSON.stringify(G));
}

export function forecast(G, months = 6) {
  const F = cloneGame(G);
  F._fc = true;
  F.over = null;
  F.ev.queue = [];
  const out = [];
  for (let i = 0; i < months; i++) {
    const r = endMonth(F);
    if (!r) break;
    const od = F.loans.find((l) => l.kind === "od");
    out.push({ t: F.t - 1, cash: F.cash, od: od ? od.amt : 0, rev: r.rev, np: r.np, debt: debt(F), restr: F.hist[F.hist.length - 1].restr });
  }
  return out;
}
