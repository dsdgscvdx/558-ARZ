/* Экспорт: карта партнёров, открытые тендеры, отношения, выставки. */
import { useState } from "preact/hooks";
import { S, openModal, act } from "../store.js";
import { Card, Tabs, Bar, St, Empty, Kind } from "../components.jsx";
import { DotMap } from "../map.jsx";
import { usd, rub, pct, date, num, months } from "../fmt.js";
import { PARTNERS, PARTNER, REGIONS } from "../../data/partners.js";
import { COUNTRIES, TCATS } from "../../data/competitors.js";
import { shownOdds, exposThisYear, joinExpo, compById } from "../../sim/tenders.js";
import { VAR } from "../../sim/catalog.js";
import { yearOf } from "../../sim/util.js";
import { rate } from "../../sim/macro.js";

export function Export({ G }) {
  (G.settings.seen = G.settings.seen || {}).export = true;
  const [tab, setTab] = useState(S.ui.params?.tab || "tenders");
  const open = G.tenders.filter((T) => T.status === "open").sort((a, b) => a.close - b.close);
  const closed = G.tenders.filter((T) => T.status !== "open").sort((a, b) => b.decided - a.decided);
  const active = G.contracts.filter((c) => c.status === "active" && (c.kind === "exp" || c.kind === "svc"));
  const byP = {};
  for (const c of active) byP[c.client] = (byP[c.client] || 0) + 1;
  const LP = { mm: "l", la: "b", vn: "r", bd: "l", tr: "l", am: "r", iq: "r", sa: "b", ae: "r", eg: "l", rs: "l", by: "t", my: "l", id: "b", cn: "r", in: "b", kz: "t" };
  const pins = PARTNERS.map((P) => {
    const pp = G.partners[P.id];
    const ot = open.filter((T) => T.partner === P.id).length;
    return { id: P.id, lat: P.lat, lon: P.lon, lp: LP[P.id], label: ot ? `${P.name} · ${ot}` : P.name, size: 7 + Math.min(10, Math.round(P.budget * 1.2)),
      color: pp.rel >= 65 ? "var(--ok)" : pp.rel >= 40 ? "var(--warn)" : "var(--crit)", on: ot > 0, title: `${P.name}: отношения ${Math.round(pp.rel)}, бюджет $${P.budget} млрд в год` };
  });
  return (
    <>
      <div class="screen-head">
        <div><h1>Экспорт</h1><p>Экспорт идёт через спецэкспортёра: комиссия, обучение, ЗИП и документация съедают около 19% цены. Зато маржа в разы выше, чем у ГОЗ. Против нас — Rafale, F-16, J-10CE, K2, Patriot и другие. Шансы зависят от цены, техники, политики, офсетов и условий оплаты.</p></div>
      </div>
      <Card title="Партнёры и запросы" eyebrow="размер метки — бюджет на импорт вооружений; цвет — отношения">
        <DotMap view="world" pins={pins} onPin={(id) => openModal("partner", { id })} />
      </Card>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: "tenders", label: "Открытые тендеры", badge: open.filter((T) => !T.bid).length || null },
        { id: "partners", label: "Страны" },
        { id: "expos", label: "Выставки" },
        { id: "history", label: "Итоги тендеров" },
      ]} />
      {tab === "tenders" ? (
        <Card flush>
          {open.length ? <div class="items">{open.map((T) => <TenderRow G={G} T={T} />)}</div>
            : <Empty title="Открытых тендеров нет">Запросы приходят чаще от стран с хорошими отношениями. Делегации и выставки повышают их частоту.</Empty>}
        </Card>
      ) : tab === "partners" ? <Partners G={G} byP={byP} /> : tab === "expos" ? <Expos G={G} /> : <History G={G} list={closed} />}
    </>
  );
}

function TenderRow({ G, T }) {
  const P = PARTNER[T.partner];
  const so = T.bid ? shownOdds(G, T, T.bid) : null;
  return (
    <div class="item click" onClick={() => openModal("tender", { id: T.id })}>
      <div class="stack tight">
        <h4>{P.name}: {TCATS[T.tcat].name.toLowerCase()}, {num(T.qty)} ед.{T.direct ? <St tone="ok">прямой запрос</St> : null}</h4>
        <div class="meta">
          <span>бюджет ≈ {usd(T.budget)}</span>
          <span>поставка за {months(T.months)}</span>
          <span>решение: {date(T.close)}</span>
          <span>{T.direct ? "без конкурса" : `конкуренты: ${T.comp.map((c) => compById(c.id).name).join(", ")}`}</span>
        </div>
      </div>
      <div class="acts">
        {T.bid ? <St tone={so.p >= 0.5 ? "ok" : so.p >= 0.25 ? "warn" : "crit"}>заявка подана · шансы {so.exact ? "" : "≈ "}{pct(so.p)}</St> : <button class="btn sm primary">Подготовить заявку</button>}
      </div>
    </div>
  );
}

