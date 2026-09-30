/* 558 АРЗ — ремонт МиГ-29БМ. Точка входа: загрузка, режимы, ввод, взаимодействие, игровой цикл. */
import * as THREE from "three";
import * as VW from "./view/view.js";
import { QUALITY } from "./view/render.js";
import { Collider } from "./world/physics.js";
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from "three-mesh-bvh";
import { Player } from "./world/player.js";
import * as G from "./game/game.js";
import * as A from "./audio.js";
import { label, PT, ST } from "./game/data.js";
import { $, clamp, esc } from "./util.js";

const V = VW.V;
// ускоренный рейкаст (BVH) для прицела и выбора деталей
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const isTouch = matchMedia("(pointer:coarse)").matches || "ontouchstart" in window;
const canvas = $("view");
if (isTouch) document.body.classList.add("is-touch");

/* ═════════════ настройки ═════════════ */
const SET_KEY = "arz558-settings-v2";
const settings = Object.assign({ quality: null, sens: 1, fov: 72, invertY: false, volume: 0.8, fps: false, third: false }, (() => { try { return JSON.parse(localStorage.getItem(SET_KEY) || "{}"); } catch (e) { return {}; } })());
function saveSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) { /* нет хранилища */ } }

/* ═════════════ состояние режима ═════════════ */
let mode = "menu";            // menu | walk | orbit | engine | radar | seat
let prevMode = "walk";
let player = null, cols = [], ladders = [];
let target = null;            // объект под прицелом
let markerId = null, markerT = 0;
let working = null;           // текущая работа с таймером
let flash = false, engineView = "outside";
const keys = new Set();
let look = { dx: 0, dy: 0 };
const stick = { x: 0, y: 0, id: null };
let crouchToggle = false, jumpReq = false;
let locked = false;
let lastT = 0, fpsAcc = 0, fpsN = 0;

/* ═════════════ загрузка ═════════════ */
async function boot(hotData) {
  const setP = (k, t) => { $("loadBar").style.width = Math.round(k * 100) + "%"; $("loadingT").textContent = t; };
  try {
    const probe = new THREE.WebGLRenderer({ canvas: document.createElement("canvas") });
    probe.dispose();
  } catch (e) { $("loadingT").textContent = "Не удалось запустить 3D-графику (WebGL2): " + e.message; return; }
  if (document.fonts && document.fonts.ready) { try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* шрифты не критичны */ } }
  let q = settings.quality;
  if (!q || !QUALITY[q]) { const tmp = new (await import("./view/render.js")).Render(document.createElement("canvas")); q = tmp.detectDefault(); tmp.renderer.dispose(); settings.quality = q; }
  await VW.initView(canvas, q, setP);
  V.status = (id) => G.viewStatus(id);
  for (const m of V.pickables) if (m.geometry && !m.geometry.boundsTree && m.geometry.attributes.position.count > 300) m.geometry.computeBoundsTree();
  V.camera.fov = settings.fov; V.camera.updateProjectionMatrix();
  // физика
  cols = [new Collider(V.W.colliders), new Collider(V.M.colliders, V.M.group)];
  ladders = V.W.ladders.map((L) => ({ ...L, bottom: L.bottom.clone(), top: L.top.clone() }));
  player = new Player(cols);
  player.sens = settings.sens; player.invertY = settings.invertY; player.third = settings.third;
  player.onStep = (surf, sp) => A.footstep(surf, sp);
  player.teleport(new THREE.Vector3(9.5, 0.05, -9.5), 2.35);
  // игровые связи
  Object.assign(G.hooks, {
    mode: () => (mode === "seat" ? "walk" : mode === "walk" ? "walk" : "orbit"),
    inReach, mark: setMarker, cardOpened, work: doWork, enterEngine, exitEngine, enterRadar, exitRadar, afterMenu, showMenu,
  });
  A.setVolume(settings.volume);
  $("loading").hidden = true;
  const sv = hotData && hotData.P ? hotData : G.loadSave();
  if (sv) { G.applySave(sv); $("bCont").hidden = false; $("pName").value = G.P.name; }
  $("bNew").disabled = false;
  $("bNew").onclick = async () => {
    A.audioUnlock();
    if (G.P && (G.P.xp > 0 || G.S) && !(await confirmNew())) return;
    G.startNew(($("pName").value.trim() || "Новик").slice(0, 24)); enterGame(); G.openBoard();
  };
  $("bCont").onclick = () => { A.audioUnlock(); if (G.P) enterGame(); };
  $("bMenuSettings").onclick = openSettings; $("bSettings").onclick = openSettings;
  $("bMode").onclick = () => toggleOrbit();
  G.syncPlane();
  showMenu();
  requestAnimationFrame(loop);
  window.__game = { V, G, player: () => player, setMode, mode: () => mode, THREE, VW };   // для отладки
  window.ready = true;
}
function confirmNew() {
  return new Promise((res) => {
    G.modal("Подтверждение", `<p style="margin:0;line-height:1.5">Начать новую игру? Текущий прогресс будет удалён.</p>`, { narrow: true, footer: `<button class="mini" id="cNo">Отмена</button><button class="mini" id="cYes">Начать заново</button>`, onClose: () => res(false) });
    $("cNo").onclick = () => { G.closeModal(); res(false); }; $("cYes").onclick = () => { $("modalRoot").innerHTML = ""; res(true); };
  });
}

