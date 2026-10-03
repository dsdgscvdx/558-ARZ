/* Точечная карта суши (без границ государств) на canvas и метки поверх неё. */
import { useEffect, useRef, useState } from "preact/hooks";
import { MAP } from "../data/worldmap.js";

let MASK = null;
function mask() {
  if (MASK) return MASK;
  const bin = atob(MAP.bits);
  MASK = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) MASK[i] = bin.charCodeAt(i);
  return MASK;
}
const isLand = (r, c) => { const i = r * MAP.w + c; return (mask()[i >> 3] >> (i & 7)) & 1; };

export const VIEWS = {
  world: { lon0: -125, lon1: 180, lat0: 74, lat1: -46, k: 1, stride: 1 },
  russia: { lon0: 26, lon1: 146, lat0: 70, lat1: 40, k: Math.cos((56 * Math.PI) / 180), stride: 1 },
};

function cssVar(name, fallback) {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; } catch (e) { return fallback; }
}

export function DotMap({ view = "world", pins = [], onPin, height, highlight }) {
  const V = VIEWS[view];
  const wrap = useRef(null), cv = useRef(null);
  const [w, setW] = useState(800);
  const [themeTick, setThemeTick] = useState(0);
  const aspect = ((V.lon1 - V.lon0) * V.k) / (V.lat0 - V.lat1);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const upd = () => setW(Math.max(200, Math.round(el.getBoundingClientRect().width)));
    upd();
    let ro;
    if (typeof ResizeObserver === "function") { ro = new ResizeObserver(upd); ro.observe(el); }
    const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    const onTheme = () => setThemeTick((x) => x + 1);
    if (mq && mq.addEventListener) mq.addEventListener("change", onTheme);
    const mo = typeof MutationObserver === "function" ? new MutationObserver(onTheme) : null;
    if (mo) mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { if (ro) ro.disconnect(); if (mq && mq.removeEventListener) mq.removeEventListener("change", onTheme); if (mo) mo.disconnect(); };
  }, []);
  const h = height || Math.round(w / aspect);
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const dot = cssVar("--dot", "#2a4458");
    const pxPerDeg = w / ((V.lon1 - V.lon0) * V.k);
    const stride = pxPerDeg < 2.2 ? 2 : 1;
    const r = Math.max(0.7, Math.min(2.6, pxPerDeg * stride * 0.32));
    ctx.fillStyle = dot;
    const r0 = Math.max(0, MAP.lat0 - V.lat0), r1 = Math.min(MAP.h - 1, MAP.lat0 - V.lat1);
    const c0 = Math.max(0, V.lon0 - MAP.lon0), c1 = Math.min(MAP.w - 1, V.lon1 - MAP.lon0);
    for (let rr = r0; rr <= r1; rr += stride) {
      const lat = MAP.lat0 - rr;
      const y = ((V.lat0 - lat) / (V.lat0 - V.lat1)) * h;
      for (let cc = c0; cc <= c1; cc += stride) {
        if (!isLand(rr, cc)) continue;
        const lon = MAP.lon0 + cc + 0.5;
        const x = ((lon - V.lon0) / (V.lon1 - V.lon0)) * w;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (highlight) {
      ctx.fillStyle = cssVar("--dot-hi", "#3c5e78");
      for (const p of highlight) {
        const x = ((p.lon - V.lon0) / (V.lon1 - V.lon0)) * w, y = ((V.lat0 - p.lat) / (V.lat0 - V.lat1)) * h;
        ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, Math.PI * 2); ctx.fill();
      }
    }
  }, [w, h, view, themeTick, highlight]);
  const pos = (lat, lon) => ({ left: ((lon - V.lon0) / (V.lon1 - V.lon0)) * 100, top: ((V.lat0 - lat) / (V.lat0 - V.lat1)) * 100 });
  return (
    <div class="map" ref={wrap} style={`height:${h}px`}>
      <canvas ref={cv} style={`width:${w}px;height:${h}px`} aria-hidden="true" />
      {pins.map((p) => {
        const q = pos(p.lat, p.lon);
        if (q.left < -2 || q.left > 102 || q.top < -2 || q.top > 102) return null;
        const s = p.size || 10;
        return (
          <button class={`pin${p.on ? " on" : ""}`} style={`left:${q.left}%;top:${q.top}%;width:${s + 12}px;height:${s + 12}px`} onClick={() => onPin && onPin(p.id)} title={p.title || p.label} aria-label={p.title || p.label}>
            <i style={`width:${s}px;height:${s}px;background:${p.color || "var(--accent)"}`} />
            {p.label ? <span class={p.lp ? `lp-${p.lp}` : ""}>{p.label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
