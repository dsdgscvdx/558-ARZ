/* НИОКР и инвестиционные проекты предприятий. */
import { RND, RND_BY } from "../data/rnd.js";
import { ENT } from "../data/enterprises.js";
import { FAM, VAR } from "./catalog.js";
import { chance, clamp, irand, uni, nextId, monthOf } from "./util.js";
import { spend, plAdd, cfAdd, logF, fmtM } from "./finance.js";

/* ── НИОКР ── */
export const rndMonthly = (G, id) => {
  const r = RND_BY[id], s = G.rnd[id];
  return (r.cost * G.m.cpi * (1 + (s.over || 0))) / s.months;
};
export const rndLeftCost = (G, id) => {
  const r = RND_BY[id], s = G.rnd[id];
  return r.cost * G.m.cpi * (1 + (s.over || 0)) * Math.max(0, 1 - s.prog);
};
export const rndMonthsLeft = (G, id) => Math.ceil(Math.max(0, 1 - G.rnd[id].prog) * G.rnd[id].months);
export function rndAvailable(G, id) {
  const r = RND_BY[id];
  return (r.req || []).every((q) => G.rnd[q]?.st === "done");
}

export function startRnd(G, id) {
  const s = G.rnd[id];
  if (!s || s.st === "done" || s.st === "active") return;
  s.st = "active";
  logF(G, `Начаты работы: «${RND_BY[id].name}». Осталось около ${rndMonthsLeft(G, id)} мес. и ${fmtM(rndLeftCost(G, id) * (1 - s.share))} собственных средств.`, "rnd");
}
export function pauseRnd(G, id) { const s = G.rnd[id]; if (s && s.st === "active") { s.st = "paused"; logF(G, `Работы приостановлены: «${RND_BY[id].name}».`, "rnd"); } }
/* Заявка на госфинансирование: ответ приходит через месяц */
export function applyRndFunding(G, id) {
  const s = G.rnd[id], r = RND_BY[id];
  if (!r.state || s.share > 0 || G.t - s.applyT < 6 || s.pending) return;
  s.pending = true; s.applyT = G.t;
}
export const fundingChance = (G, id) => clamp(0.25 + G.trust / 140 - (RND_BY[id].state === "civ" ? 0.05 : 0), 0.05, 0.9);

export function stepRnd(G) {
  for (const r of RND) {
    const s = G.rnd[r.id];
    if (s.pending && G.t > s.applyT) {
      s.pending = false;
      if (chance(G, fundingChance(G, r.id))) {
        s.share = r.state === "mil" ? 0.7 : 0.5;
        logF(G, `${r.state === "mil" ? "Минобороны заключило госконтракт на ОКР" : "Минпромторг одобрил субсидию"}: «${r.name}». Государство оплатит ${Math.round(s.share * 100)}% оставшихся работ.`, "ok");
      } else logF(G, `Заявка на госфинансирование «${r.name}» отклонена. Повторно можно подать через полгода.`, "warn");
    }
    if (s.st !== "active") continue;
    const cost = rndMonthly(G, r.id) * (1 - s.share);
    spend(G, cost, "rnd"); plAdd(G, "rnd", cost);
    s.spent += cost;
    s.prog += 1 / s.months;
    // технические трудности
    if (s.prog < 0.95 && chance(G, r.risk * 0.05)) {
      (G._rndTrouble = G._rndTrouble || []).push(r.id);
    }
    if (s.prog >= 1 - 1e-9) completeRnd(G, r.id);
  }
}

export function completeRnd(G, id) {
  const r = RND_BY[id], s = G.rnd[id];
  s.st = "done"; s.prog = 1; s.doneT = G.t;
  const fx = r.fx || {};
  for (const u of fx.unlock || []) G.unl[u] = true;
  for (const [fam, sw] of Object.entries(fx.swap || {})) G.bonus.swap[fam] = sw;
  for (const [k, m] of Object.entries(fx.imp || {})) G.bonus.imp[k] = (G.bonus.imp[k] ?? 1) * m;
  for (const [k, a] of Object.entries(fx.prod || {})) G.bonus.prod[k] = (G.bonus.prod[k] || 0) + a;
  for (const [k, a] of Object.entries(fx.tech || {})) G.bonus.tech[k] = (G.bonus.tech[k] || 0) + a;
  for (const [k, m] of Object.entries(fx.mat || {})) G.bonus.mat[k] = (G.bonus.mat[k] ?? 1) * m;
  if (fx.modCost) G.bonus.modCost *= fx.modCost;
  if (fx.quality) G.bonus.quality += fx.quality;
  G.stats.rndDone++;
  G.trust += r.state === "mil" ? 2 : 1;
  logF(G, `НИОКР завершена: «${r.name}». ${describeFx(r)}`, "star", { rnd: id });
}