/* ═════════════ режимы ═════════════ */
function setMode(m) {
  prevMode = mode === "menu" || mode === "engine" || mode === "radar" ? prevMode : mode;
  mode = m;
  const walkish = m === "walk" || m === "seat";
  $("xhair").hidden = !walkish;
  $("cams").hidden = $("hint").hidden = m !== "orbit";
  $("touch").hidden = !(isTouch && m === "walk");
  $("bMode").textContent = m === "orbit" ? "Идти пешком" : "Обзор";
  V.tech.root.visible = m === "walk" && player.third;
  if (!walkish && document.pointerLockElement) document.exitPointerLock();
  if (m !== "walk" && m !== "seat") { $("prompt").hidden = true; setHoverTarget(null); }
  updateRail(); updateKeys();
}
function updateRail() {
  const menuOpen = mode === "menu" || mode === "engine" || mode === "radar";
  const cardUp = !$("card").hidden || !!working;
  const show = !menuOpen && (mode === "orbit" || ((!locked || isTouch) && !cardUp));
  $("rail").hidden = !show || (isTouch && mode === "walk" && !railTouch);
  $("resume").hidden = !(mode === "walk" || mode === "seat") || locked || isTouch || lockFailed || G.modalOpen() || !$("card").hidden || !!working;
  $("keys").hidden = !(mode === "walk" || mode === "seat") || isTouch || !locked;
}
let railTouch = false, railKey = "", lastNear = null;
function updateKeys() {
  if (mode === "seat") $("keys").innerHTML = `<kbd>E</kbd> бортовое питание · <kbd>Q</kbd> выйти из кабины · мышь — осмотреться`;
  else $("keys").innerHTML = `<kbd>W A S D</kbd> идти · <kbd>Shift</kbd> бег · <kbd>Ctrl</kbd> присесть · <kbd>E</kbd> действие · <kbd>Q</kbd> доп. действие · <kbd>F</kbd> фонарь · <kbd>T</kbd> вид ${player && player.third ? "1-го" : "3-го"} лица · <kbd>C</kbd> обзор · <kbd>Tab</kbd> планшет`;
}
function enterGame() {
  $("menu").hidden = true; G.syncPlane(); G.uiMode("hangar"); G.updateHUD();
  A.ambienceStart();
  setMode(isTouch ? "walk" : "walk");
  if (!G.S) { G.toast(`Добро пожаловать в цех, ${G.P.name}. Подойдите к доске нарядов у стены или ${isTouch ? "откройте «Планшет»" : "нажмите N"}.`, "ok", 6000); setMarkerPoint(new THREE.Vector3(-2.5, 1.9, -21.4), "Доска нарядов"); }
  else G.toast(`Продолжаем наряд: ${G.mission().title}.`, "ok");
  if (!isTouch) G.toast("Щёлкните по экрану, чтобы управлять взглядом. Справка — H.", "", 6000);
}
export function showMenu() {
  G.save(); G.closeModal(); G.selectPart(null); V.inspect = false; VW.setXray(false); VW.paintAll();
  G.uiMode("menu"); $("hud").hidden = true; $("menu").hidden = false; setMode("menu");
  VW.camTo("menu"); VW.orbit.auto = true;
  $("bCont").hidden = !G.P;
}
function toggleOrbit() {
  if (mode === "walk" || mode === "seat") {
    if (mode === "seat") exitSeat();
    setMode("orbit"); VW.orbit.goal = null;
    // камера обзора стартует от текущей точки взгляда
    const c = V.camera.position, t = VW.orbit.t.set(0, 1.6, 0), d = c.clone().sub(t);
    VW.orbit.r = clamp(d.length(), 4, 30); VW.orbit.th = Math.atan2(d.z, d.x); VW.orbit.ph = clamp(Math.acos(d.y / d.length()), 0.1, 1.5); VW.orbit.auto = false;
    VW.camTo("all");
  } else if (mode === "orbit") { setMode("walk"); }
}
function afterMenu(m) { if (m === "hangar") updateRail(); }

/* ═════════════ указатель мыши ═════════════ */
document.addEventListener("pointerlockchange", () => {
  locked = document.pointerLockElement === canvas;
  if (locked) { G.closeModal(); if (!working) { /* карточка остаётся, пока игрок рядом */ } }
  updateRail();
});
let lockFailed = false;
function requestLock() {
  if ((mode === "walk" || mode === "seat") && !isTouch && !document.pointerLockElement && !lockFailed) {
    const fail = () => { if (!lockFailed) { lockFailed = true; G.toast("Захват мыши недоступен — осматривайтесь, перетаскивая мышь с зажатой кнопкой.", "", 6000); } };
    try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(fail); } catch (e) { fail(); }
  }
}
document.addEventListener("pointerlockerror", () => { if (!lockFailed) { lockFailed = true; G.toast("Захват мыши недоступен — осматривайтесь, перетаскивая мышь с зажатой кнопкой.", "", 6000); } });
function cardOpened() { if (document.pointerLockElement) document.exitPointerLock(); updateRail(); }

