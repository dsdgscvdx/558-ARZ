/* Каркас: левая колонка разделов, приборная лента показателей сверху, рабочий стол раздела, модальные окна. */
import { useEffect, useState } from "preact/hooks";
import { S, subscribe, go, openModal, closeModal, update, toast, saveSlot } from "./store.js";
import { Ic } from "./icons.jsx";
import { rub, dateCap, num, pct, date } from "./fmt.js";
import { debt, netProfit } from "../sim/finance.js";
import { endMonth, CAMPAIGN_END } from "../sim/tick.js";
import { sum } from "../sim/util.js";
import { alerts, openTenders, lateContracts } from "./sel.js";
import { Menu } from "./screens/Menu.jsx";
import { Dashboard } from "./screens/Dashboard.jsx";
import { Orders } from "./screens/Orders.jsx";
import { Production } from "./screens/Production.jsx";
import { Enterprises } from "./screens/Enterprises.jsx";
import { Research } from "./screens/Research.jsx";
import { Export } from "./screens/Export.jsx";
import { Finance } from "./screens/Finance.jsx";
import { Journal } from "./screens/Journal.jsx";
import { Catalog } from "./screens/Catalog.jsx";
import { ModalHost } from "./modals/index.jsx";

const NAV = [
  { id: "dash", label: "Сводка", icon: "dash" },
  { id: "orders", label: "Заказы", icon: "orders" },
  { id: "prod", label: "Производство", icon: "prod" },
  { id: "ents", label: "Предприятия", icon: "ent" },
  { id: "rnd", label: "НИОКР", icon: "rnd" },
  { id: "export", label: "Экспорт", icon: "export" },
  { id: "finance", label: "Финансы", icon: "fin" },
  { id: "journal", label: "Журнал", icon: "journal" },
  { id: "catalog", label: "Справочник", icon: "catalog" },
];

export function App() {
  const [, setV] = useState(0);
  useEffect(() => subscribe((v) => setV(v)), []);
  const G = S.G;
  if (!G) return (<><Menu /><ModalHost /><Toasts /></>);
  return (
    <div class="shell">
      <Nav G={G} />
      <div class="main">
        <TopBar G={G} />
        <main class="screen" id="screen">
          <div class="screen-inner"><Screen G={G} /></div>
        </main>
      </div>
      <ModalHost />
      <Toasts />
    </div>
  );
}

function Screen({ G }) {
  switch (S.ui.screen) {
    case "orders": return <Orders G={G} />;
    case "prod": return <Production G={G} />;
    case "ents": return <Enterprises G={G} />;
    case "rnd": return <Research G={G} />;
    case "export": return <Export G={G} />;
    case "finance": return <Finance G={G} />;
    case "journal": return <Journal G={G} />;
    case "catalog": return <Catalog G={G} />;
    default: return <Dashboard G={G} />;
  }
}

function badgeFor(G, id) {
  switch (id) {
    case "dash": return G.ev.queue.length ? { n: G.ev.queue.length, crit: true } : null;
    case "orders": { const n = G.offers.length; const l = lateContracts(G).length; return n ? { n } : l ? { n: l, crit: true } : null; }
    case "export": { const n = openTenders(G).filter((T) => !T.bid).length; return n ? { n } : null; }
    case "prod": { const w = Object.values(G._prod?.waiting || {}).reduce((a, b) => a + b, 0); return w ? { n: w, crit: true } : null; }
    default: return null;
  }
}

function Nav({ G }) {
  return (
    <nav class="nav" aria-label="Разделы">
      <div class="brand">
        <div class="brand-mark"><i />ОБОРОНЗАКАЗ</div>
        <small>{G.player.holding}</small>
      </div>
      <div class="nav-list">
        {NAV.map((n) => {
          const b = badgeFor(G, n.id);
          return (
            <button class={`nav-btn${S.ui.screen === n.id ? " on" : ""}`} onClick={() => go(n.id)} aria-current={S.ui.screen === n.id ? "page" : undefined}>
              <Ic n={n.icon} />{n.label}{b ? <span class={`badge${b.crit ? " crit" : ""}`}>{b.n}</span> : null}
            </button>
          );
        })}
        <button class="nav-btn menu-only" onClick={() => openModal("menu")}><Ic n="menu" />Меню</button>
      </div>
      <div class="nav-foot">
        <button class="nav-btn" onClick={() => openModal("help")}><Ic n="help" />Как играть</button>
        <button class="nav-btn" onClick={() => openModal("menu")}><Ic n="menu" />Меню и сохранения</button>
      </div>
    </nav>
  );
}

