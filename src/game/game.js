/* Игровая логика: наряды, дефектовка, снабжение, склад, гонка РД-33, настройка РЛС, ОТК.
   Правила и баланс перенесены из версии 1; 3D-часть и управление заменены новым движком. */
import {
  RANKS, START_MONEY, OTK_MIN, USED_K, LATENT_CHANCE, SAVE_KEY, PT, GROUPS, KITS, LATENT, ZONES, ZN, SID, ST, SZ, ACC, COVERS, SIDE,
  RADAR, FUEL, HYDRO, GEAR, CTRL, TESTS, TEST_NAME, TEST_H, label, UNIT, MISSIONS, MBY,
} from "./data.js";
import { rnd, rint, pick, gauss, clamp, fmt, esc, $ } from "../util.js";
import * as A from "../audio.js";
import * as VW from "../view/view.js";
import { happy } from "../platform.js";

export let P = null;   // игрок
export let S = null;   // активный наряд
/* связь с управлением/камерой — заполняется в main.js */
export const hooks = {
  mode: () => "orbit", inReach: () => true, mark: () => {}, cardOpened: () => {}, work: async () => true,
  enterEngine: () => {}, exitEngine: () => {}, enterRadar: () => {}, exitRadar: () => {}, afterMenu: () => {},
};

/* ═════════════════════════ СОСТОЯНИЕ ═════════════════════════ */
function newPlayer(name) {
  P = { name, xp: 0, money: START_MONEY, completed: {}, inv: [], kits: {}, uid: 1, finalDone: false,
    stats: { earned: 0, spent: 0, failures: 0, hidden: 0, runs: 0, radar: 0, returns: 0 } };
  S = null;
}
export const rankIdx = () => { let r = 0; RANKS.forEach(([, n], i) => { if (P.xp >= n) r = i; }); return r; };
const rankName = (r = rankIdx()) => RANKS[r][0];
const speed = () => 1 - 0.04 * rankIdx();
const discount = () => 0.02 * rankIdx();
const priceNew = (t) => Math.round(PT[t].price * (1 - discount()));
const priceUsed = (t) => Math.round((PT[t].price * USED_K * (1 - discount())) / 10) * 10;
const priceKit = (k) => Math.round(KITS[k].price * (1 - discount()));
function spend(x) { P.money -= x; P.stats.spent += x; }

function accessClosure(id) { const res = [], st = [...ACC[id]]; while (st.length) { const a = st.pop(); if (!res.includes(a)) { res.push(a); st.push(...ACC[a]); } } return res; }
function slotGroups(id) {
  const g = [];
  if (SIDE.L.includes(id)) g.push("engine_L");
  if (SIDE.R.includes(id)) g.push("engine_R");
  if (FUEL.includes(id)) g.push("engine_L", "engine_R");
  if (HYDRO.includes(id) || GEAR.includes(id) || CTRL.includes(id)) g.push("engine_any");
  if (RADAR.includes(id)) g.push("radar");
  return g;
}
function missionNorm(m) {
  const work = new Set(); let t = 1.5; const g = new Set(m.tests);
  for (const f of m.faults) { work.add(f[0]); accessClosure(f[0]).forEach((a) => work.add(a)); t += PT[ST[f[0]]].insp; }
  for (const id of work) { t += PT[ST[id]].rm + PT[ST[id]].inst; slotGroups(id).forEach((x) => g.add(x)); }
  if (g.has("engine_any") && (g.has("engine_L") || g.has("engine_R"))) g.delete("engine_any");
  for (const x of g) t += TEST_H[x];
  return Math.round((t * 1.15 + 1) * 10) / 10;
}
function startMission(m) {
  const slots = {};
  for (const id of SID) slots[id] = { cond: rint(74, 97), defect: null, on: true, origin: "штатная", known: 0, visible: false, suspect: false, claimed: null, approx: null };
  const reported = {};
  for (const [id, lo, hi, d, v] of m.faults) { Object.assign(slots[id], { cond: rint(lo, hi), defect: d, visible: !!v }); reported[id] = d; }
  const hidden = {};
  for (const [id, ch, d] of m.hidden) if (Math.random() < ch) { Object.assign(slots[id], { cond: rint(18, 42), defect: d, visible: false }); hidden[id] = { defect: d, status: "hidden" }; }
  S = { mission: m.id, bort: pick(["02", "05", "08", "12", "17", "23", "26", "31", "37", "42", "45", "51"]), slots, reported, hidden, hours: 0, log: [],
    tests: { engine_L: false, engine_R: false, engine_any: false, radar: false }, touched: [], rework: 0, hot: false, norm: missionNorm(m),
    replay: (P.completed[m.id] || 0) > 0 };
}
export const mission = () => (S ? MBY[S.mission] : null);
const slot = (id) => S.slots[id];
function addHours(h, text) { const r = Math.round(h * speed() * 10) / 10; if (S) { S.hours = Math.round((S.hours + r) * 10) / 10; S.log.push([r, text]); } return r; }
function touch(id) { for (const g of slotGroups(id)) { if (!S.touched.includes(g)) S.touched.push(g); S.tests[g] = false; } }
function requiredTests() { const r = new Set([...mission().tests, ...S.touched]); return TESTS.filter((t) => r.has(t)); }
export function effCond(id) { const s = slot(id); if (!s.on) return 0; return s.defect ? Math.min(s.cond, 40) : s.cond; }
function markFound(id, how = "player") {
  const h = S.hidden[id]; if (!h || h.status !== "hidden") return false;
  h.status = how === "player" ? "found" : "otk";
  if (how === "player") { P.stats.hidden++; toast(`★ Скрытый дефект, не указанный в наряде: ${label(id)} — ${h.defect}. Устраните его, это оплачивается отдельно.`, "star", 7000); }
  return true;
}
/* Статус узла для интерфейса: cls ok|warn|crit|unk|off */
export function slotStatus(id) {
  const s = slot(id);
  if (!s.on) return { cls: "off", text: "снят", cond: null };
  if (s.known === 2) {
    if (s.defect || s.cond < OTK_MIN) return { cls: "crit", text: "неисправен", cond: s.cond, detail: s.defect || "износ сверх допуска" };
    if (s.cond < 70) return { cls: "warn", text: "износ в допуске", cond: s.cond };
    return { cls: "ok", text: "исправен", cond: s.cond };
  }
  if (s.known === 1 && s.claimed != null) return { cls: "warn", text: "Б/У без входного контроля", cond: null, detail: `по паспорту донора ≈${s.claimed}%` };
  if (s.known === 1 && s.defect && s.visible) return { cls: "crit", text: "повреждение видно", cond: null, approx: s.approx, detail: s.defect };
  if (S.reported[id]) return { cls: "warn", text: "заявлен в наряде", cond: null, detail: "по наряду: " + S.reported[id] };
  if (s.suspect) return { cls: "warn", text: "есть подозрение", cond: null, detail: "косвенный признак: " + PT[ST[id]].clue };
  if (s.known === 1) return { cls: "unk", text: "видимых повреждений нет", cond: null };
  return { cls: "unk", text: "не проверен", cond: null };
}
/* сведения для 3D: подсветка, «повреждённый» оттенок */
export function viewStatus(id) {
  if (!S) return { on: true, cls: "unk", damaged: false };
  const s = slot(id), st = slotStatus(id);
  return { on: s.on, cls: st.cls, damaged: !!(s.on && s.defect && s.known >= 1 && (s.visible || s.known === 2)) };
}
export const hasMission = () => !!S;
export const bort = () => (S ? S.bort : "23");
export const isOn = (id) => (S ? slot(id).on : true);

/* ═════════════════════════ СОХРАНЕНИЕ ═════════════════════════ */
export function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ P, S })); } catch (e) { /* хранилище недоступно */ } }
export function loadSave() {
  try { const d = JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); if (d && d.P && typeof d.P.xp === "number") return d; } catch (e) { /* повреждённое сохранение */ }
  return null;
}
export function applySave(d) {
  P = d.P; S = d.S && MBY[d.S.mission] ? d.S : null;
  if (S) for (const id of SID) if (!S.slots[id]) S.slots[id] = { cond: 90, defect: null, on: true, origin: "штатная", known: 0, visible: false, suspect: false, claimed: null, approx: null };
}

/* ═════════════════════════ ИНТЕРФЕЙС ═════════════════════════ */
export function toast(msg, cls = "", ms = 4200) {
  const t = document.createElement("div"); t.className = "toast " + cls; t.textContent = msg; $("toasts").appendChild(t);
  while ($("toasts").children.length > 4) $("toasts").firstChild.remove();
  setTimeout(() => t.remove(), ms);
}
let modalClose = null;
export function modal(title, html, { narrow = false, footer = "", onClose = null } = {}) {
  closeModal();
  const root = $("modalRoot");
  root.innerHTML = `<div class="modal" id="mBack"><div class="sheet ${narrow ? "narrow" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header><h2>${esc(title)}</h2><button class="x" id="mX" aria-label="Закрыть">×</button></header>
    <div class="content" id="mBody">${html}</div>${footer ? `<footer id="mFoot">${footer}</footer>` : ""}</div></div>`;
  modalClose = onClose;
  $("mX").onclick = closeModal;
  $("mBack").addEventListener("pointerdown", (e) => { if (e.target.id === "mBack") closeModal(); });
  hooks.cardOpened(true);
  return $("mBody");
}
export function closeModal() { const had = $("modalRoot").innerHTML; $("modalRoot").innerHTML = ""; if (had && modalClose) { const f = modalClose; modalClose = null; f(); } }
export const modalOpen = () => !!$("modalRoot").innerHTML;
function confirmBox(text, ok = "Подтвердить", danger = false) {
  return new Promise((res) => {
    modal("Подтверждение", `<p style="margin:0;line-height:1.5">${text}</p>`, { narrow: true,
      footer: `<button class="mini" id="cNo">Отмена</button><button class="mini ${danger ? "" : "primary"}" id="cYes">${esc(ok)}</button>`, onClose: () => res(false) });
    $("cNo").onclick = () => { modalClose = null; closeModal(); res(false); };
    $("cYes").onclick = () => { modalClose = null; closeModal(); res(true); };
  });
}
const STATE_CLS = { ok: "ok", warn: "warn", crit: "crit", unk: "unk", off: "off" };
const condColor = (c) => (c < 50 ? "var(--crit)" : c < 70 ? "var(--warn)" : "var(--ok)");

export function updateHUD() {
  if (!P) return;
  const r = rankIdx(), cur = RANKS[r][1], nxt = RANKS[r + 1] ? RANKS[r + 1][1] : null;
  $("hRank").textContent = rankName();
  $("hXp").style.width = (nxt ? clamp((P.xp - cur) / (nxt - cur), 0, 1) * 100 : 100) + "%";
  $("hMoney").textContent = fmt(P.money);
  $("hMissionBox").hidden = $("hHoursBox").hidden = !S;
  $("hTests").innerHTML = "";
  if (S) {
    $("hMission").textContent = mission().title;
    $("hHours").textContent = `${S.hours.toFixed(1)} / ${S.norm.toFixed(1)}`;
    $("hHours").style.color = S.hours <= S.norm ? "" : "var(--warn)";
    $("hTests").innerHTML = requiredTests().map((t) => `<span class="chip ${S.tests[t] ? "ok" : "todo"}">${S.tests[t] ? "✓" : "○"} ${esc(TEST_NAME[t])}</span>`).join("");
  }
  document.querySelectorAll(".rail .tool").forEach((b) => { const need = ["order", "inspect", "sheet", "engine", "radar", "otk"].includes(b.dataset.act); b.hidden = need && !S; });
  $("tInspect").classList.toggle("on", VW.V.inspect);
}
/* тип детали → узел самолёта, чью модель показать на тележке */
const slotOfType = (t) => { if (P && S) { for (const id of SID) if (ST[id] === t && !slot(id).on) return id; } return SID.find((id) => ST[id] === t); };
export function afterChange() { save(); updateHUD(); renderCard(); VW.paintAll(); if (P) VW.syncRemoved(P.inv, slotOfType); }