export function describeFx(r) {
  const fx = r.fx || {}, out = [];
  const un = (fx.unlock || []).map((u) => (FAM[u] ? FAM[u].name : VAR[u] ? VAR[u].name : u));
  if (un.length) out.push(`Доступно серийное производство: ${un.join(", ")}.`);
  if (fx.swap) for (const [f, [a, b]] of Object.entries(fx.swap)) out.push(`${FAM[f].name} переходит на двигатель ${VAR[b]?.name || b}.`);
  if (fx.imp) out.push(`Импортная ЭКБ: ${Object.entries(fx.imp).map(([k, m]) => `−${Math.round((1 - m) * 100)}% (${SECT[k] || k})`).join(", ")}.`);
  if (fx.prod) out.push(`Производительность: ${Object.entries(fx.prod).map(([k, a]) => `+${Math.round(a * 100)}% (${SECT[k] || k})`).join(", ")}.`);
  if (fx.tech) out.push(`Экспортная привлекательность: ${Object.entries(fx.tech).map(([k, a]) => `${FAM[k]?.name || k} +${a}`).join(", ")}.`);
  if (fx.mat) out.push(`Материальные затраты: ${Object.entries(fx.mat).map(([k, m]) => `−${Math.round((1 - m) * 100)}% (${SECT[k] || k})`).join(", ")}.`);
  if (fx.modCost) out.push(`Модернизация заводов дешевле на ${Math.round((1 - fx.modCost) * 100)}%.`);
  if (fx.quality) out.push(`Брак на приёмке −${(fx.quality * 100).toFixed(1)} п.п.`);
  return out.join(" ");
}
const SECT = { all: "все заводы", avia: "авиация", heli: "вертолёты", engine: "двигатели", armor: "бронетехника", art: "артиллерия", ad: "ПВО", missile: "ракеты", navy: "флот", uav: "БПЛА" };

/* Решение по техническим трудностям: добавить денег (сохранить срок) или сдвинуть срок */
export function rndTrouble(G, id, choice) {
  const s = G.rnd[id];
  if (choice === 0) { s.over = (s.over || 0) + uni(G, 0.1, 0.2); }
  else { s.months += irand(G, 2, 6); }
}