/* ═════════════ клавиатура ═════════════ */
addEventListener("keydown", (e) => {
  const tag = e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  A.audioUnlock();
  if (G.engineActive) {
    if (e.code === "KeyW" || e.code === "ArrowUp") { e.preventDefault(); G.rudUp(); }
    else if (e.code === "KeyS" || e.code === "ArrowDown") { e.preventDefault(); G.rudDown(); }
    else if (e.code === "Space") { e.preventDefault(); G.engineStop(); }
    else if (e.code === "KeyC") toggleEngineView();
    return;
  }
  if (G.RD && G.RD.stage === 3) { const m = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.code]; if (m) { e.preventDefault(); G.boreMove(...m); } return; }
  if (e.code === "Escape") {
    if (working) { working.cancel = true; return; }
    if (G.modalOpen()) G.closeModal(); else if (G.selected) G.selectPart(null);
    updateRail(); return;
  }
  if (!$("menu").hidden || G.RD) return;
  if (G.modalOpen()) return;
  const walkish = mode === "walk" || mode === "seat";
  if (walkish) {
    keys.add(e.code);
    if (e.code === "Tab") { e.preventDefault(); if (document.pointerLockElement) document.exitPointerLock(); else requestLock(); return; }
    if (e.code === "KeyE") { e.preventDefault(); primaryAction(); return; }
    if (e.code === "KeyQ") { secondaryAction(); return; }
    if (e.code === "KeyF") { flash = !flash; A.beep(2200, 0.02, 0.04); return; }
    if (e.code === "KeyT" && mode === "walk") { player.third = !player.third; settings.third = player.third; saveSettings(); V.tech.root.visible = player.third; updateKeys(); return; }
    if (e.code === "Space") { e.preventDefault(); jumpReq = true; }
    if (e.code === "ControlLeft" || e.code === "ControlRight" || e.code === "KeyX") e.preventDefault();
  }
  if (e.code === "KeyC" && (mode === "walk" || mode === "orbit" || mode === "seat")) { toggleOrbit(); return; }
  const map = { KeyN: "board", KeyZ: "order", KeyI: "inspect", KeyV: "sheet", KeyM: "shop", KeyB: "stock", KeyG: "engine", KeyR: "radar", KeyO: "otk", KeyH: "help" };
  const a = map[e.code]; if (a) { e.preventDefault(); G.toolAct(a); }
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());

/* ═════════════ мышь: взгляд (ходьба) и облёт (обзор) ═════════════ */
const ptr = { down: false, x: 0, y: 0, moved: 0, btn: 0, touches: new Map(), pinch: 0 };
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("mousemove", (e) => { if (locked) { look.dx += e.movementX; look.dy += e.movementY; } });
/* взгляд перетаскиванием: запасной вариант, если захват мыши недоступен (встроенные фреймы, политика браузера) */
const drag = { on: false, x: 0, y: 0, moved: 0, id: null };
canvas.addEventListener("pointerdown", (e) => {
  A.audioUnlock();
  if (mode === "walk" || mode === "seat") {
    if (e.pointerType === "touch") { canvas.setPointerCapture(e.pointerId); ptr.touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); return; }
    if (!locked && !G.modalOpen()) { drag.on = true; drag.x = e.clientX; drag.y = e.clientY; drag.moved = 0; drag.id = e.pointerId; canvas.setPointerCapture(e.pointerId); }
    return;
  }
  if (mode !== "orbit" && mode !== "engine" && mode !== "radar" && mode !== "menu") return;
  canvas.setPointerCapture(e.pointerId); ptr.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  ptr.down = true; ptr.x = e.clientX; ptr.y = e.clientY; ptr.moved = 0; ptr.btn = e.button === 2 || e.shiftKey ? 2 : 0;
  if (ptr.touches.size === 2) { const [a, b] = [...ptr.touches.values()]; ptr.pinch = Math.hypot(a.x - b.x, a.y - b.y); }
});
canvas.addEventListener("pointermove", (e) => {
  if ((mode === "walk" || mode === "seat") && drag.on && e.pointerId === drag.id) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 3) { look.dx += dx * 1.4; look.dy += dy * 1.4; }
    return;
  }
  if (mode === "walk" || mode === "seat") {
    if (e.pointerType === "touch" && ptr.touches.has(e.pointerId)) { const p = ptr.touches.get(e.pointerId); look.dx += (e.clientX - p.x) * 1.6; look.dy += (e.clientY - p.y) * 1.6; ptr.touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); }
    return;
  }
  if (ptr.touches.has(e.pointerId)) ptr.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptr.down) {
    const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y; ptr.x = e.clientX; ptr.y = e.clientY; ptr.moved += Math.abs(dx) + Math.abs(dy);
    const o = VW.orbit;
    if (ptr.moved > 4) { o.auto = false; o.goal = null; }
    if (ptr.touches.size === 2) { const [a, b] = [...ptr.touches.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (ptr.pinch) o.r = clamp((o.r * ptr.pinch) / d, 2.5, 45); ptr.pinch = d; return; }
    if (ptr.btn === 2) { const right = new THREE.Vector3().subVectors(V.camera.position, o.t).cross(V.camera.up).normalize();
      o.t.addScaledVector(right, dx * o.r * 0.0016); o.t.y = clamp(o.t.y + dy * o.r * 0.0016, 0, 8); }
    else { o.th += dx * 0.006; o.ph = clamp(o.ph - dy * 0.006, 0.06, 1.55); }
    hideTip();
  } else if (e.pointerType === "mouse" && mode === "orbit") onHover(e);
});
const pUp = (e) => {
  if (drag.on && e.pointerId === drag.id) { drag.on = false; if (drag.moved < 6 && (mode === "walk" || mode === "seat")) requestLock(); return; }
  ptr.touches.delete(e.pointerId);
  if (ptr.touches.size < 2) ptr.pinch = 0;
  if (mode === "walk" || mode === "seat") return;
  if (!ptr.down) return;
  if (ptr.touches.size === 0) ptr.down = false;
  if (mode === "orbit" && ptr.moved < 6 && e.button !== 2 && G.S) {
    const hit = pickAt(e);
    if (hit && hit.slot) G.selectPart(hit.slot);
    else if (hit && hit.interact === "canopy") { toggleCanopy(); }
    else G.selectPart(null);
  }
};
canvas.addEventListener("pointerup", pUp); canvas.addEventListener("pointercancel", pUp);
canvas.addEventListener("dblclick", (e) => { if (mode !== "orbit") return; const h = pickAt(e); if (h && h.slot) VW.focusOn(h.slot); });
canvas.addEventListener("wheel", (e) => { if (mode !== "orbit" && mode !== "engine" && mode !== "radar") return; e.preventDefault(); const o = VW.orbit; o.auto = false; o.goal = null; o.r = clamp(o.r * Math.pow(1.0015, e.deltaY), 2.5, 45); }, { passive: false });
canvas.addEventListener("pointerleave", () => { if (mode === "orbit") { VW.setHover(null); hideTip(); } });
document.querySelectorAll(".rail .tool").forEach((b) => (b.onclick = () => { A.audioUnlock(); G.toolAct(b.dataset.act); }));
document.querySelectorAll("#cams [data-cam]").forEach((b) => (b.onclick = () => VW.camTo(b.dataset.cam)));

