/* Заказы: предложения (ГОЗ, гражданские, сервис), действующие контракты, архив. */
import { S, openModal, act, go } from "../store.js";
import { Card, Tabs, Seg, Kind, Bar, St, Empty } from "../components.jsx";
import { rub, money, num, pct, date, dateShort, months } from "../fmt.js";
import { VAR, unitOf, compName } from "../../sim/catalog.js";
import { clientName, feasibility, acceptOffer, declineOffer, remaining } from "../../sim/contracts.js";
import { rate } from "../../sim/macro.js";
import { contractValueRub, unitMargin } from "../sel.js";

export function Orders({ G }) {
  (G.settings.seen = G.settings.seen || {}).orders = true;
  const p = S.ui.params || {};
  const tab = p.tab || (G.offers.length ? "offers" : "active");
  const setTab = (t) => { S.ui.params = { ...p, tab: t, filter: t === "active" ? p.filter : undefined }; go("orders", S.ui.params); };
  const active = G.contracts.filter((c) => c.status === "active");
  const done = G.contracts.filter((c) => c.status !== "active").sort((a, b) => (b.doneT ?? 0) - (a.doneT ?? 0));
  return (
    <>
      <div class="screen-head">
        <div><h1>Заказы</h1><p>Минобороны присылает проекты контрактов ГОЗ, когда портфель по изделию подходит к концу. Без ответа за два месяца проект подписывается на условиях заказчика. Гражданские предложения снимаются через два месяца, сервис парка продлевается каждый январь.</p></div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: "offers", label: "Предложения", badge: G.offers.length || null },
        { id: "active", label: "Действующие", badge: null },
        { id: "done", label: "Исполненные и расторгнутые" },
      ]} />
      {tab === "offers" ? <Offers G={G} /> : tab === "active" ? <Active G={G} list={active} filter={p.filter || "all"} /> : <Archive G={G} list={done} />}
    </>
  );
}

function Offers({ G }) {
  const groups = [
    { k: "goz", title: "Проекты контрактов гособоронзаказа", list: G.offers.filter((o) => o.kind === "goz") },
    { k: "civ", title: "Гражданские заказчики", list: G.offers.filter((o) => o.kind === "civ") },
    { k: "svc", title: "Сервисное обслуживание парка за рубежом", list: G.offers.filter((o) => o.kind === "svc") },
  ];
  if (!G.offers.length) return <Card><Empty title="Новых предложений нет">Проекты ГОЗ приходят, когда заказ по изделию заканчивается, гражданские — раз в квартал. Экспортные тендеры — в разделе «Экспорт».</Empty></Card>;
  return (
    <div class="stack loose">
      {groups.filter((g) => g.list.length).map((g) => (
        <Card title={g.title} eyebrow={`${g.list.length}`} flush actions={g.k === "goz" ? <button class="btn sm" onClick={() => { for (const o of [...g.list]) if (feasibility(G, o).ok) acceptOffer(G, o.id); act(() => {})(); }}>Принять все выполнимые</button> : null}>
          <div class="items">{g.list.map((o) => <OfferRow G={G} o={o} />)}</div>
        </Card>
      ))}
    </div>
  );
}

export function OfferRow({ G, o }) {
  if (o.kind === "svc") {
    return (
      <div class="item">
        <div>
          <h4><Kind k="svc" />{clientName(o)}: поддержание парка нашей техники</h4>
          <div class="meta"><span>{money(o.cur, o.price)} в год (≈ {rub(o.price * rate(G, o.cur))})</span><span>12 месяцев</span><span>себестоимость запчастей и работ ≈ 55%</span><span>ответить до {date(o.exp)}</span></div>
        </div>
        <div class="acts"><button class="btn sm primary" onClick={() => act(acceptOffer)(o.id)}>Принять</button><button class="btn sm ghost" onClick={() => act(declineOffer)(o.id)}>Отказаться</button></div>
      </div>
    );
  }
  const v = VAR[o.v];
  const f = feasibility(G, o);
  const um = unitMargin(G, o.v, o.price * rate(G, o.cur));
  return (
    <div class="item click" onClick={() => openModal("offer", { id: o.id })}>
      <div>
        <h4><Kind k={o.kind} />{v.name} × {num(o.qty)} {unitOf(o.v) !== "шт." ? <span class="muted small">({unitOf(o.v)})</span> : null}{o.urgent ? <St tone="warn">срочный</St> : null}</h4>
        <div class="meta">
          <span>{clientName(o)}</span>
          <span>{rub(o.price)} за ед. · всего {rub(o.price * o.qty)}</span>
          <span>аванс {pct(o.adv)}</span>
          <span>срок {date(o.due)}</span>
          <span class={um.m < 0.03 ? "down" : ""}>рентабельность ≈ {pct(um.m, 1)}</span>
          {f.short ? <St tone="crit">нет двигателей {compName(f.short.id)}: свободно {f.short.free} из {f.short.need}</St> : f.ok ? <St tone="ok">успеваем: ≈ {months(f.months)}</St> : <St tone="crit">не успеваем: нужно ≈ {months(f.months)}</St>}
        </div>
      </div>
      <div class="acts" onClick={(e) => e.stopPropagation()}>
        <button class="btn sm primary" onClick={() => act(acceptOffer)(o.id)}>Принять</button>
        <button class="btn sm" onClick={() => openModal("offer", { id: o.id })}>{o.kind === "goz" ? "Торговаться" : "Подробнее"}</button>
        <button class="btn sm ghost" onClick={() => (o.kind === "goz" ? openModal("offer", { id: o.id, decline: true }) : act(declineOffer)(o.id))}>Отказаться</button>
      </div>
    </div>
  );
}