/* ---------- карточка детали ---------- */
export let selected = null;
export function selectPart(id) {
  selected = id; VW.setSelected(id);
  renderCard();
  if (id) hooks.cardOpened(true);
}
function blockersOf(id) { return ACC[id].filter((a) => slot(a).on); }
export function renderCard() {
  const card = $("card");
  if (!S || !selected) { card.hidden = true; return; }
  const id = selected, s = slot(id), t = ST[id], pt = PT[t], st = slotStatus(id);
  const blk = blockersOf(id), inner = COVERS[id].filter((c) => !slot(c).on);
  const walk = hooks.mode() === "walk", near = !walk || hooks.inReach(id);
  let h = `<header><div><div class="eyebrow">${esc(ZN[SZ[id]])}</div><h3>${esc(label(id))}</h3></div><button class="x" id="cardX" aria-label="Закрыть">×</button></header><div class="body">`;
  h += `<div><span class="state ${STATE_CLS[st.cls]}">${esc(st.text)}</span></div>`;
  if (st.cond != null) h += `<div><div class="meter"><i style="width:${st.cond}%;background:${condColor(st.cond)}"></i></div><div class="num" style="margin-top:4px">Остаточный ресурс ${st.cond}%</div></div>`;
  else if (st.approx != null) h += `<div class="note">Визуально ≈${st.approx}%. Точный ресурс покажет дефектовка.</div>`;
  if (st.detail) h += `<div class="${st.cls === "crit" ? "defect" : "note"}">${esc(st.detail)}</div>`;
  h += `<dl class="kv"><dt>Деталь</dt><dd>${esc(pt.name)}</dd>${s.on ? `<dt>Установлена</dt><dd>${esc(s.origin)}</dd>` : ""}<dt>Дефектовка</dt><dd>${esc(pt.method)}</dd></dl>`;
  h += `<div class="note">${esc(pt.info)}</div>`;
  if (!near) h += `<div class="note" style="color:var(--warn)">Вы далеко от узла. Подойдите к нему — место отмечено ромбом.</div>`;
  const acts = [], dis = near ? "" : "disabled";
  if (s.on) {
    if (s.known < 2) acts.push(`<button class="btn" data-a="visual" ${dis}>Внешний осмотр <small>${(0.1 * speed()).toFixed(1)} ч</small></button>`);
    if (s.known < 2) acts.push(`<button class="btn primary" data-a="inspect" ${dis}>Дефектовка прибором <small>${(pt.insp * speed()).toFixed(1)} ч</small></button>`);
    const kit = pt.kit;
    if (kit && s.known === 2 && (s.defect || s.cond < 70)) {
      const have = P.kits[kit] || 0, ok = s.cond >= KITS[kit].min;
      acts.push(`<button class="btn" data-a="repair" ${ok && near ? "" : "disabled"}>Ремонт: ${esc(KITS[kit].name)} (есть ${have}) <small>${(KITS[kit].hours * speed()).toFixed(1)} ч</small></button>`);
      if (!ok) acts.push(`<div class="note">Ресурс ниже ${KITS[kit].min}% — ремонту не подлежит, только замена.</div>`);
    }
    acts.push(`<button class="btn" data-a="remove" ${blk.length || !near ? "disabled" : ""}>Снять узел <small>${(pt.rm * speed()).toFixed(1)} ч</small></button>`);
    if (blk.length) acts.push(`<div class="note">Нет доступа: сначала снимите ${blk.map((b) => `«${esc(label(b))}»`).join(", ")}.</div>`);
  } else {
    const items = P.inv.filter((it) => it.type === t);
    if (inner.length) acts.push(`<div class="note">Сначала установите: ${inner.map((b) => `«${esc(label(b))}»`).join(", ")}.</div>`);
    if (!items.length) acts.push(`<div class="note">На складе нет подходящей детали.</div>`);
    for (const it of items) {
      const good = it.verified ? !(it.defect || it.cond < OTK_MIN) : null;
      const desc = it.verified ? `${it.cond}%${it.defect ? " · брак" : ""}` : `≈${it.claimed}% · не проверена`;
      acts.push(`<button class="btn ${good ? "primary" : ""}" data-a="install" data-uid="${it.uid}" ${inner.length || !near ? "disabled" : ""}>Установить: ${esc(it.removed ? "снятая" : it.origin)} ${esc(desc)} <small>${(pt.inst * speed()).toFixed(1)} ч</small></button>`);
    }
    acts.push(`<button class="btn" data-a="buy">Заказать в снабжении <small>${fmt(priceNew(t))}</small></button>`);
  }
  acts.push(`<button class="btn" data-a="focus">${walk ? "Показать узел на самолёте" : "Приблизить камеру"}</button>`);
  h += `<div class="actions">${acts.join("")}</div></div>`;
  card.innerHTML = h; card.hidden = false;
  $("cardX").onclick = () => selectPart(null);
  card.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => partAction(id, b.dataset.a, +b.dataset.uid)));
}
let busy = false;
export const isBusy = () => busy;
async function partAction(id, a, uid) {
  if (busy) return;
  const s = slot(id), t = ST[id], pt = PT[t];
  if (a === "focus") { if (hooks.mode() === "walk") hooks.mark(id); else VW.focusOn(id); return; }
  if (a === "buy") { openShop(t); return; }
  const walk = hooks.mode() === "walk";
  if (walk && !hooks.inReach(id)) { toast("Подойдите к узлу ближе — место отмечено ромбом.", "warn"); hooks.mark(id); return; }
  if (id === "seat_pyro" && VW.V.canopyTarget < 1 && (a === "remove" || a === "install" || a === "inspect")) {
    VW.setCanopy(true); A.motor(2, 0.06, 160); toast("Фонарь кабины открыт для доступа к креслу.", "");
  }
  // физическая работа с таймером: персонаж работает, звучит инструмент
  const hoursOf = { visual: 0.1, inspect: pt.insp, remove: pt.rm, install: pt.inst, repair: pt.kit ? KITS[pt.kit].hours : 1 };
  const title = { visual: "Внешний осмотр", inspect: "Дефектовка прибором", remove: "Демонтаж", install: "Монтаж", repair: "Ремонт" }[a];
  if (a === "install") {
    const it = P.inv.find((i) => i.uid === uid); if (!it) return;
    if (COVERS[id].some((c) => !slot(c).on)) return;
    if (it.verified && (it.defect || it.cond < OTK_MIN) && !(await confirmBox("Эта деталь неисправна, ОТК её не примет. Всё равно установить?", "Установить", true))) return;
    if (!it.verified && !(await confirmBox("Б/У деталь не прошла входной контроль и может иметь скрытый дефект. Устанавливать?", "Установить"))) return;
  }
  if (a === "repair") {
    const kit = pt.kit, k = KITS[kit];
    if ((P.kits[kit] || 0) <= 0) { toast(`Нет ремкомплекта «${k.name}». Закажите его в снабжении.`, "warn"); openShop("kits"); return; }
    if (k.access && blockersOf(id).length) { toast("Для ремонта нужен доступ: снимите " + blockersOf(id).map(label).join(", "), "warn"); return; }
  }
  if (a === "remove" && blockersOf(id).length) return;
  busy = true;
  const ok = await hooks.work(`${title}: ${label(id)}`, a, hoursOf[a] * speed());
  busy = false;
  if (!ok) { toast("Работа прервана.", ""); return; }
  if (a === "visual") {
    const h = addHours(0.1, "Внешний осмотр: " + label(id));
    if (s.defect && s.visible) { s.known = Math.max(s.known, 1); s.approx = clamp(Math.round((s.cond + rint(-8, 8)) / 5) * 5, 5, 95); toast(`Видно повреждение: ${s.defect}`, "crit"); }
    else if (s.defect && s.claimed == null && !S.reported[id] && (s.suspect || Math.random() < 0.3 + 0.1 * rankIdx())) { s.suspect = true; toast(`Косвенный признак: ${pt.clue}. Нужна дефектовка.`, "warn"); }
    else if (S.reported[id] && s.defect && !s.visible) toast("Снаружи дефект не виден. Проведите дефектовку прибором.", "warn");
    else { if (s.claimed == null) s.known = Math.max(s.known, 1); toast(`Видимых повреждений нет (${h.toFixed(1)} ч).`); }
  }
  if (a === "inspect") {
    const h = addHours(pt.insp, "Дефектовка: " + label(id));
    s.known = 2; s.suspect = false; s.claimed = null;
    if (s.defect || s.cond < OTK_MIN) { toast(`${label(id)}: НЕИСПРАВЕН — ${s.defect || "износ сверх допуска"}, ресурс ${s.cond}% (${h.toFixed(1)} ч)`, "crit", 6000); markFound(id); }
    else toast(`${label(id)}: ${s.cond < 70 ? "износ в допуске" : "исправен"}, ресурс ${s.cond}%`, s.cond < 70 ? "warn" : "ok");
  }
  if (a === "remove") {
    const h = addHours(pt.rm, "Демонтаж: " + label(id));
    P.inv.push({ uid: P.uid++, type: t, cond: s.cond, claimed: s.cond, defect: s.defect, origin: s.origin, verified: true, paid: 0, removed: true });
    if (s.defect) markFound(id);
    toast(`Снято за ${h.toFixed(1)} ч: ${label(id)} — ${s.defect || s.cond < OTK_MIN ? `неисправно (${s.defect || "износ"}, ${s.cond}%)` : `годно, ${s.cond}%`}. Деталь на складе.`, s.defect ? "warn" : "ok", 5500);
    Object.assign(s, { on: false, cond: 0, defect: null, known: 0, suspect: false, claimed: null, origin: "—", approx: null, visible: false });
    touch(id); VW.animPart(id, true); A.clank(0.12, 600);
  }
  if (a === "install") {
    const it = P.inv.find((i) => i.uid === uid); if (!it) return;
    const h = addHours(pt.inst, "Монтаж: " + label(id));
    Object.assign(s, { on: true, cond: it.cond, defect: it.defect, origin: it.removed && it.origin === "штатная" ? "штатная" : it.origin, known: it.verified ? 2 : 1, suspect: false, claimed: it.verified ? null : it.claimed, approx: null, visible: false });
    P.inv = P.inv.filter((i) => i.uid !== uid);
    touch(id); VW.animPart(id, false); A.clank(0.1, 900);
    toast(`Установлено за ${h.toFixed(1)} ч: ${label(id)}. Отметка в формуляре сделана.`, "ok");
  }
  if (a === "repair") {
    const kit = pt.kit, k = KITS[kit];
    P.kits[kit]--; const h = addHours(k.hours, "Ремонт: " + label(id));
    Object.assign(s, { cond: rint(82, 92), defect: null, origin: "отремонтирована", known: 2 });
    touch(id); toast(`Ремонт за ${h.toFixed(1)} ч: ${k.work}. Ресурс ${s.cond}%.`, "ok", 5500);
  }
  afterChange();
}

/* ---------- наряды ---------- */
export function openBoard() {
  const r = rankIdx();
  const html = `<p class="note" style="margin:0">Ваша должность: <b style="color:var(--fg)">${esc(rankName())}</b>. Наряды открываются с повышением. Повторное выполнение оплачивается полностью, опыт — вдвое меньше.</p>
  <div class="missions">${MISSIONS.map((m, i) => { const lock = m.rank > r, done = P.completed[m.id] || 0;
    return `<button class="mcard ${lock ? "locked" : ""}" data-m="${i}" ${lock ? 'aria-disabled="true"' : ""}>
      <span class="eyebrow">Наряд 558/${String(i + 1).padStart(2, "0")} ${done ? `<span class="done">· выполнен ×${done}</span>` : ""}</span>
      <h3>${esc(m.title)}</h3>
      <span class="meta"><span class="num">${fmt(m.reward)}</span><span>опыт +${m.xp}</span></span>
      ${lock ? `<span class="meta">Требуется: ${esc(RANKS[m.rank][0])}</span>` : ""}</button>`; }).join("")}</div>`;
  const body = modal("Ремонтные наряды цеха", html);
  body.querySelectorAll(".mcard").forEach((b) => (b.onclick = () => { const m = MISSIONS[+b.dataset.m]; if (m.rank > r) { toast("Наряд откроется на должности «" + RANKS[m.rank][0] + "»", "warn"); return; } openOrder(m, true); }));
}
function orderHTML(m) {
  const inMission = S && S.mission === m.id;
  return `<div class="order" style="display:flex;flex-direction:column;gap:14px">
    <div class="grid"><div><span class="eyebrow">Оплата</span><b class="num">${fmt(m.reward)}</b></div><div><span class="eyebrow">Опыт</span><b>+${m.xp}</b></div>
      <div><span class="eyebrow">Норматив</span><b class="num">${(inMission ? S.norm : missionNorm(m)).toFixed(1)} нормо-ч</b></div>
      <div><span class="eyebrow">Изделие</span><b>МиГ-29БМ ${inMission ? "№ " + S.bort : ""}</b></div></div>
    <div><span class="eyebrow">Поступил из: ${esc(UNIT)}</span></div>
    <div><h3 style="font-size:15px;margin-bottom:6px">Неисправность</h3><p>${esc(m.story)}</p></div>
    <div><h3 style="font-size:15px;margin-bottom:6px">Цель</h3><p>${esc(m.goal)}</p></div>
    <div><h3 style="font-size:15px;margin-bottom:6px">Узлы, подлежащие замене или ремонту</h3><ul>${m.faults.map((f) => `<li><b>${esc(label(f[0]))}</b> — ${esc(f[3])}</li>`).join("")}</ul></div>
    <div><h3 style="font-size:15px;margin-bottom:6px">Обязательные проверки</h3><ul>${(inMission ? requiredTests() : m.tests).map((t) => `<li>${esc(TEST_NAME[t])}${inMission ? (S.tests[t] ? " — <span style='color:var(--ok)'>выполнена</span>" : " — <span style='color:var(--warn)'>не выполнена</span>") : ""}</li>`).join("")}</ul>
    <p class="note" style="margin-top:6px">После работ на двигателе, РЛС, гидросистеме или шасси нужная проверка добавляется автоматически.</p></div></div>`;
}
export function openOrder(m, fromBoard) {
  const canTake = fromBoard && !S;
  modal(`Наряд-задание: ${m.title}`, orderHTML(m), { footer: fromBoard ? (S ? `<span class="note">Сначала сдайте или закройте текущий наряд.</span><button class="mini" id="oClose">Закрыть</button>` : `<button class="mini" id="oClose">Назад</button><button class="mini primary" id="oTake">Принять наряд</button>`) :
    `<button class="mini" id="oAbandon">Отказаться от наряда</button><button class="mini primary" id="oClose">К работе</button>` });
  $("oClose").onclick = fromBoard ? openBoard : closeModal;
  if (canTake) $("oTake").onclick = () => { closeModal(); startMission(m); syncPlane(); selectPart(null);
    toast(`Тягач закатил МиГ-29БМ № ${S.bort} в цех. Самолёт на гидроподъёмниках, наряд открыт.`, "ok", 5500);
    toast(hooks.mode() === "walk" ? "Подойдите к самолёту и наведите прицел на деталь — E, чтобы осмотреть. I — режим осмотра подсвечивает узлы." : "Кликайте по деталям самолёта, чтобы осмотреть их. Режим осмотра (I) подсвечивает состояние узлов.", "", 7500); afterChange(); };
  if ($("oAbandon")) $("oAbandon").onclick = async () => { if (await confirmBox("Самолёт передадут другой бригаде. Установленные детали и потраченные деньги не вернутся.", "Отказаться", true)) { S = null; selectPart(null); syncPlane(); afterChange(); toast("Наряд закрыт без выполнения."); } };
}
export function syncPlane() { VW.syncPlane(isOn, bort()); VW.setPower(false); }