const raycaster = new THREE.Raycaster();
function visibleChain(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }
function hitInfo(o) { let x = o; while (x) { if (x.userData.slot) return { slot: x.userData.slot }; if (x.userData.interact) return { interact: x.userData.interact }; x = x.parent; } return { air: true }; }
function pickAt(e) {
  const r = canvas.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), V.camera);
  const hits = raycaster.intersectObjects(V.pickables.filter(visibleChain), false);
  for (const h of hits) { const i = hitInfo(h.object); if (V.inspect && i.air) continue; if (i.air) return null; return i; }
  return null;
}
const tipEl = $("tip");
function hideTip() { tipEl.hidden = true; }
function onHover(e) {
  if (!G.S) { hideTip(); return; }
  const h = pickAt(e), id = h && h.slot;
  VW.setHover(id || null);
  if (id) { const st = G.slotStatus(id);
    tipEl.innerHTML = `${esc(label(id))}<small>${esc(st.text)}${st.cond != null ? ` · ${st.cond}%` : ""}</small>`;
    tipEl.style.left = Math.min(e.clientX + 14, innerWidth - 290) + "px"; tipEl.style.top = e.clientY + 14 + "px"; tipEl.hidden = false; canvas.style.cursor = "pointer"; }
  else { hideTip(); canvas.style.cursor = h && h.interact ? "pointer" : "grab"; }
}

/* ═════════════ сенсорное управление ═════════════ */
{
  const st = $("stick"), knob = $("stickKnob");
  const upd = (e) => { const r = st.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2); const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } stick.x = dx; stick.y = dy; knob.style.transform = `translate(${dx * 38}px,${dy * 38}px)`; };
  st.addEventListener("pointerdown", (e) => { e.stopPropagation(); st.setPointerCapture(e.pointerId); stick.id = e.pointerId; upd(e); });
  st.addEventListener("pointermove", (e) => { if (e.pointerId === stick.id) upd(e); });
  const end = (e) => { if (e.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; knob.style.transform = ""; };
  st.addEventListener("pointerup", end); st.addEventListener("pointercancel", end);
  $("tUse").onclick = () => primaryAction();
  $("tCrouch").onclick = () => { crouchToggle = !crouchToggle; $("tCrouch").classList.toggle("on", crouchToggle); };
  $("tLight").onclick = () => { flash = !flash; $("tLight").classList.toggle("on", flash); };
  $("tMenu").onclick = () => { railTouch = !railTouch; updateRail(); };
}

