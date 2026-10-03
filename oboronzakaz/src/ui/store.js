/* Состояние интерфейса: текущая партия G (мутирует движок), экраны, стопка модальных окон, уведомления,
   сохранения в localStorage (может быть недоступен — тогда игра работает без сохранений). */
import { SAVE_VERSION } from "../sim/state.js";

export const S = { G: null, v: 0, ui: { screen: "dash", modals: [], toasts: [], params: {} }, fc: null, fcV: -1 };
const subs = new Set();
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
export function update() { S.v++; for (const f of subs) f(S.v); }
/* обёртка для действия игрока: изменить состояние и перерисовать */
export const act = (fn) => (...a) => { const r = fn(S.G, ...a); update(); return r; };

export function go(screen, params = {}) { S.ui.screen = screen; S.ui.params = params; S.ui.modals = []; update(); const el = document.querySelector(".screen"); if (el) el.scrollTop = 0; }
export function openModal(type, props = {}) { S.ui.modals.push({ type, props, id: Math.random().toString(36).slice(2) }); update(); }
export function closeModal() { S.ui.modals.pop(); update(); }
export function closeAll() { S.ui.modals = []; update(); }
export function replaceModal(type, props = {}) { S.ui.modals.pop(); openModal(type, props); }

let toastId = 0;
export function toast(text, tone = "info", ms = 3600) {
  const id = ++toastId;
  S.ui.toasts.push({ id, text, tone });
  if (S.ui.toasts.length > 3) S.ui.toasts.shift();
  update();
  setTimeout(() => { S.ui.toasts = S.ui.toasts.filter((t) => t.id !== id); update(); }, ms);
}

/* ── сохранения ── */
const PREFIX = "oboronzakaz.";
export const SLOTS = ["auto", "1", "2", "3"];
function lsGet(k) { try { return localStorage.getItem(PREFIX + k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(PREFIX + k, v); return true; } catch (e) { return false; } }
function lsDel(k) { try { localStorage.removeItem(PREFIX + k); } catch (e) { /* нет хранилища */ } }

/* перед сохранением подрезаем историю: старые исполненные контракты и журнал */
function compact(G) {
  const done = G.contracts.filter((c) => c.status !== "active");
  if (done.length > 260) {
    const keep = new Set(done.sort((a, b) => (b.doneT ?? b.t0) - (a.doneT ?? a.t0)).slice(0, 260).map((c) => c.id));
    G.contracts = G.contracts.filter((c) => c.status === "active" || keep.has(c.id) || c.recv.length);
  }
}
export function serialize(G) { compact(G); return JSON.stringify(G); }
export function deserialize(text) {
  const G = JSON.parse(text);
  if (!G || typeof G !== "object" || !G.ents || !G.m) throw new Error("Это не сохранение «Оборонзаказа».");
  if ((G.v || 0) > SAVE_VERSION) throw new Error("Сохранение сделано в более новой версии игры.");
  G.flags = G.flags || {};
  G.settings = G.settings || {};
  return G;
}
export function saveSlot(slot = "auto") {
  if (!S.G) return false;
  const meta = { t: S.G.t, name: S.G.player.name, holding: S.G.player.holding, diff: S.G.diff, at: Date.now(), over: S.G.over?.kind || null };
  const ok = lsSet(`save.${slot}`, serialize(S.G)) && lsSet(`meta.${slot}`, JSON.stringify(meta));
  return ok;
}
export function slotMeta(slot) { try { const m = lsGet(`meta.${slot}`); return m ? JSON.parse(m) : null; } catch (e) { return null; } }
export function loadSlot(slot) {
  const text = lsGet(`save.${slot}`);
  if (!text) return null;
  return deserialize(text);
}
export function deleteSlot(slot) { lsDel(`save.${slot}`); lsDel(`meta.${slot}`); }
export function storageOk() { try { localStorage.setItem(PREFIX + "probe", "1"); localStorage.removeItem(PREFIX + "probe"); return true; } catch (e) { return false; } }

/* сжатая строка сохранения для переноса (копировать — вставить) */
export async function exportCode(G) {
  const json = serialize(G);
  try {
    if (typeof CompressionStream === "function") {
      const cs = new CompressionStream("gzip");
      const buf = await new Response(new Blob([json]).stream().pipeThrough(cs)).arrayBuffer();
      let bin = ""; const u8 = new Uint8Array(buf);
      for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return "OZ1:" + btoa(bin);
    }
  } catch (e) { /* без сжатия */ }
  return "OZ0:" + btoa(unescape(encodeURIComponent(json)));
}
export async function importCode(code) {
  code = code.trim();
  if (code.startsWith("OZ1:")) {
    const bin = atob(code.slice(4));
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const ds = new DecompressionStream("gzip");
    const text = await new Response(new Blob([u8]).stream().pipeThrough(ds)).text();
    return deserialize(text);
  }
  if (code.startsWith("OZ0:")) return deserialize(decodeURIComponent(escape(atob(code.slice(4)))));
  return deserialize(code);
}

/* ── тема ── */
export function applyTheme(theme) {
  const r = document.documentElement;
  if (theme === "light" || theme === "dark") r.setAttribute("data-theme", theme);
  else r.removeAttribute("data-theme");
  lsSet("theme", theme || "system");
}
export function savedTheme() { return lsGet("theme") || "system"; }
