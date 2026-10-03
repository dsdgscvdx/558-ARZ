/* Базовые элементы интерфейса */
import { useEffect, useRef } from "preact/hooks";
import { Ic } from "./icons.jsx";
import { closeModal } from "./store.js";

export function Modal({ title, eyebrow, size, children, footer, onClose, icon }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const el = ref.current;
    const f = el && el.querySelector("button, [href], input, select, textarea");
    if (f) f.focus({ preventScroll: true });
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); (onClose || closeModal)(); } };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); if (prev && prev.focus) prev.focus({ preventScroll: true }); };
  }, []);
  return (
    <div class="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) (onClose || closeModal)(); }}>
      <div class={`modal ${size || ""}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div class="modal-h">
          {icon ? <span class="fg2" style="margin-top:2px"><Ic n={icon} size={22} /></span> : null}
          <div class="stack tight" style="min-width:0">
            {eyebrow ? <span class="eyebrow">{eyebrow}</span> : null}
            <h2>{title}</h2>
          </div>
          <button class="iconbtn x" onClick={onClose || closeModal} aria-label="Закрыть" title="Закрыть (Esc)"><Ic n="x" /></button>
        </div>
        <div class="modal-b">{children}</div>
        {footer ? <div class="modal-f">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div class="tabs" role="tablist">
      {tabs.map((t) => (
        <button role="tab" aria-selected={t.id === value} class={t.id === value ? "on" : ""} onClick={() => onChange(t.id)}>
          {t.label}{t.badge ? <span class="badge">{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Seg({ items, value, onChange }) {
  return (<div class="seg">{items.map((it) => <button class={it.id === value ? "on" : ""} onClick={() => onChange(it.id)} aria-pressed={it.id === value}>{it.label}</button>)}</div>);
}

export function Tile({ label, value, sub, onClick, children, title }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag class="tile" onClick={onClick} title={title}>
      <span class="eyebrow">{label}</span>
      <span class="v">{value}</span>
      {sub ? <span class="d">{sub}</span> : null}
      {children}
    </Tag>
  );
}

export function Bar({ value, max = 1, tone, mark, thin, title }) {
  const w = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  return (
    <div class={`bar${thin ? " thin" : ""}`} title={title} role="meter" aria-valuenow={Math.round(w * 100)} aria-valuemin="0" aria-valuemax="100">
      <i class={tone || ""} style={`width:${(w * 100).toFixed(1)}%`} />
      {mark != null ? <span class="mark" style={`left:calc(${Math.min(100, Math.max(0, mark * 100)).toFixed(1)}% - 1px)`} /> : null}
    </div>
  );
}

const ST_ICON = { ok: "check", warn: "warn", crit: "warn", info: "info", neutral: "info" };
export function St({ tone = "neutral", children, title }) {
  return (<span class={`st ${tone}`} title={title}><Ic n={ST_ICON[tone]} />{children}</span>);
}

const KIND = { goz: "ГОЗ", exp: "Экспорт", civ: "Гражданский", svc: "Сервис" };
export function Kind({ k, label }) {
  return (<span class={`chip ${k}`}><i class="sw" />{label || KIND[k] || k}</span>);
}

export function Stepper({ value, onChange, min = 0, max = 1e9, step = 1, fmt, label }) {
  return (
    <span class="stepper" role="group" aria-label={label}>
      <button onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min} aria-label="Меньше">−</button>
      <b>{fmt ? fmt(value) : value}</b>
      <button onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max} aria-label="Больше">+</button>
    </span>
  );
}

export function Slider({ label, value, min, max, step, onInput, onChange, fmt, hint, id }) {
  return (
    <label class="slider" for={id}>
      <span class="row between"><span class="small muted">{label}</span><b class="small">{fmt ? fmt(value) : value}</b></span>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onInput={(e) => onInput && onInput(+e.currentTarget.value)} onChange={(e) => onChange && onChange(+e.currentTarget.value)} />
      {hint ? <span class="small muted">{hint}</span> : null}
    </label>
  );
}

export function Empty({ title, children }) {
  return (<div class="empty"><b>{title}</b>{children ? <span>{children}</span> : null}</div>);
}

export function KV({ rows, left }) {
  return (<dl class={`kv${left ? " left" : ""}`}>{rows.filter(Boolean).map(([k, v]) => [<dt>{k}</dt>, <dd>{v}</dd>])}</dl>);
}

export function Card({ title, eyebrow, actions, children, flush, class: cls }) {
  return (
    <section class={`card ${cls || ""}`}>
      {title || eyebrow || actions ? (
        <div class="card-h">
          <div class="stack tight grow">
            {eyebrow ? <span class="eyebrow">{eyebrow}</span> : null}
            {title ? <h2>{title}</h2> : null}
          </div>
          {actions}
        </div>
      ) : null}
      <div class={`card-b${flush ? " flush" : ""}`}>{children}</div>
    </section>
  );
}