/* ═════════════ взаимодействие ═════════════ */
const REACH = 2.6, SPOT_REACH = 3.3;
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _hitP = new THREE.Vector3();
function aimTarget() {
  V.camera.getWorldPosition(_o); V.camera.getWorldDirection(_d);
  raycaster.set(_o, _d); raycaster.far = 6; raycaster.firstHitOnly = true;
  let best = null;
  const hits = raycaster.intersectObjects(V.pickables.filter(visibleChain), false);
  for (const h of hits) {
    const i = hitInfo(h.object);
    if (V.inspect && i.air) continue;
    if (i.air) { best = { kind: "block", dist: h.distance }; break; }
    if (i.slot) { best = { kind: "part", id: i.slot, dist: h.distance, point: h.point }; break; }
    if (i.interact) { best = { kind: "canopy", dist: h.distance, point: h.point }; break; }
  }
  for (const s of V.W.spots) {
    const p = raycaster.ray.intersectBox(s.box, _hitP);
    if (p) { const d = p.distanceTo(_o); if (d < SPOT_REACH && (!best || d < best.dist)) best = { kind: "spot", spot: s, dist: d }; }
  }
  if (best && best.kind === "part" && best.dist > REACH) best.far = true;
  if (best && best.kind === "canopy" && best.dist > REACH + 0.6) best = null;
  return best && best.kind !== "block" ? best : null;
}
function setHoverTarget(t) { target = t; VW.setHover(t && t.kind === "part" && !t.far ? t.id : null); }
function promptFor(t) {
  const P = $("prompt");
  if (!t || working) { P.hidden = true; $("xhair").classList.remove("on"); return; }
  let main = "", sub = "", cls = "";
  if (t.kind === "part") {
    if (!G.S) { main = `${label(t.id)}`; sub = "Возьмите наряд, чтобы работать с самолётом"; }
    else { const st = G.slotStatus(t.id); main = `<kbd>E</kbd> ${esc(label(t.id))}`; sub = st.text + (st.cond != null ? ` · ${st.cond}%` : ""); cls = st.cls;
      if (t.far) { main = esc(label(t.id)); sub = "подойдите ближе"; cls = ""; } }
  } else if (t.kind === "canopy") {
    main = `<kbd>E</kbd> ${V.canopyTarget ? "Закрыть" : "Открыть"} фонарь кабины`;
    if (V.canopyTarget && nearCockpit()) sub = "Q — сесть в кабину";
  } else if (t.kind === "spot") {
    main = `<kbd>E</kbd> ${esc(t.spot.label)}`;
    if (t.spot.key === "door") main = `<kbd>E</kbd> ${V.doorTarget ? "Закрыть" : "Открыть"} ворота ангара`;
    if (t.spot.key === "cockpitLadder") { main = `<kbd>Q</kbd> Подняться по стремянке`; sub = V.canopyTarget ? "" : "фонарь кабины закрыт"; }
  }
  P.innerHTML = `<div class="p-main">${main}</div>${sub ? `<div class="p-sub ${cls}">${esc(sub)}</div>` : ""}`;
  P.hidden = false; $("xhair").classList.add("on");
}
function nearCockpit() { const p = V.M.group.localToWorld(new THREE.Vector3(3.3, 2.7, 0)); return player.eye.distanceTo(p) < 2.2; }
function primaryAction() {
  if (mode === "seat") { togglePower(); return; }
  if (mode !== "walk" || working) return;
  if (G.selected && !$("card").hidden && !target) { G.selectPart(null); requestLock(); return; }
  const t = target;
  if (!t) { if (G.selected) { G.selectPart(null); requestLock(); } return; }
  if (t.kind === "part") {
    if (!G.S) { G.toast("Сначала возьмите наряд у доски нарядов (N).", "warn"); return; }
    if (t.far) { G.toast("Слишком далеко — подойдите ближе.", ""); return; }
    if (G.selected === t.id && !$("card").hidden) { G.selectPart(null); requestLock(); return; }
    G.selectPart(t.id); A.beep(1500, 0.02, 0.03);
  } else if (t.kind === "canopy") toggleCanopy();
  else if (t.kind === "spot") useSpot(t.spot);
}
function secondaryAction() {
  if (mode === "seat") { exitSeat(); return; }
  if (mode !== "walk" || working) return;
  if (player.mode === "ladder") return;
  if (target && target.kind === "spot" && target.spot.key === "cockpitLadder") { player.tryLadder(ladders, true); return; }
  if (V.canopyTarget && nearCockpit()) { enterSeat(); return; }
  if (player.tryLadder(ladders)) return;
}
function useSpot(s) {
  const k = s.key;
  if (k === "board") G.openBoard();
  else if (k === "shop") G.openShop();
  else if (k === "stock") G.openStock();
  else if (k === "otk") { if (!G.S) G.toast("Нет самолёта для предъявления: возьмите наряд.", "warn"); else G.otk(); }
  else if (k === "profile") G.openProfile();
  else if (k === "help") G.openHelp();
  else if (k === "tractor") G.toolAct("engine");
  else if (k === "kpa") G.toolAct("radar");
  else if (k === "door") { VW.setDoor(!V.doorTarget); A.motor(6, 0.08, 70); setTimeout(() => VW.recaptureHangarEnv(), 6500); }
  else if (k === "cockpitLadder") player.tryLadder(ladders, true);
  else if (k === "npc") talk(s.npc);
}
/* реплики работников цеха — подсказки по текущему наряду */
function talk(name) {
  const S = G.S, pick = (a) => a[Math.floor(Math.random() * a.length)];
  let line;
  if (name.startsWith("Мастер")) {
    if (!S) line = "Наряды на доске у стены. Начни с тормозов — работа простая, а научит многому.";
    else {
      const st = G.hintState();
      line = st || pick(["Сначала дефектовка, потом заказ деталей — иначе выкинешь деньги.", "Скрытые дефекты ОТК всё равно найдёт. Лучше найди сам — премия больше.", "Снимаешь снаружи внутрь, ставишь изнутри наружу. Не перепутай."]);
    }
  } else if (name.startsWith("Контролёр")) line = S ? pick(["Без протоколов испытаний самолёт не приму.", "Формуляры, пломбы, ресурс узлов — всё проверю. Ниже 50 % не пропущу.", "Предъявлять — через окно ОТК, когда всё соберёте."]) : "Самолёта на приёмке нет. Возьмите наряд.";
  else if (name.startsWith("Слесарь")) line = pick(["Этот борт после птицы — обтекатель меняем. Не мешай, тут ВЧ-блок открыт.", "Ключ на 22 не видел? Опять кто-то с тележки унёс.", "На газовку без заглушек не выкатывай — пожарные ругаются."]);
  else line = pick(["Колесо КТ-150 тяжёлое, под сорок кило. Спину береги.", "Азот в амортстойке проверю — и можно опускать с подъёмников.", "Под мотогондолой только на корточках, там не выпрямишься."]);
  G.toast(`${name}: «${line}»`, "", 6500);
  A.beep(700, 0.03, 0.02);
}
function toggleCanopy() { VW.setCanopy(!V.canopyTarget); A.motor(2.2, 0.06, 160); }
function inReach(id) {
  if (mode !== "walk" && mode !== "seat") return true;
  const b = VW.partBox(id); return b.distanceToPoint(player.eye) <= REACH + 0.2;
}