/* ── инвестиционные проекты предприятий ── */
export const PROJECTS = {
  expand: { name: "Расширение линии", desc: "Новые стапели и рабочие места: +25% одновременно изготавливаемых изделий на выбранной линии." },
  modern: { name: "Модернизация станочного парка", desc: "Обрабатывающие центры с ЧПУ, роботизированная сварка: уровень оснащённости +1, производительность и качество растут." },
  overhaul: { name: "Капитальный ремонт фондов", desc: "Ремонт корпусов, сетей и оборудования: износ −15 п.п., меньше аварий." },
  housing: { name: "Служебное жильё", desc: "Дома для работников: приток кадров +50%. Особенно важно в небольших и удалённых городах." },
  school: { name: "Учебный центр и целевое обучение", desc: "Договоры с вузами и колледжами: приток кадров +30%." },
  energy: { name: "Энергосбережение", desc: "Собственная генерация и модернизация сетей: накладные расходы −12%." },
};
export function projectCost(G, e, type, fam) {
  const d = ENT[e.id], cpi = G.m.cpi;
  const natproj = G.ev.active.natproj > G.t ? 0.8 : 1;
  const ban = G.ev.active.machineBan > G.t && G.bonus.modCost >= 1 ? 1.15 : 1;
  switch (type) {
    case "expand": { const f = FAM[fam]; const line = e.lines.find((l) => l.fam === fam); const n = Math.max(1, Math.round(line.slots * 0.25)); return { cost: n * f.capex * cpi, months: clamp(Math.round(10 + (n * f.capex) / 2500), 10, 30), n }; }
    case "modern": return { cost: d.staff * 0.55 * (1 + 0.25 * (e.eq - 2)) * cpi * G.bonus.modCost * natproj * ban, months: 15 };
    case "overhaul": return { cost: d.staff * d.capInt * 0.07 * cpi, months: 8 };
    case "housing": return { cost: d.staff * 0.35 * cpi, months: 24 };
    case "school": return { cost: d.staff * 0.08 * cpi, months: 12 };
    case "energy": return { cost: d.staff * 0.12 * cpi, months: 10 };
  }
  return null;
}
export function projectAllowed(G, e, type, fam) {
  if (e.proj.some((p) => p.type === type && (type !== "expand" || p.fam === fam))) return "уже идёт";
  if (type === "modern" && e.eq >= 5) return "максимальный уровень";
  if (type === "housing" && e.housing) return "построено";
  if (type === "school" && e.school) return "создан";
  if (type === "energy" && e.energy) return "выполнено";
  if (type === "overhaul" && e.wear < 0.2) return "износ уже низкий";
  if (type === "expand" && FAM[fam]?.locked && !G.unl[fam]) return "нет допуска к серии";
  return null;
}
export function startProject(G, entId, type, fam) {
  const e = G.ents[entId];
  if (projectAllowed(G, e, type, fam)) return null;
  const pc = projectCost(G, e, type, fam);
  const p = { id: nextId(G, "P"), type, fam: fam || null, n: pc.n || 0, cost: pc.cost, months: pc.months, left: pc.months, spent: 0, share: 0, pending: false, applyT: -99 };
  e.proj.push(p);
  logF(G, `${ENT[entId].short}: начат проект «${PROJECTS[type].name}${fam ? ` — ${FAM[fam].name}` : ""}», ${fmtM(pc.cost)}, ${pc.months} мес.`, "inv");
  return p;
}
export function applyProjectSubsidy(G, entId, pid) {
  const p = G.ents[entId].proj.find((x) => x.id === pid);
  if (!p || p.share > 0 || p.pending || G.t - p.applyT < 6) return;
  p.pending = true; p.applyT = G.t;
}
export const subsidyChance = (G) => clamp(0.15 + G.trust / 150, 0.05, 0.8);
export function cancelProject(G, entId, pid) {
  const e = G.ents[entId];
  const p = e.proj.find((x) => x.id === pid);
  if (!p) return;
  // незавершённое строительство списывается на убытки
  plAdd(G, "other", p.spent);
  e.proj = e.proj.filter((x) => x !== p);
  logF(G, `${ENT[entId].short}: проект «${PROJECTS[p.type].name}» остановлен, списано ${fmtM(p.spent)}.`, "warn");
}

export function stepProjects(G) {
  for (const e of Object.values(G.ents)) {
    for (const p of [...e.proj]) {
      if (p.pending && G.t > p.applyT) {
        p.pending = false;
        if (chance(G, subsidyChance(G))) { p.share = 0.4; logF(G, `${ENT[e.id].short}: Минпромторг одобрил субсидию 40% на проект «${PROJECTS[p.type].name}» по программе развития ОПК.`, "ok"); }
        else logF(G, `${ENT[e.id].short}: в субсидии на проект «${PROJECTS[p.type].name}» отказано.`, "warn");
      }
      const pay = (p.cost / p.months) * (1 - p.share);
      spend(G, pay, "capex");
      p.spent += pay;
      p.left -= 1;
      if (p.left <= 0) finishProject(G, e, p);
    }
  }
}
function finishProject(G, e, p) {
  e.fa += p.spent;
  e.proj = e.proj.filter((x) => x !== p);
  const d = ENT[e.id];
  switch (p.type) {
    case "expand": { const l = e.lines.find((x) => x.fam === p.fam); l.slots += p.n; break; }
    case "modern": e.eq = Math.min(5, e.eq + 1); break;
    case "overhaul": e.wear = Math.max(0.05, e.wear - 0.15); break;
    case "housing": e.housing = 1; break;
    case "school": e.school = 1; break;
    case "energy": e.energy = 1; e.oh *= 0.88; break;
  }
  logF(G, `${d.short}: завершён проект «${PROJECTS[p.type].name}${p.fam ? ` — ${FAM[p.fam].name}` : ""}».`, "ok");
}
export { cfAdd, monthOf };