function meterColor(v) { return v >= 60 ? "var(--ok)" : v >= 35 ? "var(--warn)" : "var(--crit)"; }

function TopBar({ G }) {
  const restr = sum(G.contracts, (c) => c.restr || 0);
  const od = G.loans.find((l) => l.kind === "od");
  const t = G.t;
  return (
    <header class="topbar">
      <div class="tb-date">
        <span class="eyebrow">Месяц {Math.min(t + 1, CAMPAIGN_END + 1)} из {CAMPAIGN_END + 1}</span>
        <b>{dateCap(t)}</b>
      </div>
      <div class="tb-stats">
        <button class="tb-stat" onClick={() => go("finance", { tab: "cash" })} title="Свободные деньги на счетах (без целевых средств ГОЗ)">
          <span class="eyebrow">Деньги</span><span class={`v${od ? " crit" : ""}`}>{od ? `овердрафт ${rub(od.amt)}` : rub(G.cash)}</span>
        </button>
        <button class="tb-stat" onClick={() => go("finance", { tab: "balance" })} title="Авансы ГОЗ на отдельных счетах: тратятся только на изделия по этим контрактам">
          <span class="eyebrow">Целевые ГОЗ</span><span class="v">{rub(restr)}</span>
        </button>
        <button class="tb-stat" onClick={() => go("finance", { tab: "loans" })} title="Кредиты банков">
          <span class="eyebrow">Долг</span><span class="v">{rub(debt(G))}</span>
        </button>
        <button class="tb-stat" onClick={() => go("finance", { tab: "macro" })} title="Курс доллара ЦБ и ключевая ставка">
          <span class="eyebrow">$ · ставка ЦБ</span><span class="v">{num(G.m.usd, 1)} ₽ · {num(G.m.key, 1)}%</span>
        </button>
        <div class="tb-stat" title="Доверие государства: от него зависят цены ГОЗ, субсидии и ваша должность. При нуле — отставка.">
          <span class="eyebrow">Доверие государства</span><span class="v">{Math.round(G.trust)}</span>
          <span class="tb-meter"><i style={`width:${G.trust}%;background:${meterColor(G.trust)}`} /></span>
        </div>
        <div class="tb-stat" title="Экспортная репутация: влияет на шансы в тендерах">
          <span class="eyebrow">Репутация</span><span class="v">{Math.round(G.rep)}</span>
          <span class="tb-meter"><i style={`width:${G.rep}%;background:${meterColor(G.rep)}`} /></span>
        </div>
      </div>
      <div class="tb-next">
        <button class="btn primary btn-next" onClick={nextMonthFlow} disabled={!!(G.over && G.over.kind !== "final")}>
          <Ic n="next" />Завершить месяц
        </button>
      </div>
    </header>
  );
}

export function nextMonthFlow() {
  const G = S.G;
  if (!G) return;
  if (G.over && G.over.kind !== "final") { openModal("over"); return; }
  if (G.ev.queue.length && !S.ui.skipConfirm) { openModal("confirmNext"); return; }
  runMonth();
}
export function runMonth() {
  const G = S.G;
  const t0 = G.t;
  let r;
  try { r = endMonth(G); } catch (e) { console.error(e); toast(`Ошибка расчёта месяца: ${e.message}`, "crit", 9000); return; }
  S.ui.modals = [];
  const ok = saveSlot("auto");
  if (!ok && !S.ui.noStorageWarned) { S.ui.noStorageWarned = true; toast("Браузер не даёт сохранять игру: прогресс пропадёт при закрытии вкладки. Используйте «Меню → Код сохранения».", "warn", 9000); }
  if (r) toast(`${dateCap(t0)}: выручка ${rub(r.rev)}, чистая прибыль ${rub(r.np)}`, r.np >= 0 ? "ok" : "warn");
  if (G.over && !G.over.cont) { openModal("over"); return; }
  if (G.lastReport && !G.lastReport.seen) { openModal("year"); return; }
  if (G.ev.queue.length) openModal("event", { id: G.ev.queue[0].id });
  update();
}

function Toasts() {
  return (<div class="toasts" aria-live="polite">{S.ui.toasts.map((t) => <div class={`toast ${t.tone}`} key={t.id}>{t.text}</div>)}</div>);
}
