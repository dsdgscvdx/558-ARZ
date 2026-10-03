/* Графики на SVG: линии (с прогнозным продолжением) и столбцы с накоплением. Одна ось, тонкие линии,
   подсказка при наведении, легенда для двух и более рядов. Цвета — токены темы. */
import { useEffect, useRef, useState } from "preact/hooks";

function useWidth(ref, fallback = 600) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const upd = () => setW(Math.max(160, Math.round(el.getBoundingClientRect().width)));
    upd();
    if (typeof ResizeObserver === "function") { const ro = new ResizeObserver(upd); ro.observe(el); return () => ro.disconnect(); }
    window.addEventListener("resize", upd);
    return () => window.removeEventListener("resize", upd);
  }, []);
  return w;
}

export function niceTicks(min, max, count = 4) {
  if (!(max > min)) { max = min + 1; }
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step * 0.001; v += step) ticks.push(Math.round(v / step) * step);
  return { lo, hi, ticks };
}

/* series: [{ name, color, values: number[], dashFrom?: index (с которого прогноз), area? }]; labels: подписи по X */
export function LineChart({ series, labels, height = 200, yFmt = (v) => v, tipFmt, zero = true }) {
  const ref = useRef(null);
  const w = useWidth(ref);
  const [hover, setHover] = useState(null);
  const n = labels.length;
  const all = series.flatMap((s) => s.values.filter((v) => v != null && Number.isFinite(v)));
  let min = Math.min(...all, zero ? 0 : Infinity), max = Math.max(...all, zero ? 0 : -Infinity);
  if (!all.length) { min = 0; max = 1; }
  const { lo, hi, ticks } = niceTicks(min, max, 4);
  const padL = 64, padR = 12, padT = 10, padB = 24;
  const iw = w - padL - padR, ih = height - padT - padB;
  const X = (i) => padL + (n <= 1 ? iw / 2 : (i * iw) / (n - 1));
  const Y = (v) => padT + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));
  const path = (vals, from, to) => {
    let d = "";
    for (let i = from; i <= to; i++) { const v = vals[i]; if (v == null || !Number.isFinite(v)) continue; d += `${d ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; }
    return d;
  };
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const i = Math.round(((x - padL) / (iw || 1)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  return (
    <div class="chart" ref={ref}>
      <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-label={series.map((s) => s.name).join(", ")}>
        {ticks.map((t) => (<g><line class={t === 0 ? "zero" : "grid-l"} x1={padL} x2={w - padR} y1={Y(t)} y2={Y(t)} /><text class="axis-t" x={padL - 8} y={Y(t) + 4} text-anchor="end">{yFmt(t)}</text></g>))}
        {labels.map((l, i) => (i % step === 0 || i === n - 1) && (n - 1 - i >= step / 2 || i === n - 1) ? <text class="axis-t" x={X(i)} y={height - 6} text-anchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>{l}</text> : null)}
        {series.map((s) => {
          const last = s.values.length - 1;
          const df = s.dashFrom != null ? s.dashFrom : last + 1;
          const solid = path(s.values, 0, Math.min(df, last));
          const dash = df <= last ? path(s.values, Math.max(0, df), last) : "";
          let area = null;
          if (s.area && solid) {
            const pts = s.values.slice(0, Math.min(df, last) + 1);
            const lastI = pts.length - 1;
            area = <path d={`${solid}L${X(lastI)},${Y(Math.max(lo, 0))}L${X(0)},${Y(Math.max(lo, 0))}Z`} fill={s.color} opacity="0.1" />;
          }
          const endI = (() => { for (let i = Math.min(df, last); i >= 0; i--) if (s.values[i] != null) return i; return -1; })();
          return (
            <g>
              {area}
              <path d={solid} fill="none" stroke={s.color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
              {dash ? <path d={dash} fill="none" stroke={s.color} stroke-width="2" stroke-dasharray="4 4" stroke-linecap="round" opacity="0.85" /> : null}
              {endI >= 0 ? <circle cx={X(endI)} cy={Y(s.values[endI])} r="4" fill={s.color} stroke="var(--surface)" stroke-width="2" /> : null}
            </g>
          );
        })}
        {hover != null ? (
          <g>
            <line x1={X(hover)} x2={X(hover)} y1={padT} y2={padT + ih} stroke="var(--muted)" stroke-width="1" />
            {series.map((s) => s.values[hover] != null ? <circle cx={X(hover)} cy={Y(s.values[hover])} r="4.5" fill={s.color} stroke="var(--surface)" stroke-width="2" /> : null)}
          </g>
        ) : null}
        <rect x={padL} y={padT} width={Math.max(0, iw)} height={Math.max(0, ih)} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} onTouchStart={(e) => onMove(e.touches[0] ? { currentTarget: e.currentTarget, clientX: e.touches[0].clientX } : e)} />
      </svg>
      {hover != null ? (
        <div class="tip" style={`left:${Math.min(Math.max(X(hover) + 12, 0), w - 190)}px;top:8px`}>
          <b>{labels[hover]}</b>
          {series.map((s) => s.values[hover] != null ? <div class="tr"><span><i style={`background:${s.color}`} />{s.name}{s.dashFrom != null && hover >= s.dashFrom ? " (прогноз)" : ""}</span><span>{(tipFmt || yFmt)(s.values[hover])}</span></div> : null)}
        </div>
      ) : null}
    </div>
  );
}

/* data: [{ label, parts: { key: value } }]; keys: [{ id, name, color }] */
export function StackedBars({ data, keys, height = 200, yFmt = (v) => v }) {
  const ref = useRef(null);
  const w = useWidth(ref);
  const [hover, setHover] = useState(null);
  const n = data.length;
  const totals = data.map((d) => keys.reduce((s, k) => s + Math.max(0, d.parts[k.id] || 0), 0));
  const { hi, ticks } = niceTicks(0, Math.max(1, ...totals), 4);
  const padL = 64, padR = 8, padT = 10, padB = 24;
  const iw = w - padL - padR, ih = height - padT - padB;
  const band = iw / Math.max(1, n);
  const bw = Math.min(24, Math.max(4, band * 0.62));
  const Y = (v) => padT + ih - (v / (hi || 1)) * ih;
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 64))));
  return (
    <div class="chart" ref={ref}>
      <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-label={`Столбцы: ${keys.map((k) => k.name).join(", ")}`}>
        {ticks.map((t) => (<g><line class={t === 0 ? "zero" : "grid-l"} x1={padL} x2={w - padR} y1={Y(t)} y2={Y(t)} /><text class="axis-t" x={padL - 8} y={Y(t) + 4} text-anchor="end">{yFmt(t)}</text></g>))}
        {data.map((d, i) => {
          const cx = padL + band * i + band / 2;
          let acc = 0;
          const segs = keys.map((k) => ({ k, v: Math.max(0, d.parts[k.id] || 0) })).filter((s) => s.v > 0);
          return (
            <g onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={cx - band / 2} y={padT} width={band} height={ih} fill="transparent" />
              {segs.map((s, j) => {
                const y0 = Y(acc), y1 = Y(acc + s.v);
                acc += s.v;
                const top = j === segs.length - 1;
                const h = Math.max(0, y0 - y1 - (j > 0 ? 2 : 0));
                const y = y1;
                if (h <= 0.3) return null;
                const r = top ? Math.min(4, h / 2, bw / 2) : 0;
                const x = cx - bw / 2;
                const d2 = r > 0
                  ? `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${y + h}Z`
                  : `M${x},${y + h}V${y}H${x + bw}V${y + h}Z`;
                return <path d={d2} fill={s.k.color} opacity={hover == null || hover === i ? 1 : 0.55} />;
              })}
              {(i % step === 0 || i === n - 1) && (n - 1 - i >= step / 2 || i === n - 1) ? <text class="axis-t" x={cx} y={height - 6} text-anchor="middle">{d.label}</text> : null}
            </g>
          );
        })}
      </svg>
      {hover != null ? (
        <div class="tip" style={`left:${Math.min(Math.max(padL + band * hover + band / 2 + 14, 0), w - 200)}px;top:8px`}>
          <b>{data[hover].full || data[hover].label}</b>
          {keys.map((k) => <div class="tr"><span><i style={`background:${k.color}`} />{k.name}</span><span>{yFmt(data[hover].parts[k.id] || 0)}</span></div>)}
          <div class="tr" style="border-top:1px solid var(--line);margin-top:4px;padding-top:4px"><span>Итого</span><span>{yFmt(totals[hover])}</span></div>
        </div>
      ) : null}
      <div class="legend" style="margin-top:6px">{keys.map((k) => <span><i style={`background:${k.color}`} />{k.name}</span>)}</div>
    </div>
  );
}

export function Spark({ values, color = "var(--muted)", width = 90, height = 26 }) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return null;
  const min = Math.min(...v), max = Math.max(...v);
  const X = (i) => (i * (width - 4)) / (v.length - 1) + 2;
  const Y = (x) => height - 3 - ((x - min) / (max - min || 1)) * (height - 6);
  const d = v.map((x, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(x).toFixed(1)}`).join("");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} fill="none" stroke={color} stroke-width="1.6" stroke-linejoin="round" />
      <circle cx={X(v.length - 1)} cy={Y(v[v.length - 1])} r="2.6" fill="var(--accent)" />
    </svg>
  );
}