const FLT = [
  { id: "all", label: "Все" }, { id: "goz", label: "ГОЗ" }, { id: "exp", label: "Экспорт" }, { id: "civ", label: "Гражданские" }, { id: "svc", label: "Сервис" }, { id: "late", label: "Просроченные" },
];
function Active({ G, list, filter }) {
  const setF = (f) => go("orders", { tab: "active", filter: f });
  const rows = list.filter((c) => filter === "all" || (filter === "late" ? c.late > 0 : c.kind === filter)).sort((a, b) => (b.late || 0) - (a.late || 0) || a.due - b.due);
  return (
    <Card flush title={`Действующие контракты: ${list.length}`} actions={<Seg items={FLT} value={filter} onChange={setF} />}>
      {rows.length ? (
        <div class="tblwrap">
          <table class="tbl">
            <thead><tr><th>Заказчик и изделие</th><th>Выполнение</th><th>Срок</th><th class="r">Стоимость</th><th class="r">Целевые средства</th><th>Статус</th></tr></thead>
            <tbody>
              {rows.map((c) => {
                const stock = c.v ? G.stock[c.v]?.n || 0 : 0;
                return (
                  <tr class="click" onClick={() => openModal("contract", { id: c.id })}>
                    <td><div class="row"><Kind k={c.kind} /><b>{c.v ? VAR[c.v].name : "Сервис парка"}</b></div><div class="sub">{clientName(c)} · {c.no}</div></td>
                    <td style="min-width:150px">{c.kind === "svc" ? <span class="sub">месяц {c.done} из {c.qty}</span> : <><div class="row between small"><span>{num(c.done)} / {num(c.qty)}</span><span class="muted">{stock ? `на складе ${stock}` : ""}</span></div><Bar value={c.done} max={c.qty} tone={c.late ? "crit" : "ok"} thin /></>}</td>
                    <td class="nowrap">{date(c.due)}{c.late ? <div><St tone="crit">просрочка {months(c.late)}</St></div> : <div class="sub">через {months(Math.max(0, c.due - G.t))}</div>}</td>
                    <td class="r nowrap">{rub(contractValueRub(G, c))}<div class="sub">{c.cur !== "RUB" ? money(c.cur, c.kind === "svc" ? c.price : c.price * c.qty) : ""}</div></td>
                    <td class="r nowrap">{c.kind === "goz" ? rub(c.restr) : <span class="muted">—</span>}</td>
                    <td>{c.hold ? <St tone="neutral">приостановлен</St> : c.prio ? <St tone="info">приоритет</St> : <span class="muted small">обычный</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <Empty title="Нет контрактов в этой категории" />}
    </Card>
  );
}

function Archive({ G, list }) {
  return (
    <Card flush title="Исполненные и расторгнутые">
      {list.length ? (
        <div class="tblwrap">
          <table class="tbl">
            <thead><tr><th>Заказчик и изделие</th><th>Итог</th><th class="r">Выручка</th><th class="r">Себестоимость</th><th class="r">Неустойки</th></tr></thead>
            <tbody>
              {list.slice(0, 150).map((c) => (
                <tr class="click" onClick={() => openModal("contract", { id: c.id })}>
                  <td><div class="row"><Kind k={c.kind} /><b>{c.v ? `${VAR[c.v].name} × ${c.qty}` : "Сервис парка"}</b></div><div class="sub">{clientName(c)} · {c.no}</div></td>
                  <td>{c.status === "done" ? <St tone={c.doneT != null && c.doneT <= c.due ? "ok" : "warn"}>{c.doneT != null && c.doneT <= c.due ? "в срок" : "с опозданием"}, {dateShort(c.doneT ?? c.due)}</St> : <St tone="crit">расторгнут</St>}</td>
                  <td class="r">{rub(c.rev)}</td>
                  <td class="r">{rub(c.cost)}</td>
                  <td class="r">{c.pen ? rub(c.pen) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty title="Пока ни одного исполненного контракта" />}
    </Card>
  );
}