function Partners({ G, byP }) {
  const rows = [...PARTNERS].sort((a, b) => G.partners[b.id].rel - G.partners[a.id].rel);
  return (
    <Card flush>
      <div class="tblwrap">
        <table class="tbl">
          <thead><tr><th>Страна</th><th>Отношения</th><th class="r">Бюджет, $/год</th><th>Риск санкций США</th><th>Платёжная дисциплина</th><th class="r">Контракты</th></tr></thead>
          <tbody>
            {rows.map((P) => {
              const pp = G.partners[P.id];
              return (
                <tr class="click" onClick={() => openModal("partner", { id: P.id })}>
                  <td><b>{P.name}</b><div class="sub">{REGIONS[P.region]}{P.csto ? " · ОДКБ, внутренние цены" : ""} · расчёты: {P.cur === "RUB" ? "рубли" : P.cur}</div></td>
                  <td style="min-width:120px"><div class="small">{Math.round(pp.rel)}</div><Bar value={pp.rel} max={100} tone={pp.rel >= 65 ? "ok" : pp.rel >= 40 ? "warn" : "crit"} thin /></td>
                  <td class="r">{usd(P.budget * 1000)}</td>
                  <td>{P.caatsa >= 0.7 ? <St tone="crit">высокий</St> : P.caatsa >= 0.4 ? <St tone="warn">средний</St> : <St tone="ok">низкий</St>}</td>
                  <td>{P.pay >= 0.85 ? <St tone="ok">платит вовремя</St> : P.pay >= 0.65 ? <St tone="warn">задержки</St> : <St tone="crit">большие задержки</St>}</td>
                  <td class="r">{byP[P.id] || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Expos({ G }) {
  const yr = yearOf(G.t);
  const list = exposThisYear(G).sort((a, b) => a.t - b.t);
  return (
    <Card title={`Выставки вооружений ${yr} года`} eyebrow="участие улучшает отношения со странами региона и учащает их запросы на полгода" flush>
      <div class="items">
        {list.map((ex) => {
          const reg = G.expos[`${ex.id}${yr}`];
          const past = ex.t < G.t;
          return (
            <div class="item">
              <div>
                <h4>{ex.name} <span class="muted small">{ex.city}</span></h4>
                <div class="meta"><span>{date(ex.t)}</span><span>стоимость участия ≈ {rub(ex.cost * G.m.cpi)}</span><span>гости: {ex.focus.map((p) => PARTNER[p]?.name).filter(Boolean).join(", ")}</span></div>
              </div>
              <div class="acts">
                {reg ? <St tone="ok">{reg.done ? "участвовали" : "заявка подана"}</St> : past ? <span class="small muted">прошла</span> : <button class="btn sm primary" onClick={() => act(joinExpo)(ex.id)}>Участвовать</button>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function History({ G, list }) {
  return (
    <Card flush>
      {list.length ? (
        <div class="tblwrap">
          <table class="tbl">
            <thead><tr><th>Тендер</th><th>Итог</th><th>Наша заявка</th></tr></thead>
            <tbody>
              {list.map((T) => {
                const P = PARTNER[T.partner];
                const w = T.winner && T.winner !== "us" ? compById(T.winner) : null;
                return (
                  <tr class="click" onClick={() => openModal("tender", { id: T.id })}>
                    <td><b>{P.name}</b><div class="sub">{TCATS[T.tcat].name}, {T.qty} ед. · {date(T.decided)}</div></td>
                    <td>{T.status === "won" ? <St tone="ok">победа</St> : T.status === "lost" ? <St tone="warn">{w ? `${w.name} (${COUNTRIES[w.c]})` : "проигрыш"}</St> : <St tone="neutral">отменён</St>}</td>
                    <td class="small">{T.bid ? `${VAR[T.bid.v].name}, ${P.csto ? rub(T.bid.price) : usd(T.bid.price)} за ед.` : <span class="muted">не участвовали</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <Empty title="Итогов пока нет" />}
    </Card>
  );
}
export { Kind, rate };