/* ---------- ведомость ---------- */
function openSheet() {
  let rows = "";
  for (const [z, zn] of ZONES) {
    rows += `<tr class="grp"><td colspan="4">${esc(zn)}</td></tr>`;
    for (const id of SID.filter((i) => SZ[i] === z)) { const st = slotStatus(id), s = slot(id);
      rows += `<tr class="click" data-id="${id}"><td>${esc(label(id))}${st.detail ? `<div class="sub">${esc(st.detail)}</div>` : ""}</td>
        <td><span class="state ${STATE_CLS[st.cls]}">${esc(st.text)}</span></td><td class="r num">${st.cond != null ? st.cond + "%" : st.approx != null ? "≈" + st.approx + "%" : "—"}</td><td class="sub">${s.on ? esc(s.origin) : ""}</td></tr>`; }
  }
  const body = modal(`Ведомость дефектов · МиГ-29БМ № ${S.bort}`, `<p class="note" style="margin:0">Нажмите на строку, чтобы найти узел на самолёте. ОТК принимает узлы с ресурсом не ниже ${OTK_MIN}% и без дефектов.</p>
    <div class="tblwrap"><table class="tbl"><thead><tr><th>Узел</th><th>Состояние</th><th class="r">Ресурс</th><th>Деталь</th></tr></thead><tbody>${rows}</tbody></table></div>`);
  body.querySelectorAll("tr.click").forEach((tr) => (tr.onclick = () => { closeModal(); selectPart(tr.dataset.id); if (hooks.mode() === "walk") hooks.mark(tr.dataset.id); else VW.focusOn(tr.dataset.id); }));
}

/* ---------- снабжение ---------- */
let shopTab = "need";
function neededTypes() {
  const parts = new Set(), kits = new Set(); if (!S) return { parts, kits };
  for (const id of SID) { const s = slot(id), st = slotStatus(id), t = ST[id];
    const spare = P.inv.some((it) => it.type === t && !(it.verified && (it.defect || it.cond < OTK_MIN)));
    if ((s.on && (st.cls === "crit" || (S.reported[id] && s.known < 2))) || (!s.on && !spare)) parts.add(t);
    const k = PT[t].kit; if (k && s.on && s.known === 2 && (s.defect || s.cond < 50) && s.cond >= KITS[k].min) kits.add(k); }
  return { parts, kits };
}
export function openShop(focus) {
  if (focus && PT[focus]) shopTab = PT[focus].group; else if (focus === "kits") shopTab = "kits"; else if (!S && shopTab === "need") shopTab = GROUPS[0];
  const need = neededTypes();
  const tabs = [...(S ? [["need", "Нужно по наряду"]] : []), ...GROUPS.map((g) => [g, g]), ["kits", "Ремкомплекты"]];
  let rows = "";
  if (shopTab === "kits") {
    rows = Object.entries(KITS).map(([k, v]) => `<tr><td>${need.kits.has(k) ? '<span class="star">★</span> ' : ""}${esc(v.name)}<div class="sub">${esc(v.work)} · ресурс узла от ${v.min}% · ${v.hours} ч</div></td>
      <td class="r"><button class="mini primary" data-kit="${k}">${fmt(priceKit(k))}</button></td><td class="r num">${P.kits[k] || 0}</td></tr>`).join("");
    rows = `<thead><tr><th>Ремкомплект</th><th class="r">Купить</th><th class="r">На складе</th></tr></thead><tbody>${rows}</tbody>`;
  } else {
    const list = Object.entries(PT).filter(([t, p]) => (shopTab === "need" ? need.parts.has(t) : p.group === shopTab));
    rows = list.map(([t, p]) => `<tr><td>${need.parts.has(t) ? '<span class="star">★</span> ' : ""}${esc(p.name)}<div class="sub">${esc(p.info)}</div></td>
      <td class="r"><button class="mini primary" data-new="${t}">${fmt(priceNew(t))}</button></td>
      <td class="r">${p.used ? `<button class="mini" data-used="${t}">${fmt(priceUsed(t))}</button>` : '<span class="sub">только новые</span>'}</td>
      <td class="r num">${P.inv.filter((i) => i.type === t).length}</td></tr>`).join("") || `<tr><td colspan="4" class="sub">По известным данным дефектовки заказывать нечего. Продефектуйте узлы, чтобы узнать, что нужно.</td></tr>`;
    rows = `<thead><tr><th>Деталь</th><th class="r">Новая, 100%</th><th class="r">Б/У с донора</th><th class="r">Склад</th></tr></thead><tbody>${rows}</tbody>`;
  }
  const d = Math.round(discount() * 100);
  const body = modal("Терминал снабжения 558 АРЗ", `<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:baseline"><span>Счёт: <b class="num">${fmt(P.money)}</b></span>${d ? `<span class="note">Скидка по должности ${d}%</span>` : ""}
    <span class="note">Б/У детали дешевле, но изношены (ресурс 55–82%) и в ${LATENT_CHANCE * 100}% случаев скрывают брак — делайте входной контроль на складе.</span></div>
    <div class="tabs">${tabs.map(([k, n]) => `<button data-tab="${esc(k)}" class="${k === shopTab ? "on" : ""}">${esc(n)}</button>`).join("")}</div>
    <div class="tblwrap"><table class="tbl">${rows}</table></div>`);
  body.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { shopTab = b.dataset.tab; openShop(); }));
  body.querySelectorAll("[data-new]").forEach((b) => (b.onclick = () => buyPart(b.dataset.new, false)));
  body.querySelectorAll("[data-used]").forEach((b) => (b.onclick = () => buyPart(b.dataset.used, true)));
  body.querySelectorAll("[data-kit]").forEach((b) => (b.onclick = () => { const k = b.dataset.kit, pr = priceKit(k); if (P.money < pr) { toast("Недостаточно средств на счёте.", "crit"); return; }
    spend(pr); P.kits[k] = (P.kits[k] || 0) + 1; toast(`Куплен: ${KITS[k].name}.`, "ok"); A.beep(1400, 0.05, 0.05); afterChange(); openShop(); }));
}
function buyPart(t, used) {
  const pr = used ? priceUsed(t) : priceNew(t);
  if (P.money < pr) { toast("Недостаточно средств на счёте. Возьмите сверхурочную смену в личном деле.", "crit"); return; }
  spend(pr); A.beep(1400, 0.05, 0.05);
  const it = { uid: P.uid++, type: t, paid: pr, removed: false };
  if (!used) { Object.assign(it, { cond: 100, claimed: 100, defect: null, origin: "новая", verified: true }); toast(`Новая деталь «${PT[t].short}» на складе.`, "ok"); }
  else { const c = rint(55, 82); Object.assign(it, { claimed: c, origin: "Б/У", verified: false });
    if (Math.random() < LATENT_CHANCE) Object.assign(it, { cond: rint(18, 38), defect: pick(LATENT) }); else Object.assign(it, { cond: c, defect: null });
    toast(`Б/У «${PT[t].short}» с борта-донора № ${rint(10, 99)}, по паспорту ≈${c}%. Рекомендуется входной контроль.`, "warn", 5500); }
  P.inv.push(it);
  afterChange(); openShop();
}

/* ---------- склад ---------- */
export function openStock() {
  const rows = P.inv.map((it) => { const p = PT[it.type];
    const st = it.verified ? (it.defect || it.cond < OTK_MIN ? `<span class="state crit">брак ${it.cond}%</span>` : `<span class="state ${it.cond < 70 ? "warn" : "ok"}">${it.cond}%</span>`) : `<span class="state unk">≈${it.claimed}% · не проверена</span>`;
    return `<tr><td>${esc(p.short)}<div class="sub">${it.defect && it.verified ? esc(it.defect) : ""}</div></td><td class="sub">${it.removed ? "снята с борта" : esc(it.origin)}</td><td>${st}</td>
      <td class="r" style="white-space:nowrap">${it.verified ? "" : `<button class="mini" data-ic="${it.uid}">Вх. контроль</button> `}<button class="mini" data-sell="${it.uid}">Сдать</button></td></tr>`; }).join("");
  const kits = Object.entries(P.kits).filter(([, v]) => v > 0).map(([k, v]) => `<span class="chip">${esc(KITS[k].name)} ×${v}</span>`).join("");
  const body = modal("Склад запчастей", `${P.inv.length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>Деталь</th><th>Происхождение</th><th>Состояние</th><th class="r">Действия</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : `<p class="note" style="margin:0">Стеллажи пусты. Детали заказываются в терминале снабжения, снятые с самолёта узлы тоже попадают сюда.</p>`}
    ${kits ? `<div><div class="eyebrow" style="margin-bottom:6px">Ремкомплекты</div><div class="chips">${kits}</div></div>` : ""}
    <p class="note" style="margin:0">Входной контроль занимает 0,5 нормо-ч. Бракованную Б/У деталь поставщик забирает с полным возвратом денег. Ремфонд завода принимает ненужные детали: исправные — до 25% цены, брак — 5%.</p>`);
  body.querySelectorAll("[data-ic]").forEach((b) => (b.onclick = () => { const it = P.inv.find((i) => i.uid === +b.dataset.ic); it.verified = true;
    if (S) addHours(0.5, "Входной контроль: " + PT[it.type].short);
    if (it.defect) { if (it.paid && it.origin === "Б/У") { P.money += it.paid; P.stats.spent -= it.paid; P.inv = P.inv.filter((i) => i !== it); toast(`Брак: ${it.defect}. Деталь возвращена поставщику, ${fmt(it.paid)} зачислены на счёт.`, "warn", 6000); }
      else toast(`Брак: ${it.defect}.`, "crit"); }
    else toast(`Годна, фактический ресурс ${it.cond}%.`, "ok");
    afterChange(); openStock(); }));
  body.querySelectorAll("[data-sell]").forEach((b) => (b.onclick = () => { const it = P.inv.find((i) => i.uid === +b.dataset.sell), p = PT[it.type];
    const bad = it.defect || it.cond < OTK_MIN, v = Math.round((!it.verified ? p.price * 0.1 : bad ? p.price * 0.05 : p.price * 0.25 * it.cond / 100) / 10) * 10;
    P.inv = P.inv.filter((i) => i !== it); P.money += v; toast(`Сдано в ремфонд: ${p.short}, +${fmt(v)}`, "ok"); afterChange(); openStock(); }));
}