/* ---------- кабина ---------- */
function enterSeat() {
  player.mode = "seat"; player.seatAt = (out) => out.copy(V.M.group.localToWorld(V.M.anchors.pilotEye.clone()));
  player.yaw = -Math.PI / 2 + V.M.group.rotation.y; player.pitch = -0.15;
  setMode("seat"); VW.setCanopy(false); A.motor(2.2, 0.06, 160);
  G.toast("Вы в кабине. E — бортовое питание (нужна исправная аккумуляторная батарея), Q — выйти.", "", 6000);
}
function exitSeat() {
  VW.setCanopy(true); A.motor(2.2, 0.06, 160);
  player.mode = "walk"; player.teleport(V.M.group.localToWorld(new THREE.Vector3(3.3, 2.45, -0.95)), player.yaw);
  setMode("walk");
}
function togglePower() {
  if (!V.power) {
    if (G.S && G.effCond("battery") < 50) { A.beep(300, 0.2, 0.05); G.toast("Питание не включается: батарея разряжена или неисправна. Проверьте аккумуляторную батарею.", "warn", 6000); return; }
    VW.setPower(true); A.beep(1000, 0.08, 0.05); setTimeout(() => A.beep(1500, 0.08, 0.04), 120); G.toast("Бортовое питание включено: табло, АНО и маячки работают.", "ok");
  } else { VW.setPower(false); A.beep(600, 0.08, 0.04); G.toast("Бортовое питание выключено."); }
}

/* ---------- метка-ориентир ---------- */
function setMarker(id) { markerId = id; markerT = 25; if (document.pointerLockElement) {} G.toast(`Узел «${label(id)}» отмечен ромбом.`, "", 3000); }
let markerPoint = null, markerName = "";
function setMarkerPoint(p, name) { markerPoint = p; markerName = name; markerT = 30; markerId = null; }
const _mp = new THREE.Vector3();
function updateMarker(dt) {
  const el = $("marker");
  if (markerT <= 0 || (!markerId && !markerPoint) || (mode !== "walk" && mode !== "orbit" && mode !== "seat")) { el.hidden = true; V.marker.visible = false; return; }
  markerT -= dt;
  const p = markerId ? VW.partCenter(markerId, _mp) : _mp.copy(markerPoint);
  if (!p) { el.hidden = true; return; }
  const d = player && (mode === "walk" || mode === "seat") ? p.distanceTo(player.eye) : V.camera.position.distanceTo(p);
  if (d < 1.6 && mode === "walk") { markerT = 0; }
  V.marker.visible = true; V.marker.position.copy(p).y += 0.25 + Math.sin(performance.now() / 300) * 0.04; V.marker.rotation.y += dt * 2;
  const s = p.clone().project(V.camera);
  if (s.z > 1) { el.hidden = true; return; }
  el.hidden = false; el.style.left = clamp((s.x * 0.5 + 0.5) * innerWidth, 20, innerWidth - 20) + "px"; el.style.top = clamp((-s.y * 0.5 + 0.5) * innerHeight - 10, 40, innerHeight - 20) + "px";
  $("markerD").textContent = `${markerId ? label(markerId) : markerName} · ${d.toFixed(1)} м`;
}

/* ---------- работа с таймером ---------- */
function doWork(title, kind, hours) {
  return new Promise((res) => {
    const dur = window.__fastWork ? 0.05 : kind === "visual" ? 0.9 : clamp(0.8 + hours * 0.85, 1.0, 4.2);
    working = { t: 0, dur, res, kind, cancel: false };
    $("workT").textContent = title; $("workS").textContent = `${hours.toFixed(1)} нормо-ч · Esc — прервать`;
    $("work").hidden = false; $("workBar").style.width = "0";
    working.cardWas = !$("card").hidden; $("card").hidden = true;
    if (player && (mode === "walk" || mode === "seat")) player.mode = "frozen";
    A.toolWork(kind, dur);
    updateRail();
  });
}
function stepWork(dt) {
  if (!working) return;
  const w = working; w.t += dt;
  $("workBar").style.width = Math.min(100, (w.t / w.dur) * 100) + "%";
  if (w.kind !== "visual" && w.kind !== "inspect" && Math.random() < dt * 1.2) A.ratchet(0.06, 3);
  if (w.cancel || w.t >= w.dur) {
    working = null; $("work").hidden = true;
    if (player && player.mode === "frozen") player.mode = "walk";
    w.res(!w.cancel);
    if (w.cardWas && G.selected) G.renderCard();
    updateRail();
  }
}

