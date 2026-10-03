/* Проверка движка без интерфейса: несколько партий по 10 лет с простым ботом.
   Проверяет баланс (активы − обязательства = капитал на старте + накопленная прибыль − дивиденды + взносы),
   отсутствие NaN и печатает экономику изделий и годовые итоги.
   Запуск: node tools/simtest.mjs [число партий] [--econ] [--verbose] [--policy=passive|bot] */
import { newGame } from "../src/sim/state.js";
import { endMonth } from "../src/sim/tick.js";
import { VAR, FAM, stdCost, unlocked, eligibleVariants, listUsd } from "../src/sim/catalog.js";
import { balance, netProfit, revenue, ebitda, debt, fmtM, rating } from "../src/sim/finance.js";
import { acceptOffer, feasibility, negotiate, declineOffer } from "../src/sim/contracts.js";
import { submitBid, odds, ourList } from "../src/sim/tenders.js";
import { capacity } from "../src/sim/workforce.js";
import { forecast } from "../src/sim/forecast.js";
import { ENT } from "../src/data/enterprises.js";
import { PARTNER } from "../src/data/partners.js";
import { RND } from "../src/data/rnd.js";
import { startRnd } from "../src/sim/rnd.js";

const args = process.argv.slice(2);
const runs = Number(args.find((a) => /^\d+$/.test(a)) || 3);
const econ = args.includes("--econ");
const verbose = args.includes("--verbose");
const policy = (args.find((a) => a.startsWith("--policy=")) || "--policy=bot").split("=")[1];
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);

function econTable() {
  const G = newGame({ seed: 1 });
  console.log("\n=== Экономика изделий (на старте) ===");
  console.log("вариант".padEnd(42), "рынок", "себест.".padStart(9), "цена ₽".padStart(9), "маржа".padStart(7));
  for (const v of Object.values(VAR)) {
    const c = stdCost(G, v.id);
    let price = 0;
    if (v.mk === "goz" || v.mk === "civ" || v.mk === "comp") price = c * 1.085;
    else price = v.usd * G.m.usd * (1 - 0.19);
    const m = price ? (price / c - 1) * 100 : 0;
    const flag = v.mk !== "comp" && (m < 4 || (v.mk !== "exp" && m > 25)) ? "  <-- проверить" : "";
    console.log(v.name.slice(0, 42).padEnd(42), v.mk.padEnd(5), f1(c).padStart(9), f1(price).padStart(9), (f1(m) + "%").padStart(7), flag);
  }
  console.log("\n=== Загрузка предприятий на старте ===");
  for (const e of Object.values(G.ents)) {
    const { cap } = capacity(G, e);
    let need = 0;
    for (const l of e.lines) for (const u of l.wip) need += VAR[u.v].lab / VAR[u.v].cycle;
    const pay = (e.staff * e.wageR * e.rwage * 1.3) / 1000;
    console.log(ENT[e.id].short.padEnd(22), "мощн.", String(Math.round(cap)).padStart(6), "в работе", String(Math.round(need)).padStart(6), `загрузка ${Math.round((need / cap) * 100)}%`.padStart(14), "ФОТ/мес", f1(pay).padStart(8));
  }
}

function bot(G) {
  // принять гражданские и сервисные предложения, ГОЗ — если успеваем
  for (const o of [...G.offers]) {
    if (o.kind === "svc" || o.kind === "civ") acceptOffer(G, o.id);
    else if (o.kind === "goz") {
      if (feasibility(G, o).ok) acceptOffer(G, o.id);
      else if (!o.neg.time) negotiate(G, o.id, "time");
      else if (feasibility(G, o).months > (o.due - G.t) * 1.4) declineOffer(G, o.id);
      else acceptOffer(G, o.id);
    }
  }
  // заявки на тендеры по прейскуранту
  for (const T of G.tenders) {
    if (T.status !== "open" || T.bid) continue;
    const P = PARTNER[T.partner];
    const vs = eligibleVariants(G, T.tcat, P);
    if (!vs.length) continue;
    const v = vs[0];
    submitBid(G, T.id, { v, price: ourList(G, T, v) * 0.97, fin: "none", offset: 0.1, svc: true, months: T.months });
  }
  // НИОКР: импортозамещение и гражданские сертификации
  if (G.t === 0) for (const id of ["sj100", "ms21", "vk650", "ekb_air", "lean", "koalitsiya"]) startRnd(G, id);
}