/* ═════════════════════════ ГОНКА ДВИГАТЕЛЕЙ ═════════════════════════ */
export let engineActive = false, E = null;
const STG = [
  { name: "МАЛЫЙ ГАЗ", short: "МГ", N: 70, egt: 430, oil: 3.0, vib: 6, load: 0 },
  { name: "НОМИНАЛ", short: "НОМ", N: 94, egt: 600, oil: 3.6, vib: 12, load: 0.6 },
  { name: "МАКСИМАЛ", short: "МАКС", N: 100, egt: 680, oil: 3.9, vib: 15, load: 0.85 },
  { name: "ФОРСАЖ", short: "ФОРС", N: 101, egt: 720, oil: 4.0, vib: 18, load: 1 },
];
const LIM = { egtW: 780, egtC: 840, vibW: 32, vibC: 45, hydW: 190, hydC: 170 };
const HOLD = 4, CRIT_T = 3;
export const getE = () => E;

function drawDial(cv, title, unit, val, min, max, zones, txt) {
  const g = cv.getContext("2d"), W2 = cv.width, cx = W2 / 2, cy = W2 / 2 + 8, R = W2 * 0.4;
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, ang = (v) => a0 + ((clamp(v, min, max) - min) / (max - min)) * (a1 - a0);
  g.clearRect(0, 0, W2, W2);
  g.lineWidth = 14;
  g.strokeStyle = "#2a353d"; g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke();
  for (const [f, t, c] of zones) { g.strokeStyle = c; g.beginPath(); g.arc(cx, cy, R, ang(f), ang(t)); g.stroke(); }
  g.strokeStyle = "#8ea0aa"; g.lineWidth = 2;
  for (let i = 0; i <= 10; i++) { const a = a0 + ((a1 - a0) * i) / 10; g.beginPath(); g.moveTo(cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22)); g.lineTo(cx + Math.cos(a) * (R - 10), cy + Math.sin(a) * (R - 10)); g.stroke(); }
  const a = ang(val); g.strokeStyle = "#f4f7f8"; g.lineWidth = 5; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (R - 14), cy + Math.sin(a) * (R - 14)); g.stroke();
  g.fillStyle = "#e8c04a"; g.beginPath(); g.arc(cx, cy, 9, 0, 7); g.fill();
  g.textAlign = "center"; g.fillStyle = "#94a5ae"; g.font = "600 24px 'IBM Plex Mono', monospace"; g.fillText(title, cx, cy - R * 0.38);
  g.fillStyle = "#e3e9eb"; g.font = "600 38px 'IBM Plex Mono', monospace"; g.fillText(txt, cx, cy + R * 0.62);
  g.fillStyle = "#94a5ae"; g.font = "20px 'IBM Plex Mono', monospace"; g.fillText(unit, cx, cy + R * 0.9);
}
function drawDials() {
  const o = E.stage === 0 ? [1.4, 2.0] : [2.0, 2.6];
  drawDial($("dN"), "N", "% оборотов", E.N, 0, 110, [[100, 110, "#5f717c"]], E.N.toFixed(1));
  drawDial($("dT"), "Тг", "°C за турбиной", E.egt, 300, 900, [[LIM.egtW, LIM.egtC, "#f0923a"], [LIM.egtC, 900, "#ea4b4b"]], E.egt.toFixed(0));
  drawDial($("dO"), "Рм", "кгс/см² масло", E.oil, 0, 6, [[0, o[0], "#ea4b4b"], [o[0], o[1], "#f0923a"]], E.oil.toFixed(2));
  drawDial($("dV"), "V", "мм/с вибрация", E.vib, 0, 60, [[LIM.vibW, LIM.vibC, "#f0923a"], [LIM.vibC, 60, "#ea4b4b"]], E.vib.toFixed(1));
  drawDial($("dH"), "Ргс", "кгс/см² гидро", E.hyd, 100, 240, [[100, LIM.hydC, "#ea4b4b"], [LIM.hydC, LIM.hydW, "#f0923a"]], E.hyd.toFixed(0));
}
export function engineMenu() {
  const req = requiredTests().filter((t) => t.startsWith("engine"));
  modal("Гонка двигателей РД-33", `<p class="note" style="margin:0">Тягач выкатит самолёт на газовочную площадку завода. Выводите двигатель по режимам <b style="color:var(--fg)">МАЛЫЙ ГАЗ → НОМИНАЛ → МАКСИМАЛ → ФОРСАЖ</b>, выдерживая каждый ${HOLD} секунды. Следите за температурой газов, давлением масла, вибрацией и гидросистемой. Если стрелка в красной зоне дольше ${CRIT_T} секунд, а режим не снижен, — пожар или помпаж, наряд провален.</p>
    ${req.length ? `<div class="chips">${req.map((t) => `<span class="chip ${S.tests[t] ? "ok" : "todo"}">${S.tests[t] ? "✓" : "○"} ${esc(TEST_NAME[t])}</span>`).join("")}</div>` : `<p class="note" style="margin:0">По наряду гонка пока не требуется, но её можно провести для диагностики.</p>`}
    <p class="note" style="margin:0">Управление: W / ▲ — прибавить режим, S / ▼ — убрать, Пробел — стоп-кран, C — вид из кабины / снаружи.</p>`,
    { footer: `<button class="mini" id="eL">Двигатель №1 (левый)</button><button class="mini" id="eR">Двигатель №2 (правый)</button>` });
  $("eL").onclick = () => { closeModal(); startEngineRun("L"); };
  $("eR").onclick = () => { closeModal(); startEngineRun("R"); };
}
function enginePrechecks(side) {
  const p = [];
  for (const id of SIDE[side]) if (!slot(id).on) p.push(`двигатель не собран: нет узла «${label(id)}»`);
  for (const id of GEAR) if (!slot(id).on) p.push(`шасси не собрано («${label(id)}») — выкатка невозможна`);
  for (const id of [...FUEL, ...HYDRO, ...CTRL]) if (!slot(id).on) p.push(`система разгерметизирована: нет «${label(id)}»`);
  return p;
}
export function uiMode(mode) { // "hangar" | "engine" | "radar" | "menu"
  const h = mode === "hangar";
  $("hud").hidden = !(h || mode === "radar"); $("card").hidden = !h || !selected;
  $("eng").hidden = mode !== "engine"; $("radar").hidden = mode !== "radar";
  if (h) renderCard();
  hooks.afterMenu(mode);
}
async function startEngineRun(side) {
  const pr = enginePrechecks(side);
  if (pr.length) { modal("Выкатка запрещена", `<ul>${pr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`, { narrow: true }); return; }
  addHours(1.5, `Гонка двигателя ${side === "L" ? "№1" : "№2"}`); P.stats.runs++; save();
  const c = effCond;
  E = { side, stage: 0, N: 0, egt: 20, oil: 0, vib: 0, hyd: 120, soak: 0, egtSpike: 0, vibSpike: 0, oilSpike: 0, surge: false, surgeT: 0, hold: 0, passed: [false, false, false, false],
    abFail: 0, critT: 0, grace: 0, warned: new Set(), max: { egt: 0, vib: 0 }, min: { oil: 99, hyd: 999 }, t: 0, phase: "prep", noise: { e: 0, v: 0, o: 0, h: 0 }, nt: 0, ending: false,
    k: { comp: c("comp_" + side), turb: c("turb_" + side), reg: c("reg_" + side), oilp: c("oilpump_" + side), oilf: c("oilfilt_" + side), noz: c("nozzle_" + side), ab: c("ab_" + side),
      htank: c("hydro_tank"), hoses: c("hydro_hoses"), hfilt: c("hydro_filter"), stab: Math.min(c("stab_L"), c("stab_R")) },
    leak: FUEL.some((x) => slot(x).defect || slot(x).cond < 50) };
  selectPart(null); VW.V.inspect = false; VW.setXray(false); VW.paintAll();
  await hooks.enterEngine(side);
  $("engTitle").textContent = `Газовочная площадка · РД-33 ${side === "L" ? "№1 (левый)" : "№2 (правый)"}`;
  $("engLog").innerHTML = ""; renderStages(); drawDials(); $("engAlarm").hidden = true; $("engFinish").disabled = true;
  engineActive = true;
  elog(`МиГ-29БМ № ${S.bort} на газовочной площадке: колодки, швартовка, газоотбойник, пожарный расчёт.`);
  if (E.leak) {
    const ok = await choiceBox("Течь топлива", "Техник докладывает: из-под фюзеляжа в районе бака №3 капает керосин.", [["stop", "Прекратить подготовку, в цех"], ["go", "Запускать — течь небольшая"]]);
    if (ok === "go") { catastrophe("ПОЖАР НА ГАЗОВОЧНОЙ ПЛОЩАДКЕ", "Пары керосина из негерметичного бака №3 воспламенились от горячей части двигателя при запуске.", "fire"); return; }
    toast("Правильно. Сначала устраните течь: уплотнения бака №3, топливопровод, люк-лаз.", "warn", 6000); endEngineRun(); return;
  }
  A.engineAudioStart(); E.phase = "start"; elog("РУД «СТОП». Запущен стартёр ГТДЭ, нажата кнопка «ЗАПУСК».");
}
function choiceBox(title, text, opts) {
  return new Promise((res) => {
    modal(title, `<p style="margin:0;line-height:1.5">${esc(text)}</p>`, { narrow: true, footer: opts.map(([k, l], i) => `<button class="mini ${i ? "" : "primary"}" data-k="${k}">${esc(l)}</button>`).join(""), onClose: () => res(opts[0][0]) });
    document.querySelectorAll("#mFoot [data-k]").forEach((b) => (b.onclick = () => { modalClose = null; closeModal(); res(b.dataset.k); }));
  });
}
function elog(t) { const d = document.createElement("div"); d.textContent = t; $("engLog").prepend(d); while ($("engLog").children.length > 12) $("engLog").lastChild.remove(); }
function renderStages() {
  $("engStages").innerHTML = STG.map((s, i) => `<span class="${E.passed[i] ? "pass" : ""} ${i === E.stage ? "cur" : ""}">${s.short}${E.passed[i] ? " ✓" : ""}${i === E.stage && !E.passed[i] ? `<i style="width:${clamp(E.hold / HOLD, 0, 1) * 100}%"></i>` : ""}</span>`).join("");
  $("engMode").textContent = STG[E.stage].name;
  $("engFinish").disabled = !E.passed.every(Boolean);
}
function targets() {
  const st = STG[E.stage], k = E.k, L = st.load, d = (v, r) => Math.max(0, r - v);
  let egt = st.egt + d(k.turb, 95) * 1.3 * (0.5 + L) + d(k.reg, 90) * 0.7 * L + (E.stage === 3 ? d(k.noz, 90) * 1.0 : 0) + E.soak * 6 + E.egtSpike;
  let vib = st.vib + d(k.comp, 95) * 0.38 * (0.4 + L) + E.vibSpike;
  const oil = st.oil - d(k.oilp, 90) * 0.04 - d(k.oilf, 80) * 0.015 + E.oilSpike;
  let N = st.N + (k.reg < 55 ? Math.sin(E.t * 1.7) * (55 - k.reg) * 0.08 : 0);
  const hyd = 212 - d(k.htank, 70) - d(k.hoses, 70) * 0.8 - d(k.hfilt, 70) * 0.3 - d(k.stab, 70) * 0.3;
  if (E.surge) { egt += 80; vib += 20; N -= 6; }
  return { N, egt: egt + E.noise.e, vib: vib + E.noise.v, oil: oil + E.noise.o, hyd: hyd + E.noise.h };
}
function levels() {
  const o = E.stage === 0 ? [2.0, 1.4] : [2.6, 2.0];
  return { egt: E.egt >= LIM.egtC ? 2 : E.egt >= LIM.egtW ? 1 : 0, vib: E.vib >= LIM.vibC ? 2 : E.vib >= LIM.vibW ? 1 : 0, oil: E.oil < o[1] ? 2 : E.oil < o[0] ? 1 : 0, hyd: E.hyd < LIM.hydC ? 2 : E.hyd < LIM.hydW ? 1 : 0 };
}
const PNAME = { egt: "температура газов", vib: "вибрация", oil: "давление масла", hyd: "давление в гидросистеме" };
export function engineTick(dt) {
  if (!E || E.ending) return;
  E.t += dt;
  const approach = (cur, tgt, tau) => cur + (tgt - cur) * (1 - Math.exp(-dt / tau));
  if (E.phase === "start") {
    const hang = E.k.reg < 35;
    const tgtN = hang && E.N > 40 ? 45 : 72;
    E.N = approach(E.N, tgtN, 1.3); E.egt = approach(E.egt, hang && E.N > 40 ? 900 : 520, hang ? 2.5 : 1.6); E.oil = approach(E.oil, 2.6, 1.2); E.vib = approach(E.vib, 5, 1); E.hyd = approach(E.hyd, 200, 1.5);
    if (hang && E.N > 40) {
      E.critT += dt; showAlarm(`ЗАВИСАНИЕ ОБОРОТОВ ПРИ ЗАПУСКЕ · Тг ${E.egt.toFixed(0)} °C — СТОП-КРАН!`, true);
      if (E.critT > 4) { catastrophe("ГОРЯЧИЙ ЗАПУСК — ПОЖАР ДВИГАТЕЛЯ", "Разрегулированный насос-регулятор переобогатил смесь, обороты зависли, температура газов вышла за предел.", "fire"); return; }
    } else if (E.N > 69) { E.phase = "run"; E.critT = 0; E.grace = 2; elog("Двигатель вышел на МАЛЫЙ ГАЗ."); }
    A.engineAudioUpdate(E.N, false); drawDials(); return;
  }
  if (E.phase === "cool") {
    E.coolT += dt; const tgtN = E.coolT < 3 ? 70 : 0;
    E.N = approach(E.N, tgtN, E.coolT < 3 ? 1 : 1.2); E.egt = approach(E.egt, E.coolT < 3 ? 450 : 80, 1.5); E.oil = approach(E.oil, E.coolT < 3 ? 3 : 0, 1.2); E.vib = approach(E.vib, 3, 0.8);
    A.engineAudioUpdate(E.N, false); drawDials();
    if (E.coolT > 6) finishRun(false);
    return;
  }
  E.nt -= dt; if (E.nt <= 0) { E.nt = 0.35; E.noise = { e: gauss() * 5, v: gauss() * 1.2, o: gauss() * 0.06, h: gauss() * 1.2 }; }
  if (E.stage > 0 && Math.random() < dt * 0.03) { E.vibSpike += rnd(8, 12); elog("Кратковременный рост вибрации!"); }
  if (E.stage > 0 && Math.random() < dt * 0.025) { E.oilSpike -= rnd(0.5, 0.8); elog("Просадка давления масла!"); }
  E.egtSpike *= Math.exp(-dt / 1.6); E.vibSpike *= Math.exp(-dt / 1.4); E.oilSpike *= Math.exp(-dt / 1.4);
  const T = targets();
  E.N = approach(E.N, T.N, 0.9); E.egt = approach(E.egt, T.egt, 1.3); E.vib = approach(E.vib, T.vib, 0.5); E.oil = approach(E.oil, T.oil, 0.8); E.hyd = approach(E.hyd, T.hyd, 0.8);
  E.max.egt = Math.max(E.max.egt, E.egt); E.max.vib = Math.max(E.max.vib, E.vib); E.min.oil = Math.min(E.min.oil, E.oil); E.min.hyd = Math.min(E.min.hyd, E.hyd);
  const lv = levels(); for (const k in lv) if (lv[k]) E.warned.add(k);
  const crit = Object.keys(lv).filter((k) => lv[k] === 2), warn = Object.keys(lv).filter((k) => lv[k] === 1);
  E.grace = Math.max(0, E.grace - dt);
  const steady = Math.abs(E.N - STG[E.stage].N) < 2.5;
  if (!crit.length && !E.surge && steady && !E.passed[E.stage]) { E.hold += dt;
    if (E.hold >= HOLD) { E.passed[E.stage] = true; elog(`Режим «${STG[E.stage].name}» ЗАЧТЁН.`); A.beep(1320, 0.08, 0.08);
      if (E.passed.every(Boolean)) { elog("Все режимы отработаны. Завершите гонку с охлаждением."); toast("Все режимы зачтены. Нажмите «Завершить гонку».", "ok"); } } }
  if (warn.length && !crit.length) E.soak += dt; else if (!warn.length) E.soak = Math.max(0, E.soak - dt);
  if (E.surge) { E.surgeT += dt; VW.V.shake = Math.max(VW.V.shake, 0.35); if (Math.random() < dt * 3) A.boom();
    showAlarm(`ПОМПАЖ! Хлопки и тряска — немедленно уберите РУД (${Math.max(0, 2.5 - E.surgeT).toFixed(1)} с)`, true);
    if (E.surgeT > 2.5) { catastrophe("ПОМПАЖ И РАЗРУШЕНИЕ КОМПРЕССОРА", "Двигатель был в помпаже, а РУД не убрали. Срыв потока, обрыв лопаток компрессора, разрушение двигателя.", "blast"); return; } }
  else if (crit.length && E.grace <= 0) {
    E.critT += dt; if (Math.floor(E.t * 4) % 2 === 0) A.beep(980, 0.05, 0.06);
    showAlarm(`КРИТИЧНО: ${crit.map((k) => PNAME[k]).join(", ")} — ${E.stage ? "СНИЗЬТЕ РЕЖИМ" : "СТОП-КРАН"}! ${Math.max(0, CRIT_T - E.critT).toFixed(1)} с`, true);
    if (E.critT > CRIT_T) { const k = crit[0];
      if (k === "egt") catastrophe("ПОЖАР ДВИГАТЕЛЯ", "Температура газов за турбиной превысила предел, режим не был снижен. Прогар лопаток и корпуса турбины, пожар в мотогондоле.", "fire");
      else if (k === "hyd") catastrophe("ПОЖАР: ВЫБРОС АМГ-10", "Давление в гидросистеме упало ниже критического. Шланг разорвало, гидрожидкость попала на горячую часть двигателя.", "fire");
      else if (k === "vib") catastrophe("ПОМПАЖ: ОБРЫВ ЛОПАТКИ КОМПРЕССОРА", "Критическая вибрация проигнорирована. Оборвалась повреждённая лопатка, двигатель ушёл в помпаж.", "blast");
      else catastrophe("РАЗРУШЕНИЕ ПОДШИПНИКА ОПОРЫ", "Давление масла ниже критического, двигатель не выключили. Масляное голодание и заклинивание ротора.", "blast");
      return; }
  } else {
    E.critT = crit.length ? E.critT : 0;
    if (crit.length) showAlarm(`Режим снижен — следите за стрелками (${crit.map((k) => PNAME[k]).join(", ")})`, false);
    else if (warn.length) showAlarm(`Жёлтая зона: ${warn.map((k) => PNAME[k]).join(", ")}. При долгой выдержке растёт.`, false);
    else $("engAlarm").hidden = true;
  }
  // проверка гидросистемы: стабилизаторы отрабатывают отклонения
  VW.V.stabDeflect = E.stage > 0 ? Math.sin(E.t * 0.9) * 0.18 : 0;
  A.engineAudioUpdate(E.N, E.stage === 3); renderStages(); drawDials();
}
function showAlarm(t, crit) { const a = $("engAlarm"); a.textContent = t; a.classList.toggle("warn", !crit); a.hidden = false; }
export function rudUp() {
  if (!E || E.phase !== "run" || E.ending) return;
  if (E.stage >= 3) { toast("Форсаж — максимальный режим.", ""); return; }
  if (!E.passed[E.stage]) { toast("Сначала выдержите текущий режим: полоска под режимом должна заполниться.", "warn"); return; }
  if (E.stage === 2) {
    if (E.abFail >= 2) { catastrophe("ХЛОПОК В ФОРСАЖНОЙ КАМЕРЕ — ПОЖАР", "Повторный розжиг при скопившемся в камере топливе: хлопок, выброс пламени, пожар мотогондолы.", "fire"); return; }
    if (Math.random() > Math.min(0.98, E.k.ab / 100 + 0.15)) { E.abFail++; A.boom(); VW.V.shake = 0.3;
      elog("Розжиг форсажа не произошёл: срыв пламени, выброс несгоревшего топлива!");
      toast(E.abFail >= 2 ? "ОПАСНО! В форсажной камере скопилось топливо. Повторный розжиг вызовет хлопок. Остановите двигатель и проверьте форсунки." : "Срыв розжига форсажа. Можно попробовать ещё раз.", E.abFail >= 2 ? "crit" : "warn", 6000);
      return; }
    elog("Форсаж включён: створки раскрылись, ровный факел.");
  } else elog(`РУД на режим «${STG[E.stage + 1].name}».`);
  E.stage++; E.hold = 0; E.soak = 0;
  if (Math.random() < 0.35) { E.egtSpike = rnd(45, 75); elog("Заброс температуры газов при приёмистости!"); }
  if (E.k.comp < 50 && Math.random() < ((50 - E.k.comp) / 50) * 0.7) { E.surge = true; E.surgeT = 0; A.boom(); elog("ПОМПАЖ!"); }
  renderStages();
}
export function rudDown() {
  if (!E || E.phase !== "run" || E.ending || E.stage === 0) return;
  E.stage--; E.hold = E.passed[E.stage] ? HOLD : 0; E.soak = 0; E.egtSpike = E.vibSpike = E.oilSpike = 0; E.grace = CRIT_T; E.critT = 0;
  if (E.surge) { E.surge = false; elog("РУД убран — двигатель вышел из помпажа."); } else elog(`Режим снижен до «${STG[E.stage].name}».`);
  renderStages();
}
function techReport() {
  const k = E.k, n = [];
  if (k.comp < 55) n.push("на входе металлический звон, будто что-то задевает");
  if (k.turb < 55) n.push("из сопла летят искры, на срезе окалина");
  if (k.reg < 55) n.push("обороты «гуляют», двигатель то подхватывает, то проседает");
  if (k.oilp < 55 || k.oilf < 45) n.push("из дренажа капает масло, пахнет горячим маслом");
  if (k.noz < 55) n.push("одна створка сопла отстаёт");
  if (k.ab < 55) n.push("на прошлых гонках форсаж разжигался с хлопками");
  if (Math.min(k.htank, k.hoses) < 55 || k.hfilt < 50 || k.stab < 55) n.push("под самолётом подтёки красной жидкости АМГ-10");
  toast("Техник: " + (n.length ? n.join("; ") : "работает ровно, посторонних звуков нет, течей не вижу") + ".", n.length ? "warn" : "ok", 7000);
}
export function engineStop() {
  if (!E || E.ending) return;
  if (E.phase === "start") { elog("Запуск прекращён, выполнена холодная прокрутка."); if (E.k.reg < 35) { slot("reg_" + E.side).suspect = slot("reg_" + E.side).known < 2;
    toast("Причина зависания — топливная автоматика. Проверьте насос-регулятор НР-59А.", "warn", 6000); } abortRun(); return; }
  if (E.passed.every(Boolean)) { if (E.stage >= 2) S.hot = true; finishRun(E.stage >= 2); return; }
  abortRun();
}
function engineFinish() { if (!E || E.ending || !E.passed.every(Boolean)) return; E.phase = "cool"; E.coolT = 0; E.stage = 0; elog("РУД на МАЛЫЙ ГАЗ, охлаждение 3 минуты, затем останов."); $("engAlarm").hidden = true; }
function finishRun(hot) {
  E.ending = true; const side = E.side; S.tests["engine_" + side] = true; S.tests.engine_any = true; save();
  A.engineAudioStop(); $("engAlarm").hidden = true;
  modal(`Протокол гонки: двигатель №${side === "L" ? 1 : 2} годен`, `<div class="act">
    <div>Макс. температура газов: ${E.max.egt.toFixed(0)} °C (предел ${LIM.egtC})</div><div>Макс. вибрация: ${E.max.vib.toFixed(1)} мм/с (предел ${LIM.vibC})</div>
    <div>Мин. давление масла: ${E.min.oil.toFixed(2)} кгс/см²</div><div>Мин. давление в гидросистеме: ${E.min.hyd.toFixed(0)} кгс/см²</div></div>
    ${hot ? `<p class="defect" style="margin:0">Двигатель выключен стоп-краном с высокого режима без охлаждения — нарушение РЛЭ (термоудар). Будет учтено при оплате.</p>` : `<p class="note" style="margin:0">Двигатель охлаждён на малом газе и выключен. Гидросистема и тормоза проверены под нагрузкой.</p>`}`,
    { narrow: true, footer: `<button class="mini primary" id="pOk">В цех</button>`, onClose: endEngineRun });
  $("pOk").onclick = closeModal;
}
function abortRun() {
  E.ending = true; A.engineAudioStop(); $("engAlarm").hidden = true;
  const hints = { egt: "температура газов → лопатки турбины, НР-59А, створки сопла", vib: "вибрация → лопатки компрессора", oil: "давление масла → маслонасос, маслофильтр", hyd: "гидросистема → гидробак, шланги, фильтр, приводы стабилизатора" };
  const list = [...E.warned].map((k) => hints[k]); if (E.abFail) list.push("срыв розжига форсажа → форсунки форсажной камеры");
  modal("Гонка прекращена", `<p style="margin:0">Двигатель выключен, не все режимы зачтены. Самолёт отбуксирован в цех.</p>${list.length ? `<div><div class="eyebrow" style="margin-bottom:6px">Замечания — проверьте узлы</div><ul>${list.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}`,
    { narrow: true, footer: `<button class="mini primary" id="pOk">В цех</button>`, onClose: endEngineRun });
  $("pOk").onclick = closeModal;
}
function catastrophe(title, text, kind) {
  if (!E) return; E.ending = true; E.phase = "dead";
  VW.catastropheFx(E.side, true);
  VW.V.shake = 1.2; A.boom(); setTimeout(A.boom, 400); showAlarm(title, true);
  if (VW.V.R.grade) { const f = VW.V.R.grade.uniforms.uFlash.value; f.set(1, 0.55, 0.2, 0.35); }
  void kind;
  setTimeout(() => { A.engineAudioStop();
    const m = mission(), fine = Math.min(P.money, Math.round(m.reward * 0.2));
    P.money -= fine; P.stats.failures++; S = null; selectPart(null); save();
    modal("НАРЯД ПРОВАЛЕН", `<h3 style="color:var(--crit);font-size:20px">${esc(title)}</h3><p style="margin:0;line-height:1.5">${esc(text)}</p>
      <p style="margin:0;line-height:1.5">Пожарный расчёт ликвидировал возгорание, пострадавших нет. Комиссия установила: оператор проигнорировал критические показания приборов.</p>
      <p style="margin:0">Удержано из подотчётных средств: <b class="num">${fmt(fine)}</b>. Наряд можно взять повторно.</p>`,
      { narrow: true, footer: `<button class="mini primary" id="pOk">Вернуться в цех</button>`, onClose: endEngineRun });
    $("pOk").onclick = closeModal;
  }, 2600);
}
async function endEngineRun() {
  engineActive = false; E = null; VW.V.shake = 0; VW.V.stabDeflect = 0;
  VW.catastropheFx(null, false);
  if (VW.V.R.grade) VW.V.R.grade.uniforms.uFlash.value.set(0, 0, 0, 0);
  await hooks.exitEngine();
  syncPlane(); afterChange();
}
$("rudUp").onclick = rudUp; $("rudDown").onclick = rudDown; $("engStop").onclick = engineStop; $("engFinish").onclick = engineFinish;
$("engReport").onclick = () => E && techReport();
$("engSound").onclick = () => { A.setSound(!A.AU.on); $("engSound").textContent = "Звук: " + (A.AU.on ? "вкл" : "выкл"); };

/* ═════════════════════════ НАСТРОЙКА РЛС «ТОПАЗ» ═════════════════════════ */
export let RD = null;
// [команда, синонимы]: массив, а не объект — кириллические ключи объекта минификатор пишет без кавычек
const RCMD = [["ПИТАНИЕ", ["ПИТАНИЕ", "ПИТ", "POWER", "PWR"]], ["ПРОГРЕВ", ["ПРОГРЕВ", "ПРОГ", "WARM", "WARMUP"]], ["ВСК", ["ВСК", "САМОКОНТРОЛЬ", "BIT"]],
  ["ЭКВИВАЛЕНТ", ["ЭКВИВАЛЕНТ", "ЭКВ", "НАГРУЗКА", "LOAD", "DUMMY"]], ["ИЗЛУЧЕНИЕ", ["ИЗЛУЧЕНИЕ", "ИЗЛ", "TX", "RADIATE"]], ["СТАТУС", ["СТАТУС", "STATUS"]], ["СПРАВКА", ["СПРАВКА", "?", "HELP"]]];
export function radarStart() {
  const miss = RADAR.filter((id) => !slot(id).on);
  if (miss.length) { modal("Настройка невозможна", `<p style="margin:0">Не установлены узлы: ${miss.map((id) => "«" + esc(label(id)) + "»").join(", ")}.</p>`, { narrow: true }); return; }
  addHours(2.5, "Настройка и юстировка РЛС «Топаз»"); save();
  selectPart(null); hooks.enterRadar();
  RD = { stage: 1, st: { power: false, warm: false, bit: false, load: false }, err: 0, hf: effCond("radar_hf"), drv: effCond("radar_drive") };
  uiMode("radar"); renderR1();
}
function rline(t, cls = "") { const d = document.createElement("div"); if (cls) d.className = cls; d.textContent = t; $("term").appendChild(d); $("term").scrollTop = 1e6; }
function renderR1() {
  $("crt").innerHTML = `<h2>КПА-Н019МЭ · ЭТАП 1 из 3 · ВКЛЮЧЕНИЕ И САМОКОНТРОЛЬ</h2>
  <div class="card-tk">ТЕХНОЛОГИЧЕСКАЯ КАРТА ТК-Н019МЭ-12 «Проверка РЛС после ремонта»<br>
  1. Подать электропитание на изделие от наземного источника.<br>2. Выполнить прогрев передатчика.<br>3. Выполнить встроенный самоконтроль (ВСК).<br>
  4. ВНИМАНИЕ! Излучение в помещении цеха без подключённого эквивалента антенны ЗАПРЕЩЕНО.<br>5. Включить излучение и перейти к калибровке частотных литер.</div>
  <div class="term" id="term"></div>
  <form class="row" id="rform"><span>КПА&gt;</span><input type="text" id="rcmd" autocomplete="off" spellcheck="false" aria-label="Команда КПА"><button type="submit">Ввод</button></form>
  <div class="row"><button id="rhelp">СПРАВКА</button><button id="rstat">СТАТУС</button><span style="flex:1"></span><button id="rexit">Прервать настройку</button></div>`;
  rline("КПА-Н019МЭ готова. Подключены жгуты к разъёмам РЛС, питание от наземного агрегата.", "dim");
  rline("Введите команду. Список команд — СПРАВКА.", "dim");
  $("rform").onsubmit = (e) => { e.preventDefault(); const v = $("rcmd").value; $("rcmd").value = ""; radarCmd(v); };
  $("rhelp").onclick = () => radarCmd("СПРАВКА"); $("rstat").onclick = () => radarCmd("СТАТУС"); $("rexit").onclick = () => radarEnd(false);
  setTimeout(() => $("rcmd") && $("rcmd").focus(), 50);
}
function radarCmd(raw) {
  const t = raw.trim().toUpperCase(); if (!t) return;
  rline("КПА> " + t, "inv"); A.beep(1800, 0.02, 0.03);
  const hit = RCMD.find(([, al]) => al.includes(t)), key = hit && hit[0], st = RD.st;
  const err = (m) => { RD.err++; rline(`ОТКАЗ: ${m}  [ошибок оператора ${RD.err}/5]`, "err");
    if (RD.err >= 5) { rline("КПА ЗАБЛОКИРОВАНА ПО ЧИСЛУ ОШИБОК ОПЕРАТОРА. Процедура прервана, время потрачено.", "err"); setTimeout(() => radarEnd(false, "КПА заблокирована по числу ошибок. Повторите настройку."), 1800); } };
  if (!key) return err("неизвестная команда — введите СПРАВКА");
  if (key === "СПРАВКА") { [["ПИТАНИЕ", "подать электропитание на изделие"], ["ПРОГРЕВ", "прогрев передатчика"], ["ВСК", "встроенный самоконтроль"], ["ЭКВИВАЛЕНТ", "подключить эквивалент антенны"], ["ИЗЛУЧЕНИЕ", "включить излучение"], ["СТАТУС", "состояние изделия"]].forEach(([a, b]) => rline(`  ${a.padEnd(11)} — ${b}`)); return; }
  if (key === "СТАТУС") { rline(`  Питание: ${st.power ? "ДА" : "нет"}   Прогрев: ${st.warm ? "ДА" : "нет"}   ВСК: ${st.bit ? "НОРМА" : "нет"}   Эквивалент: ${st.load ? "ДА" : "нет"}`); return; }
  if (key === "ПИТАНИЕ") { if (st.power) return rline("Питание уже подано.", "dim"); st.power = true; return rline("Подано ~115 В 400 Гц и =27 В. Токи потребления в норме."); }
  if (!st.power) return err("нет питания изделия");
  if (key === "ПРОГРЕВ") { if (st.warm) return rline("Передатчик уже прогрет.", "dim"); rline("Прогрев передатчика… ■■■■■■■■■■ готов."); st.warm = true; return; }
  if (key === "ЭКВИВАЛЕНТ") { st.load = true; return rline("Эквивалент антенны подключён к волноводному тракту."); }
  if (key === "ВСК") {
    rline("Встроенный самоконтроль:");
    const checks = [["suo_harness", "обмен по МКИО с БЦВМ СУО", "НЕТ ОБМЕНА ПО МКИО — проверить жгут СУО"], ["radar_hf", "ВЧ-тракт передатчика", "ОТКАЗ ВЧ-БЛОКА: мощность ниже нормы"],
      ["radar_drive", "привод антенны", "ОТКАЗ ПРИВОДА: превышение тока, рассогласование"], ["radome", "КСВН антенно-фидерного тракта", "КСВН ВЫШЕ НОРМЫ — осмотреть обтекатель"]];
    const bad = [];
    for (const [id, n, f] of checks) { const ok = effCond(id) >= 50; rline(`  ${n.padEnd(32, ".")} ${ok ? "НОРМА" : "ОТКАЗ"}`, ok ? "" : "err"); if (!ok) { bad.push(f); if (slot(id).known < 2) slot(id).suspect = true; } }
    if (bad.length) { rline("ВСК: ИЗДЕЛИЕ НЕИСПРАВНО", "err"); bad.forEach((b) => rline("  код отказа: " + b, "err")); rline("Настройка невозможна. Найдите и устраните неисправность.", "dim");
      setTimeout(() => radarEnd(false, "ВСК выявил отказ: " + bad.join("; ") + "."), 2600); return; }
    st.bit = true; return rline("ВСК: ИЗДЕЛИЕ ИСПРАВНО");
  }
  if (key === "ИЗЛУЧЕНИЕ") {
    if (!st.warm) return err("блокировка — передатчик не прогрет");
    if (!st.bit) return err("блокировка — не выполнен встроенный самоконтроль");
    if (!st.load) { const fine = Math.min(500, P.money); P.money -= fine;
      rline("!!! ИЗЛУЧЕНИЕ В ПОМЕЩЕНИЕ ЦЕХА БЕЗ ЭКВИВАЛЕНТА АНТЕННЫ !!!", "err");
      rline(`Грубое нарушение техники безопасности: персонал подвергся СВЧ-облучению. Начальник цеха остановил работы. Штраф ${fmt(fine)}`, "err");
      setTimeout(() => radarEnd(false, `Нарушение ТБ: излучение без эквивалента антенны. Штраф ${fmt(fine)}`), 2600); return; }
    rline("Излучение включено. Передатчик работает на эквивалент нагрузки."); setTimeout(renderR2, 900);
  }
}
function renderR2() {
  RD.stage = 2; RD.t = 75; RD.inbal = 0;
  RD.base = [0, 1, 2].map(() => (Math.random() < 0.5 ? -1 : 1) * rnd(3, 9)); RD.drift = [0, 0, 0]; RD.knob = [0, 0, 0];
  RD.sigma = 0.1 + (Math.max(0, 95 - RD.hf) / 100) * 0.6;
  $("crt").innerHTML = `<h2>ЭТАП 2 из 3 · КАЛИБРОВКА ЧАСТОТНЫХ ЛИТЕР</h2>
  <div class="card-tk">Сведите отклонение Δf всех трёх литер в допуск ±0,5 МГц (зелёная полоса) и удержите баланс 3 секунды. Ручка литеры сдвигает соседние литеры на 20 % в ту же сторону. Тепловой дрейф передатчика постоянно сбивает настройку.</div>
  <div class="lits">${[0, 1, 2].map((i) => `<div class="lit"><b>ЛИТЕРА ${i + 1}</b><canvas id="lc${i}" width="160" height="300"></canvas><span class="num" id="lv${i}">Δf = 0.00</span>
    <input type="range" id="lk${i}" min="-15" max="15" step="0.05" value="0" aria-label="Подстройка литеры ${i + 1}"></div>`).join("")}</div>
  <div class="row"><span id="rbal">Баланс: 0.0 / 3.0 с</span><span style="flex:1"></span><span id="rtime" class="num">75 с</span><button id="rexit">Прервать</button></div>`;
  [0, 1, 2].forEach((i) => ($("lk" + i).oninput = (e) => { RD.knob[i] = +e.target.value; }));
  $("rexit").onclick = () => radarEnd(false);
}
function devs() { const k = RD.knob; return [0, 1, 2].map((i) => RD.base[i] + RD.drift[i] + k[i] + 0.2 * ((k[i - 1] || 0) + (k[i + 1] || 0))); }
function drawLit(cv, d) {
  const g = cv.getContext("2d"), w = cv.width, h = cv.height, y = (v) => h / 2 - (clamp(v, -10, 10) / 10) * (h / 2 - 10);
  g.clearRect(0, 0, w, h); g.fillStyle = "rgba(125,255,168,.18)"; g.fillRect(10, y(0.5), w - 20, y(-0.5) - y(0.5));
  g.strokeStyle = "#2f7a4c"; g.lineWidth = 1; for (let v = -10; v <= 10; v += 2) { g.beginPath(); g.moveTo(w / 2 - 14, y(v)); g.lineTo(w / 2 + 14, y(v)); g.stroke(); }
  g.beginPath(); g.moveTo(w / 2, 6); g.lineTo(w / 2, h - 6); g.stroke();
  const ok = Math.abs(d) <= 0.5; g.fillStyle = ok ? "#7dffa8" : Math.abs(d) < 3 ? "#ffd27a" : "#ff8a7a";
  g.fillRect(18, y(d) - 4, w - 36, 8);
}
export function radarTick(dt) {
  if (!RD) return;
  if (RD.stage === 2) {
    RD.t -= dt;
    for (let i = 0; i < 3; i++) RD.drift[i] += gauss() * RD.sigma * Math.sqrt(dt) * 1.4;
    const d = devs();
    d.forEach((v, i) => { drawLit($("lc" + i), v); $("lv" + i).textContent = `Δf = ${v >= 0 ? "+" : ""}${v.toFixed(2)} МГц`; });
    if (d.every((v) => Math.abs(v) <= 0.5)) RD.inbal += dt; else RD.inbal = 0;
    $("rbal").textContent = `Баланс: ${RD.inbal.toFixed(1)} / 3.0 с`; $("rtime").textContent = Math.max(0, RD.t).toFixed(0) + " с";
    if (RD.inbal >= 3) { RD.stage = 2.5; setTimeout(renderR3, 700); $("rbal").textContent = "Баланс частот удержан. Калибровка завершена."; }
    else if (RD.t <= 0) { RD.stage = 0; radarEnd(false, "Время калибровки истекло, передатчик перегрелся." + (RD.hf < 70 ? " Сильный дрейф частоты — признак износа ВЧ-блока." : "")); }
  }
  if (RD && RD.stage === 4) { RD.sweep += dt * 2.2; drawScope(); VW.V.radarSweep = Math.sin(RD.sweep) * 0.6; if (RD.sweep > Math.PI * 2.2) radarSuccess(); }
}
function renderR3() {
  RD.stage = 3; RD.az = (Math.random() < 0.5 ? -1 : 1) * rnd(1, 3.5); RD.el = (Math.random() < 0.5 ? -1 : 1) * rnd(0.5, 2.5); RD.moves = 0; RD.fine = false;
  RD.back = 0.04 + (Math.max(0, 95 - RD.drv) / 100) * 0.5;
  $("crt").innerHTML = `<h2>ЭТАП 3 из 3 · ЮСТИРОВКА АНТЕННЫ (УГЛЫ ОБЗОРА)</h2>
  <div class="card-tk">Антенна наведена на контрольный излучатель юстировочного стенда. Совместите электрическую ось антенны со строительной осью самолёта: допуск ±0,10° по азимуту и углу места. Затем запишите коэффициенты в ПЗУ командой ЗАПИСЬ. Изношенный привод отрабатывает поправки с люфтом.</div>
  <div class="bore"><canvas id="bc" width="400" height="400"></canvas>
  <div style="display:flex;flex-direction:column;gap:10px;align-items:center">
    <div class="pad"><span></span><button data-d="0,1" aria-label="Угол места вверх">▲</button><span></span><button data-d="-1,0" aria-label="Азимут влево">◄</button><button id="bstep" title="Шаг">0.5°</button><button data-d="1,0" aria-label="Азимут вправо">►</button><span></span><button data-d="0,-1" aria-label="Угол места вниз">▼</button><span></span></div>
    <span class="num" id="berr"></span><span class="num" id="bmov"></span>
    <button id="bsave" disabled>ЗАПИСЬ в ПЗУ</button><button id="rexit">Прервать</button></div></div>`;
  document.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => { const [x, y] = b.dataset.d.split(",").map(Number); boreMove(x, y); }));
  $("bstep").onclick = () => { RD.fine = !RD.fine; $("bstep").textContent = RD.fine ? "0.1°" : "0.5°"; };
  $("bsave").onclick = () => { RD.stage = 4; RD.sweep = 0; $("crt").innerHTML = `<h2>КОНТРОЛЬ СЕКТОРА ОБЗОРА</h2><canvas id="scope" width="640" height="340" style="width:100%;max-width:640px;align-self:center"></canvas><div>Коэффициенты юстировки записаны в ПЗУ. Антенна проходит сектор обзора…</div>`; };
  $("rexit").onclick = () => radarEnd(false);
  drawBore();
}
export function boreMove(x, y) {
  if (!RD || RD.stage !== 3) return;
  const step = RD.fine ? 0.1 : 0.5, k = 1 + rnd(-RD.back, RD.back);
  RD.az += x * step * k; RD.el += y * step * k; RD.moves++; A.beep(700, 0.03, 0.03);
  if (RD.moves >= 30 && !(Math.abs(RD.az) <= 0.1 && Math.abs(RD.el) <= 0.1)) { radarEnd(false, "Лимит шагов исчерпан, юстировка не выполнена." + (RD.drv < 70 ? " Привод не отрабатывает малые поправки — вероятен износ привода антенны." : "")); return; }
  drawBore();
}
function drawBore() {
  const cv = $("bc"), g = cv.getContext("2d"), w = cv.width, c = w / 2, sc = (w / 2 - 20) / 4;
  g.fillStyle = "#031009"; g.fillRect(0, 0, w, w); g.strokeStyle = "#1f5a37"; g.lineWidth = 1;
  for (let v = -4; v <= 4; v++) { g.beginPath(); g.moveTo(c + v * sc, 10); g.lineTo(c + v * sc, w - 10); g.stroke(); g.beginPath(); g.moveTo(10, c + v * sc); g.lineTo(w - 10, c + v * sc); g.stroke(); }
  g.strokeStyle = "#7dffa8"; g.lineWidth = 2; g.strokeRect(c - 0.1 * sc, c - 0.1 * sc, 0.2 * sc, 0.2 * sc);
  g.beginPath(); g.arc(c, c, 6, 0, 7); g.stroke();
  const x = c + clamp(RD.az, -4, 4) * sc, y = c - clamp(RD.el, -4, 4) * sc, ok = Math.abs(RD.az) <= 0.1 && Math.abs(RD.el) <= 0.1;
  g.fillStyle = ok ? "#7dffa8" : "#ffd27a"; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill();
  g.strokeStyle = g.fillStyle; g.beginPath(); g.moveTo(x - 18, y); g.lineTo(x + 18, y); g.moveTo(x, y - 18); g.lineTo(x, y + 18); g.stroke();
  $("berr").textContent = `АЗ ${RD.az >= 0 ? "+" : ""}${RD.az.toFixed(2)}°  УМ ${RD.el >= 0 ? "+" : ""}${RD.el.toFixed(2)}°`;
  $("bmov").textContent = `шаг ${RD.moves} / 30`;
  $("bsave").disabled = !ok;
}
function drawScope() {
  const cv = $("scope"); if (!cv) return; const g = cv.getContext("2d"), w = cv.width, h = cv.height, cx = w / 2, cy = h - 14, R = h - 30;
  g.fillStyle = "rgba(3,16,9,.25)"; g.fillRect(0, 0, w, h);
  g.strokeStyle = "#1f5a37"; g.lineWidth = 1;
  for (let r = 1; r <= 4; r++) { g.beginPath(); g.arc(cx, cy, (R * r) / 4, Math.PI * 1.17, Math.PI * 1.83); g.stroke(); }
  const a = Math.PI * 1.17 + Math.PI * 0.66 * (0.5 + 0.5 * Math.sin(RD.sweep));
  g.strokeStyle = "#7dffa8"; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke();
  g.fillStyle = "#b6ffd0"; g.beginPath(); g.arc(cx, cy - R * 0.62, 6, 0, 7); g.fill();
}
function radarSuccess() {
  RD = null; S.tests.radar = true; P.stats.radar++; VW.V.radarSweep = 0; afterChange();
  $("crt").innerHTML = `<h2>ПРОТОКОЛ НАСТРОЙКИ РЛС: ИЗДЕЛИЕ ГОДНО</h2>
  <div>Частотные литеры сбалансированы, электрическая ось антенны совмещена со строительной осью самолёта, коэффициенты записаны в ПЗУ, сектор обзора отработан без заеданий. Излучение выключено, эквивалент отстыкован, питание снято.</div>
  <div class="row"><button id="rexit">В цех</button></div>`;
  $("rexit").onclick = () => radarEnd(true);
}
function radarEnd(ok, why) {
  RD = null; VW.V.radarSweep = 0; uiMode("hangar"); hooks.exitRadar(); afterChange();
  if (!ok && why) toast(why, "warn", 7000); else if (!ok) toast("Настройка РЛС прервана.");
  else toast("РЛС «Топаз» настроена. Протокол подписан.", "ok");
}

/* ═════════════════════════ ОТК И ОПЛАТА ═════════════════════════ */
export function otk() {
  const miss = SID.filter((id) => !slot(id).on);
  if (miss.length) { modal("ОТК: самолёт не укомплектован", `<p style="margin:0">Не установлены узлы:</p><ul>${miss.map((id) => `<li>${esc(label(id))}</li>`).join("")}</ul>`, { narrow: true }); return; }
  const np = requiredTests().filter((t) => !S.tests[t]);
  if (np.length) { modal("ОТК: нет протоколов испытаний", `<p style="margin:0">Самолёт не принимается без протоколов:</p><ul>${np.map((t) => `<li>${esc(TEST_NAME[t])}</li>`).join("")}</ul>`, { narrow: true }); return; }
  const bad = SID.filter((id) => slot(id).defect || slot(id).cond < OTK_MIN);
  if (bad.length) {
    S.rework++; P.stats.returns++; addHours(1, "Предъявление ОТК: возврат на доработку");
    for (const id of bad) { slot(id).known = 2; slot(id).claimed = null; markFound(id, "otk"); }
    afterChange();
    const body = modal("ВОЗВРАТ НА ДОРАБОТКУ", `<p style="margin:0">Контролёр ОТК проверил формуляры, пломбы и выборочно узлы. Выявлены неустранённые дефекты:</p>
      <div class="tblwrap"><table class="tbl"><tbody>${bad.map((id) => `<tr class="click" data-id="${id}"><td>${esc(label(id))}</td><td class="defect">${esc(slot(id).defect || "износ сверх допуска")}</td><td class="r num">${slot(id).cond}%</td></tr>`).join("")}</tbody></table></div>
      <p class="note" style="margin:0">Каждый возврат снижает оплату наряда на 10%. Устраните дефекты и предъявите самолёт снова.</p>`, { narrow: true });
    body.querySelectorAll("tr.click").forEach((tr) => (tr.onclick = () => { closeModal(); selectPart(tr.dataset.id); if (hooks.mode() === "walk") hooks.mark(tr.dataset.id); else VW.focusOn(tr.dataset.id); }));
    return;
  }
  accept();
}
function accept() {
  const m = mission(), base = m.reward, lines = [["Оплата по наряду", base]];
  const conds = Object.keys(S.reported).map((id) => slot(id).cond), q = conds.reduce((a, b) => a + b, 0) / Math.max(1, conds.length);
  if (q >= 90) lines.push(["Премия за качество (ресурс узлов по наряду ≥ 90%)", Math.round(base * 0.1)]);
  else if (q < 65) lines.push(["Снижение за изношенные узлы (ресурс по наряду < 65%)", -Math.round(base * 0.05)]);
  if (S.hours <= S.norm) lines.push([`Премия за работу в норматив (${S.hours.toFixed(1)} из ${S.norm.toFixed(1)} ч)`, Math.round(base * 0.1)]);
  else if (S.hours > S.norm * 1.5) lines.push([`Удержание за превышение норматива (${S.hours.toFixed(1)} из ${S.norm.toFixed(1)} ч)`, -Math.round(base * 0.1)]);
  let found = 0;
  for (const [id, h] of Object.entries(S.hidden)) { const pr = PT[ST[id]].price;
    if (h.status === "found") { found++; lines.push([`Скрытый дефект найден вами: ${label(id)}`, Math.round(pr * 1.3)]); }
    else if (h.status === "otk") lines.push([`Скрытый дефект найден ОТК: ${label(id)}`, Math.round(pr * 0.8)]); }
  if (S.rework) lines.push([`Возвраты ОТК на доработку ×${Math.min(S.rework, 3)}`, -Math.round(base * 0.1 * Math.min(S.rework, 3))]);
  if (S.hot) lines.push(["Нарушение РЛЭ: выключение двигателя без охлаждения", -Math.round(base * 0.05)]);
  const total = Math.max(0, lines.reduce((a, [, v]) => a + v, 0));
  const xp = Math.max(10, (S.replay ? Math.floor(m.xp / 2) : m.xp) + 15 * found - 10 * S.rework);
  const oldR = rankIdx(), bortN = S.bort, hours = S.hours, norm = S.norm;
  P.money += total; P.stats.earned += total; P.xp += xp; P.completed[m.id] = (P.completed[m.id] || 0) + 1;
  S = null; selectPart(null); save();
  const newR = rankIdx(), fin = m.final && !P.finalDone; if (fin) P.finalDone = true; save();
  A.beep(880, 0.1, 0.06); setTimeout(() => A.beep(1320, 0.14, 0.06), 140); happy();
  modal(`Акт № ${rint(100, 999)}/558 приёмки из ремонта`, `<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center">
      <div class="stamp">558 АРЗ · ОТК<br>ПРИНЯТО<br><small style="font-size:11px">ГОДЕН К ПОЛЁТАМ</small></div>
      <dl class="kv" style="flex:1;min-width:220px"><dt>Изделие</dt><dd>МиГ-29БМ № ${bortN}</dd><dt>Наряд</dt><dd>${esc(m.title)}</dd><dt>Исполнитель</dt><dd>${esc(P.name)}</dd><dt>Трудоёмкость</dt><dd class="num">${hours.toFixed(1)} из ${norm.toFixed(1)} нормо-ч</dd></dl></div>
    <div class="tblwrap"><table class="tbl"><tbody>${lines.map(([t, v]) => `<tr><td>${esc(t)}</td><td class="r num" style="color:${v < 0 ? "var(--crit)" : "var(--ok)"};white-space:nowrap">${v < 0 ? "−" : "+"}${fmt(Math.abs(v))}</td></tr>`).join("")}
      <tr><td><b>Итого к зачислению</b></td><td class="r num"><b>${fmt(total)}</b></td></tr><tr><td>Опыт</td><td class="r num">+${xp}</td></tr></tbody></table></div>
    ${newR > oldR ? `<div class="toast star" style="animation:none;max-width:none"><b>Повышение в должности!</b> Приказом начальника завода вы назначены: «${esc(rankName())}». Скидка в снабжении ${Math.round(discount() * 100)}%, работы быстрее на ${Math.round((1 - speed()) * 100)}%, открыты новые наряды.</div>` : ""}
    ${fin ? `<div class="toast ok" style="animation:none;max-width:none"><b>3 июля, Минск.</b> Над площадью проходят истребители ВВС и войск ПВО. МиГ-29БМ № ${bortN}, который вы вернули в строй, идёт точно на своём месте. Начальник завода: «${esc(P.name)}, вы прошли путь от ученика слесаря-сборщика до главного инженера. Спасибо за службу!»</div>` : ""}
    ${P.inv.some((i) => i.removed) ? `<p class="note" style="margin:0">Снятые с самолёта детали лежат на складе — их можно сдать в ремфонд.</p>` : ""}`,
    { footer: `<button class="mini primary" id="aOk">Следующий наряд</button>`, onClose: () => { syncPlane(); afterChange(); } });
  $("aOk").onclick = () => { closeModal(); openBoard(); };
  syncPlane(); afterChange();
}

/* ═════════════════════════ ЛИЧНОЕ ДЕЛО, СПРАВКА ═════════════════════════ */
export function openProfile() {
  const r = rankIdx(), s = P.stats;
  const body = modal("Личное дело авиатехника", `<dl class="kv"><dt>Фамилия</dt><dd>${esc(P.name)}</dd><dt>Должность</dt><dd>${esc(rankName())}</dd><dt>Опыт</dt><dd class="num">${P.xp}${RANKS[r + 1] ? ` из ${RANKS[r + 1][1]}` : ""}</dd>
    <dt>Счёт</dt><dd class="num">${fmt(P.money)}</dd><dt>Преимущества</dt><dd>скидка в снабжении ${Math.round(discount() * 100)}%, работы быстрее на ${Math.round((1 - speed()) * 100)}%, шанс заметить скрытый дефект ${30 + 10 * r}%</dd></dl>
    <div class="tblwrap"><table class="tbl"><tbody>${RANKS.map(([n, x], i) => `<tr><td style="color:${i === r ? "var(--accent)" : i < r ? "var(--fg)" : "var(--muted)"}">${i === r ? "► " : ""}${esc(n)}</td><td class="r num sub">от ${x} опыта</td></tr>`).join("")}</tbody></table></div>
    <div class="order grid">${[["Выполнено нарядов", Object.values(P.completed).reduce((a, b) => a + b, 0)], ["Провалено", s.failures], ["Скрытых дефектов найдено", s.hidden], ["Гонок двигателей", s.runs], ["Настроек РЛС", s.radar], ["Возвратов ОТК", s.returns], ["Заработано", fmt(s.earned)], ["Потрачено на снабжение", fmt(s.spent)]].map(([a, b]) => `<div><span class="eyebrow">${a}</span><b class="num">${b}</b></div>`).join("")}</div>`,
    { footer: `${P.money < 3000 ? `<button class="mini" id="pOver">Сверхурочная смена (+500–900 руб.)</button>` : ""}<button class="mini" id="pMenu">Главное меню</button><button class="mini primary" id="pClose">Закрыть</button>` });
  body.parentElement.querySelector("#pClose").onclick = closeModal;
  body.parentElement.querySelector("#pMenu").onclick = () => { closeModal(); hooks.showMenu(); };
  const ov = body.parentElement.querySelector("#pOver");
  if (ov) ov.onclick = () => { const pay = rint(5, 9) * 100; P.money += pay; afterChange(); closeModal();
    toast(pick(["Помогли агрегатному цеху с переборкой колёс.", "Отработали смену на мойке и консервации авиатехники.", "Разбирали поступивший ЗИП на центральном складе.", "Дежурили в пожарном расчёте на газовочной площадке."]) + ` Начислено ${fmt(pay)}`, "ok", 5500); };
}
export function openHelp() {
  modal("Справка авиатехника", `<div class="order" style="display:flex;flex-direction:column;gap:14px">
  <div><h3 style="font-size:15px;margin-bottom:6px">Передвижение по цеху</h3><ul>
    <li>Щёлкните по экрану — мышь управляет взглядом. <b>W A S D</b> — ходьба, <b>Shift</b> — бег, <b>Ctrl</b> — присесть (под фюзеляж и мотогондолы), <b>Пробел</b> — прыжок.</li>
    <li><b>E</b> — действие с тем, на что смотрит прицел: осмотр детали, фонарь кабины, пульт ворот, доска нарядов, терминал снабжения, склад, тягач, КПА РЛС, окно ОТК, шкафчик.</li>
    <li><b>Q</b> — дополнительное действие (сесть в кабину, подняться по стремянке). <b>F</b> — фонарик. <b>T</b> — вид от первого/третьего лица. <b>C</b> — режим обзора камерой.</li>
    <li>Верх фюзеляжа (закабинный отсек, люк бака №3) доступен с площадки-стремянки у левого наплыва — поднимитесь и пройдите по наплыву. В кабину — по бортовой стремянке слева.</li>
    <li><b>Esc</b> или <b>Tab</b> — планшет с меню работ. Клавиши: N наряды, Z задание, I режим осмотра, V ведомость, M снабжение, B склад, G гонка, R РЛС, O сдать ОТК, H справка.</li></ul></div>
  <div><h3 style="font-size:15px;margin-bottom:6px">Порядок работы</h3><ul><li>Возьмите наряд у доски нарядов → осмотрите самолёт → проведите дефектовку узлов → закажите детали → снимите неисправные и установите исправные → гонка двигателей (тягач у ворот) и/или настройка РЛС (КПА у носа) → сдайте ОТК.</li>
    <li>Режим осмотра (I) делает обшивку прозрачной и подсвечивает узлы: зелёный — исправен, оранжевый — износ или подозрение, красный — неисправен, синий — не проверен.</li>
    <li>Многие узлы закрыты другими: ВЧ-блок и привод антенны — обтекателем, лопатки, НР-59А и маслоагрегаты — капотами, форсунки — створками сопла, тормоза и стойка — колесом. Снимайте снаружи внутрь, собирайте изнутри наружу.</li>
    <li>Скрытые дефекты не указаны в наряде. Найдёте сами — премия 130% цены детали, найдёт ОТК — 80% и возврат на доработку.</li></ul></div>
  <div><h3 style="font-size:15px;margin-bottom:6px">Снабжение</h3><ul><li>Новая деталь — ресурс 100%. Б/У с донора — около 45% цены, ресурс 55–82%, иногда скрытый брак (входной контроль на складе выявит его, деньги вернут).</li>
    <li>Ремкомплект чинит узел на месте, если его ресурс не ниже допустимого. Фильтры, уплотнения и пиросредства — только новые.</li></ul></div>
  <div><h3 style="font-size:15px;margin-bottom:6px">Гонка РД-33</h3><ul><li>МАЛЫЙ ГАЗ → НОМИНАЛ → МАКСИМАЛ → ФОРСАЖ, каждый режим выдержать ${HOLD} с.</li>
    <li>Пределы: Тг ${LIM.egtW}/${LIM.egtC} °C, вибрация ${LIM.vibW}/${LIM.vibC} мм/с, давление масла 2,6/2,0 (на МГ 2,0/1,4) кгс/см², гидросистема ${LIM.hydW}/${LIM.hydC} кгс/см².</li>
    <li>Красная зона дольше ${CRIT_T} с без снижения режима — пожар или разрушение двигателя. При помпаже сразу убирайте РУД. Два срыва розжига форсажа — остановитесь: третья попытка вызовет хлопок.</li></ul></div>
  <div><h3 style="font-size:15px;margin-bottom:6px">Настройка РЛС «Топаз»</h3><ul><li>Команды КПА: ПИТАНИЕ, ПРОГРЕВ, ВСК, ЭКВИВАЛЕНТ, ИЗЛУЧЕНИЕ. Излучать в цеху без эквивалента антенны нельзя.</li>
    <li>Литеры: сведите три отклонения в зелёную полосу и удержите 3 с. Юстировка: наведите метку в центр (±0,10°) и нажмите ЗАПИСЬ.</li></ul></div>
  <p class="note" style="margin:0">Названия агрегатов приблизительны, пределы параметров и нормы времени придуманы для игры.</p></div>`);
}

/* ═════════════════════════ ДЕЙСТВИЯ МЕНЮ ═════════════════════════ */
export function toolAct(a) {
  if (!P) return;
  const needS = ["order", "inspect", "sheet", "engine", "radar", "otk"];
  if (needS.includes(a) && !S) { toast("Сначала возьмите наряд.", "warn"); openBoard(); return; }
  if (a === "board") openBoard();
  else if (a === "order") openOrder(mission(), false);
  else if (a === "inspect") { VW.V.inspect = !VW.V.inspect; VW.setXray(VW.V.inspect); VW.paintAll(); updateHUD(); toast(VW.V.inspect ? "Режим осмотра: обшивка прозрачна, узлы подсвечены по состоянию." : "Режим осмотра выключен."); }
  else if (a === "sheet") openSheet();
  else if (a === "shop") openShop();
  else if (a === "stock") openStock();
  else if (a === "engine") engineMenu();
  else if (a === "radar") radarStart();
  else if (a === "otk") otk();
  else if (a === "profile") openProfile();
  else if (a === "help") openHelp();
}
export function startNew(name) { newPlayer(name); save(); }
/* подсказка мастера: что делать дальше по наряду */
export function hintState() {
  if (!S) return null;
  const unknown = Object.keys(S.reported).filter((id) => slot(id).on && slot(id).known < 2);
  if (unknown.length) return `Начни с дефектовки: ${label(unknown[0])} — заявлено в наряде.`;
  const broken = SID.filter((id) => slot(id).on && slot(id).known === 2 && (slot(id).defect || slot(id).cond < OTK_MIN));
  if (broken.length) return `${label(broken[0])} неисправен — меняй или ремонтируй. Детали — в терминале снабжения.`;
  const off = SID.filter((id) => !slot(id).on);
  if (off.length) return `Не забудь поставить на место: ${label(off[0])}.`;
  const np = requiredTests().filter((t) => !S.tests[t]);
  if (np.length) return `Осталось: ${TEST_NAME[np[0]]}. ${np[0] === "radar" ? "КПА стоит у носа." : "Тягач у ворот."}`;
  return "Всё готово — неси в ОТК, окно в дальнем углу цеха.";
}
export { label, ST, PT, SID };