/* ---------- гонка двигателей и РЛС: переходы камеры ---------- */
function fade(to, ms = 500) {
  return new Promise((res) => {
    const g = V.R.grade; if (!g) { res(); return; }
    const from = g.uniforms.uFade.value, t0 = performance.now();
    const step = () => { const k = Math.min(1, (performance.now() - t0) / ms); g.uniforms.uFade.value = from + (to - from) * k; if (k < 1) requestAnimationFrame(step); else res(); };
    step();
  });
}
async function enterEngine(side) {
  await fade(1, 450);
  if (mode === "seat") { player.mode = "walk"; }
  setMode("engine"); G.uiMode("engine"); VW.setCanopy(false); V.canopy = 0; V.M.canopy.rotation.z = 0;
  VW.setWorld("pad"); engineView = "outside"; $("engView").textContent = "Вид: снаружи";
  VW.camTo(side === "L" ? "engineRunL" : "engineRunR"); const g = VW.orbit.goal; VW.orbit.t.copy(g.t); VW.orbit.r = g.r; VW.orbit.th = g.th; VW.orbit.ph = g.ph; VW.orbit.goal = null; VW.orbit.auto = true;
  flash = false;
  await fade(0, 600);
}
async function exitEngine() {
  await fade(1, 450);
  VW.setWorld("hangar"); VW.engineFx(null, 0);
  G.uiMode("hangar");
  setMode(prevMode === "orbit" ? "orbit" : "walk");
  if (mode === "walk") player.teleport(new THREE.Vector3(9.5, 0.05, -6.5), 2.2);
  VW.camTo("all");
  await fade(0, 600);
}
function toggleEngineView() {
  engineView = engineView === "outside" ? "cockpit" : "outside";
  $("engView").textContent = engineView === "outside" ? "Вид: снаружи" : "Вид: из кабины";
}
$("engView").onclick = () => toggleEngineView();
function enterRadar() { setMode("radar"); VW.camTo("nose"); }
function exitRadar() { setMode(prevMode === "orbit" ? "orbit" : "walk"); }

/* ═════════════ настройки ═════════════ */
function openSettings() {
  const qOpts = Object.entries(QUALITY).map(([k, v]) => `<button data-q="${k}" class="${settings.quality === k ? "on" : ""}">${v.name}</button>`).join("");
  const body = G.modal("Настройки", `<div class="set">
    <label>Качество графики</label><div class="seg" id="sQ">${qOpts}</div>
    <label for="sSens">Чувствительность мыши</label><input type="range" id="sSens" min="0.2" max="3" step="0.05" value="${settings.sens}">
    <label for="sFov">Угол обзора</label><input type="range" id="sFov" min="55" max="95" step="1" value="${settings.fov}">
    <label for="sVol">Громкость</label><input type="range" id="sVol" min="0" max="1" step="0.02" value="${settings.volume}">
    <label for="sInv">Инверсия по вертикали</label><input type="checkbox" id="sInv" ${settings.invertY ? "checked" : ""}>
    <label for="sFps">Показывать FPS</label><input type="checkbox" id="sFps" ${settings.fps ? "checked" : ""}>
  </div><p class="note" style="margin:0">«Высокое» и «Ультра» включают затенение GTAO, отражения стекла фонаря, пылинки в лучах и второй самолёт в дальнем пролёте. Разрешение процедурных текстур меняется после перезагрузки страницы.</p>`, { narrow: true });
  body.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => { settings.quality = b.dataset.q; settings.qualityManual = true; saveSettings(); applyQuality(); openSettings(); }));
  $("sSens").oninput = (e) => { settings.sens = +e.target.value; if (player) player.sens = settings.sens; saveSettings(); };
  $("sFov").oninput = (e) => { settings.fov = +e.target.value; V.camera.fov = settings.fov; V.camera.updateProjectionMatrix(); saveSettings(); };
  $("sVol").oninput = (e) => { settings.volume = +e.target.value; A.setVolume(settings.volume); saveSettings(); };
  $("sInv").onchange = (e) => { settings.invertY = e.target.checked; if (player) player.invertY = settings.invertY; saveSettings(); };
  $("sFps").onchange = (e) => { settings.fps = e.target.checked; $("fps").hidden = !settings.fps; saveSettings(); };
}
function applyQuality() {
  const R = V.R; R.setQuality(settings.quality);
  const q = R.q;
  for (const l of [V.sun, V.key]) { if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; } l.shadow.mapSize.set(q.shadow, q.shadow); }
  V.sun.castShadow = q.sunShadow;
  V.flashlight.castShadow = q.ao;
  V.L.canopyGlass = q.glass ? V.L.canopy : V.L.canopyFallback;
  for (const m of V.M.anchors.canopyGlassMeshes) m.material = V.L.canopyGlass;
  if (V.fx.dust) V.fx.dust.visible = q.dust;
  if (V.plane2) V.plane2.visible = q.second;
}
$("fps").hidden = !settings.fps;

/* автоснижение качества: если в игре долго меньше ~24 кадров/с — на ступень ниже (один раз за сессию) */
const aq = { t: 0, frames: 0, done: false };
function autoQuality(dt) {
  if (aq.done || settings.qualityManual || mode === "menu" || document.hidden) return;
  aq.t += dt; aq.frames++;
  if (aq.t < 6) return;
  const fps = aq.frames / aq.t; aq.t = 0; aq.frames = 0;
  if (fps >= 24) { aq.ok = (aq.ok || 0) + 1; if (aq.ok >= 3) aq.done = true; return; }
  const order = ["low", "medium", "high", "ultra"], i = order.indexOf(settings.quality);
  if (i <= 0) { aq.done = true; return; }
  settings.quality = order[i - 1]; saveSettings(); applyQuality();
  G.toast(`Качество графики снижено до «${QUALITY[settings.quality].name}» (${Math.round(fps)} кадр/с). Изменить — «Настройки».`, "warn", 6000);
}

