/* Индексы каталога и расчёт себестоимости и технической оценки изделий с учётом НИОКР. */
import { FAMILIES, STOCK_ONLY } from "../data/products.js";
import { ENT, ENTERPRISES } from "../data/enterprises.js";
import { TCATS } from "../data/competitors.js";

export const FAM = {};
export const VAR = {};
for (const f of FAMILIES) {
  FAM[f.id] = f;
  for (const v of f.variants) {
    v.fam = f.id;
    v.lab = v.lab ?? f.lab;
    v.cycle = v.cycle ?? f.cycle;
    v.tcat = v.tcat ?? f.tcat ?? null;
    v.comps = v.comps || {};
    VAR[v.id] = v;
  }
}
export const famOf = (vid) => FAM[VAR[vid].fam];
export const entOfFam = (fid) => ENT[FAM[fid].ent];
export const entOfVar = (vid) => ENT[famOf(vid).ent];
export const sectorOfVar = (vid) => entOfVar(vid).sector;
export const isComp = (vid) => VAR[vid] && VAR[vid].mk === "comp";
export const isStockOnly = (id) => !!STOCK_ONLY[id];
export const compName = (id) => (STOCK_ONLY[id] ? STOCK_ONLY[id].name : VAR[id] ? VAR[id].name : id);
export const unitOf = (vid) => VAR[vid].unit || "шт.";
export const FAMS_BY_ENT = {};
for (const e of ENTERPRISES) FAMS_BY_ENT[e.id] = FAMILIES.filter((f) => f.ent === e.id).map((f) => f.id);
export const TCAT_NAME = (c) => (TCATS[c] ? TCATS[c].name : c);

/* Двигатели варианта с учётом замен после НИОКР (АЛ-41Ф1С → АЛ-51Ф-1 и т. п.) */
export function compsOf(G, vid) {
  const v = VAR[vid];
  const swap = G.bonus.swap[v.fam];
  if (!swap) return v.comps;
  const [from, to] = swap;
  if (!(from in v.comps)) return v.comps;
  const out = { ...v.comps };
  out[to] = (out[to] || 0) + out[from];
  delete out[from];
  return out;
}

export const unlocked = (G, vid) => {
  const v = VAR[vid];
  if (!v) return false;
  const f = FAM[v.fam];
  if (f.locked && !G.unl[f.id]) return false;
  if (v.locked && !G.unl[v.id]) return false;
  return true;
};

/* Материалы и ЭКБ на запуск одной единицы, млн ₽ в текущих ценах */
export function matCost(G, vid) {
  const v = VAR[vid], s = sectorOfVar(vid);
  const matK = G.bonus.mat[s] || 1;
  const imp = v.imp * (G.bonus.imp[s] ?? 1);
  const ekb = v.ekb * (1 - imp + imp * G.m.ekbPrem) * G.m.cpi;
  return v.mat * G.m.matIdx * matK + ekb;
}
export function ekbImportCost(G, vid) {
  const v = VAR[vid], s = sectorOfVar(vid);
  const imp = v.imp * (G.bonus.imp[s] ?? 1);
  return v.ekb * imp * G.m.ekbPrem * G.m.cpi;
}

export const eqF = (eq) => 0.78 + 0.11 * (eq - 1);
export const wearF = (w) => 1 - 0.6 * Math.max(0, w - 0.4);
export const NORM_UTIL = 0.85;   // нормативная загрузка мощностей в калькуляциях

/* Стоимость человеко-месяца трудоёмкости на предприятии: зарплата со взносами, накладные, амортизация и налог на имущество,
   разнесённые на нормативную загрузку 85%. Так считают калькуляции по ГОЗ («затраты плюс»). */
export function costRate(G, entId) {
  const e = G.ents[entId], d = ENT[entId];
  const pay = (e.staff * e.wageR * e.rwage * 1.3) / 1000;
  const fixed = e.oh * G.m.cpi + (e.fa * 0.082) / 12;
  const bonus = 1 + (G.bonus.prod[d.sector] || 0) + (G.bonus.prod.all || 0) + (e.prodPerm || 0);
  const cap = e.staff * eqF(e.eq) * wearF(e.wear) * bonus;
  return (pay + fixed) / Math.max(1, cap * NORM_UTIL);
}

/* Нормативная себестоимость единицы: материалы и ЭКБ + двигатели + трудоёмкость × стоимость человеко-месяца */
export function stdCost(G, vid, depth = 0) {
  const v = VAR[vid];
  let c = matCost(G, vid);
  if (depth < 3) for (const [cid, n] of Object.entries(compsOf(G, vid))) c += n * compStdCost(G, cid, depth + 1);
  c += v.lab * costRate(G, FAM[v.fam].ent);
  return c;
}
export function compStdCost(G, cid, depth = 0) {
  if (STOCK_ONLY[cid]) return STOCK_ONLY[cid].price * G.m.cpi;
  return stdCost(G, cid, depth);
}

/* Техническая оценка экспортного варианта с учётом НИОКР */
export function techOf(G, vid) {
  const v = VAR[vid], f = FAM[v.fam];
  return (f.tech || 75) + (v.tech || 0) + (G.bonus.tech[f.id] || 0);
}

/* Цена по прейскуранту: для экспорта — $ млн с учётом долларовой инфляции, для ГОЗ — оценка заказчика */
export function listUsd(G, vid) { return VAR[vid].usd * G.m.usdInfl; }

/* Варианты, которые можно предложить в тендере данной категории для партнёра */
export function eligibleVariants(G, tcat, partner) {
  const out = [];
  for (const v of Object.values(VAR)) {
    if (!unlocked(G, v.id)) continue;
    if (v.mk === "comp" || v.mk === "civ") continue;
    if (v.tcat !== tcat) continue;
    if (v.only && !v.only.includes(partner.id)) continue;
    if (v.mk === "goz" && !partner.csto) continue;
    if (v.mk === "exp" && partner.csto && hasGozTwin(v)) continue;  // ОДКБ берёт внутренние модификации
    out.push(v.id);
  }
  return out;
}
function hasGozTwin(v) { return FAM[v.fam].variants.some((x) => x.mk === "goz" && x.tcat === v.tcat); }