function check(G, label) {
  const b = balance(G);
  let np = netProfit(G.pl.all);
  const expect = G.equity0 + np - G.stats.divs + G.stats.capIn;
  const diff = b.equity - expect;
  if (!Number.isFinite(b.equity) || Math.abs(diff) > 1) {
    console.error(`!!! ${label}: баланс не сходится: капитал ${b.equity.toFixed(1)} ожидалось ${expect.toFixed(1)} разница ${diff.toFixed(2)}`);
    return false;
  }
  for (const k of ["cash", "trust", "rep"]) if (!Number.isFinite(G[k])) { console.error(`!!! ${label}: ${k} = ${G[k]}`); return false; }
  for (const e of Object.values(G.ents)) if (!Number.isFinite(e.staff) || e.staff < 0) { console.error(`!!! ${label}: staff ${e.id} = ${e.staff}`); return false; }
  return true;
}

if (econ) econTable();
let okAll = true;
for (let run = 0; run < runs; run++) {
  const G = newGame({ seed: 1000 + run * 7919 });
  console.log(`\n=== Партия ${run + 1} (seed ${G.seed}, политика ${policy}) ===`);
  if (!check(G, "старт")) okAll = false;
  if (run === 0) {
    const fc = forecast(G, 6);
    console.log("Прогноз денег на 6 мес.:", fc.map((x) => `${fmtM(x.cash)}${x.od ? ` (ОД ${fmtM(x.od)})` : ""}`).join(" | "));
  }
  for (let m = 0; m < 120; m++) {
    if (policy === "bot") bot(G);
    const r = endMonth(G);
    if (!check(G, `месяц ${m}`)) { okAll = false; break; }
    if (verbose && m < 24) console.log(`  ${m}: выручка ${fmtM(r.rev)} ЧП ${fmtM(r.np)} деньги ${fmtM(G.cash)} долг ${fmtM(debt(G))} простой ${fmtM(r.idle)} ждут: ${JSON.stringify(r.waiting)} ${r.noCash ? "НЕТ ДЕНЕГ" : ""}`);
    if ((m + 1) % 12 === 0) {
      const y = 2026 + (m + 1) / 12 - 1;
      const p = G.pl.years[y];
      const h = G.hist[G.hist.length - 1];
      const late = G.contracts.filter((c) => c.status === "active" && c.late > 0).length;
      const rt = rating(G);
      const rep = G.lastReport;
      console.log(`${y}: выручка ${fmtM(revenue(p))} (ГОЗ ${Math.round((p.revGoz / revenue(p)) * 100)}% экс ${Math.round((p.revExp / revenue(p)) * 100)}% гр ${Math.round((p.revCiv / revenue(p)) * 100)}% серв ${Math.round((p.revSvc / revenue(p)) * 100)}%) EBITDA ${fmtM(ebitda(p))} ЧП ${fmtM(netProfit(p))} | простой ${fmtM(p.idle)} проценты ${fmtM(p.int)} | деньги ${fmtM(G.cash)} долг ${fmtM(debt(G))} ND/EBITDA ${rt.ratio.toFixed(1)} | доверие ${G.trust.toFixed(0)} реп ${G.rep.toFixed(0)} | штат ${h.staff} загрузка ${Math.round(h.util * 100)}% | просрочено ${late} | $ ${G.m.usd.toFixed(0)} ставка ${G.m.key} | KPI ${rep.kpis.filter((k) => k.ok).length}/4 | тендеры ${G.stats.tendersWon}/${G.stats.tendersWon + G.stats.tendersLost}`);
    }
    if (G.over && G.over.kind !== "final") { console.log(`КОНЕЦ ИГРЫ (${G.over.kind}) в месяце ${m}: ${G.over.text}`); break; }
  }
  if (G.over && G.over.kind === "final") console.log(`Итог: ${G.over.score.total.toFixed(1)} — ${G.over.score.title}`, G.over.score.parts.map((p) => `${p.name} ${p.v.toFixed(0)}`).join("; "));
}
console.log(okAll ? "\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ" : "\nЕСТЬ ОШИБКИ");
process.exit(okAll ? 0 : 1);