/* ═════════════ игровой цикл ═════════════ */
const _fwd = new THREE.Vector3();
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0); lastT = t;
  const time = t / 1000;
  V.R.resize();
  // ввод
  const walkish = mode === "walk" || mode === "seat";
  if (player && walkish) {
    player.look(look.dx, look.dy);
    const inp = {
      fwd: keys.has("KeyW") || keys.has("ArrowUp") ? 1 : Math.max(0, -stick.y), back: keys.has("KeyS") || keys.has("ArrowDown") ? 1 : Math.max(0, stick.y),
      left: keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : Math.max(0, -stick.x), right: keys.has("KeyD") || keys.has("ArrowRight") ? 1 : Math.max(0, stick.x),
      sprint: keys.has("ShiftLeft") || keys.has("ShiftRight") || Math.hypot(stick.x, stick.y) > 0.95, crouch: keys.has("ControlLeft") || keys.has("ControlRight") || keys.has("KeyX") || crouchToggle,
      jump: jumpReq,
    };
    if (G.modalOpen()) { inp.fwd = inp.back = inp.left = inp.right = 0; inp.jump = false; }
    jumpReq = false;
    player.update(dt, inp);
    player.applyCamera(V.camera, cols, dt);
    // персонаж от третьего лица
    if (player.third && mode === "walk") {
      const tr = V.tech.root; tr.visible = true; tr.position.copy(player.pos); tr.rotation.y = player.bodyYaw + Math.PI;
      V.tech.animate({ speed: player.speed, crouch: player.crouch, work: working && working.kind !== "visual" ? 1 : 0, tool: working ? working.kind : null, ladder: player.mode === "ladder" ? 1 : 0, dt, lookPitch: player.pitch });
    } else V.tech.root.visible = false;
    // прицел
    const t2 = aimTarget(); setHoverTarget(t2); promptFor(t2);
    // карточка: закрыть, если игрок ушёл; перерисовать, когда узел стал досягаем (или наоборот)
    if (G.selected && !$("card").hidden && mode === "walk" && !working) {
      const b = VW.partBox(G.selected), d = b.distanceToPoint(player.eye);
      if (d > 6) G.selectPart(null);
      else { const near = d <= REACH + 0.2; if (near !== lastNear) { lastNear = near; G.renderCard(); } }
    } else lastNear = null;
  } else if (mode === "engine") {
    if (engineView === "cockpit") {
      const eye = V.M.group.localToWorld(V.M.anchors.pilotEye.clone());
      V.camera.position.copy(eye); V.M.group.getWorldDirection(_fwd);
      const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(V.M.group.quaternion);
      V.camera.lookAt(eye.clone().add(fwd.multiplyScalar(5)).add(new THREE.Vector3(0, -1.6, 0)));
    } else { if (!reduceMotion) VW.orbit.th += dt * 0.03; VW.stepOrbit(dt, reduceMotion); }
    G.engineTick(dt);
  } else {
    VW.stepOrbit(dt, reduceMotion);
  }
  look.dx = look.dy = 0;
  if (G.RD) G.radarTick(dt);
  VW.engineFx(G.getE(), time);
  // тряска камеры
  if (V.shake > 0) { V.shake = Math.max(0, V.shake - dt); if (!reduceMotion) { V.camera.position.x += (Math.random() - 0.5) * V.shake * 0.25; V.camera.position.y += (Math.random() - 0.5) * V.shake * 0.25; } }
  // фонарик
  const fl = V.flashlight;
  fl.intensity = flash && walkish ? 40 : 0;
  if (flash) { V.camera.getWorldDirection(_fwd); fl.position.copy(V.camera.position).addScaledVector(_fwd, 0.2).y -= 0.15; fl.target.position.copy(V.camera.position).addScaledVector(_fwd, 5); fl.target.updateMatrixWorld(); }
  // антенна РЛС качается при контроле сектора
  if (V.parts.radar_drive) { const g = V.parts.radar_drive.meshes[0]; void g; }
  stepWork(dt); updateMarker(dt);
  { const k = `${mode}|${locked}|${$("card").hidden}|${!!working}|${G.modalOpen()}|${railTouch}`; if (k !== railKey) { railKey = k; updateRail(); } }
  V.hands.update(dt, working && (mode === "walk" || mode === "seat") && !player.third && working.kind !== "visual" ? working.kind : null);
  A.ambienceTick(dt);
  VW.frameView(dt, time);
  VW.updateNPCs(dt, (mode === "walk" || mode === "seat") && player ? player.eye : null);
  VW.updateReflection();
  V.R.render(dt);
  autoQuality(dt);
  if (settings.fps) { fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { $("fps").textContent = `${Math.round(fpsN / fpsAcc)} FPS · ${QUALITY[V.R.qKey].name}`; fpsAcc = 0; fpsN = 0; } }
}

/* горячее обновление в просмотрщике артефактов: состояние игры переживает републикацию */
const hot = window.claude && window.claude.hot;
if (hot && typeof hot.snapshot === "function") hot.snapshot(() => ({ P: G.P, S: G.S }));
const run = (data) => boot(data).catch((e) => { console.error(e); $("loadingT").textContent = "Ошибка загрузки: " + e.message; });
if (hot && hot.ready) hot.ready(run); else run((hot && hot.data) || {});
void PT; void ST;
