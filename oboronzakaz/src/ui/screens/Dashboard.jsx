/* Сводка: что требует решения, ключевые показатели, деньги с прогнозом, выручка по сегментам, KPI года, новости. */
import { S, go, openModal, update } from "../store.js";
import { Card, Tile, Bar, St, Empty } from "../components.jsx";
import { LineChart, StackedBars, Spark } from "../charts.jsx";
import { Ic } from "../icons.jsx";
import { rub, rubShort, pct, num, dateShort, dateGen, dateCap, date, months } from "../fmt.js";
import { alerts, kpiProgress, getForecast, entStats, segRows } from "../sel.js";
import { revenue, netProfit, debt } from "../../sim/finance.js";
import { VAR } from "../../sim/catalog.js";
import { rate } from "../../sim/macro.js";
import { sum, yearOf } from "../../sim/util.js";
import { LogRow } from "./Journal.jsx";

const SEGS = [
  { id: "goz", name: "ГОЗ", color: "var(--seg-goz)" },
  { id: "exp", name: "Экспорт", color: "var(--seg-exp)" },
  { id: "civ", name: "Гражданская", color: "var(--seg-civ)" },
  { id: "svc", name: "Сервис", color: "var(--seg-svc)" },
];

export function Dashboard({ G }) {
  const al = alerts(G);
  const h = G.hist;
  const last12 = h.slice(-12);
  const rev12 = sum(last12, (x) => x.rev), np12 = sum(last12, (x) => x.np);
  const fc = getForecast(G);
  const minFc = fc.length ? Math.min(...fc.map((x) => x.cash - x.od)) : G.cash;
  const backlog = h.length ? h[h.length - 1].backlog : 0;
  const staff = sum(Object.values(G.ents), (e) => e.staff);
  const st = Object.values(G.ents).map((e) => entStats(G, e));
  const cap = sum(st, (s) => s.cap), need = sum(st, (s) => Math.min(s.need, s.cap));
  const util = cap > 0 ? need / cap : 0;
  const kp = kpiProgress(G);
  // деньги и долг: последние 18 месяцев + прогноз 6
  const hist = h.slice(-18);
  const labels = [...hist.map((x) => dateShort(x.t)), ...fc.map((x) => dateShort(x.t))];
  const cashV = [...hist.map((x) => x.cash), ...fc.map((x) => x.cash)];
  const debtV = [...hist.map((x) => x.debt), ...fc.map((x) => x.debt)];
  const segs = segRows(G, 18).map((r) => ({ label: dateShort(r.t), full: dateCap(r.t), parts: r }));
  const mr = G.monthReport;
  return (
    <>
      <div class="screen-head">
        <div>
          <h1>Сводка</h1>
          <p>{G.player.name} · {G.player.holding}. {dateCap(G.t)}: всё, что требует вашего решения, — сверху.</p>
        </div>
      </div>

      {G.t < 4 && !G.settings.hideGuide ? <Guide G={G} /> : null}

      <div class="tiles six">
        <Tile label="Свободные деньги" value={rub(G.cash)} sub={fc.length ? <>минимум за 6 мес.: <b class={minFc < 0 ? "down" : ""}>{rub(minFc)}</b></> : null} onClick={() => go("finance", { tab: "cash" })} />
        <Tile label="Выручка за 12 мес." value={h.length ? rub(rev12) : "—"} sub={h.length >= 2 ? <Spark values={h.slice(-12).map((x) => x.rev)} /> : "считается с первого месяца"} onClick={() => go("finance", { tab: "pl" })} />
        <Tile label="Прибыль за 12 мес." value={h.length ? rub(np12) : "—"} sub={h.length ? <span class={np12 >= 0 ? "up" : "down"}>{rev12 > 0 ? `чистая, рентабельность ${pct(np12 / rev12, 1)}` : ""}</span> : null} onClick={() => go("finance", { tab: "pl" })} />
        <Tile label="Портфель заказов" value={rub(h.length ? backlog : sum(G.contracts.filter((c) => c.status === "active" && c.kind !== "svc"), (c) => (c.qty - c.done) * c.price * rate(G, c.cur)))} sub={`${G.contracts.filter((c) => c.status === "active").length} действующих контрактов`} onClick={() => go("orders", { tab: "active" })} />
        <Tile label="Загрузка мощностей" value={pct(util)} sub={<Bar value={util} tone={util > 0.97 ? "warn" : util < 0.65 ? "crit" : "ok"} thin />} onClick={() => go("prod")} />
        <Tile label="Персонал" value={num(staff)} sub={`ФОТ ${rub(sum(st, (s) => s.pay))} в мес.`} onClick={() => go("ents")} />
      </div>

      <div class="grid g-main">
        <div class="stack loose">
          <Card title="Требует решения" eyebrow={al.length ? `${al.length} ${al.length === 1 ? "пункт" : al.length < 5 ? "пункта" : "пунктов"}` : "всё под контролем"} flush>
            {al.length ? (
              <div class="items">
                {al.slice(0, 9).map((a) => (
                  <div class="item click" onClick={() => (a.modal ? openModal(a.modal[0], a.modal[1]) : go(a.go[0], a.go[1]))}>
                    <div class="row"><St tone={a.tone}>{a.tone === "crit" ? "срочно" : a.tone === "warn" ? "внимание" : "к сведению"}</St><span>{a.text}</span></div>
                    <span class="muted"><Ic n="next" size={16} /></span>
                  </div>
                ))}
              </div>
            ) : <Empty title="Срочных вопросов нет">Можно завершать месяц или заняться стратегией: экспорт, НИОКР, модернизация.</Empty>}
          </Card>

          <Card title="Деньги и долг" eyebrow="18 месяцев истории и прогноз на 6 месяцев пунктиром">
            {hist.length + fc.length >= 2 ? (
              <>
                <LineChart labels={labels} height={210} yFmt={rubShort} tipFmt={rub}
                  series={[
                    { name: "Свободные деньги", color: "var(--seg-civ)", values: cashV, dashFrom: hist.length ? hist.length - 1 : 0, area: true },
                    { name: "Долг", color: "var(--seg-exp)", values: debtV, dashFrom: hist.length ? hist.length - 1 : 0 },
                  ]} />
                <div class="legend"><span><i class="line" style="background:var(--seg-civ)" />Свободные деньги</span><span><i class="line" style="background:var(--seg-exp)" />Долг</span><span><i class="dash" style="border-color:var(--muted)" />прогноз, если ничего не менять</span></div>
              </>
            ) : <Empty title="Данные появятся после первого месяца" />}
          </Card>

          <Card title="Выручка по сегментам" eyebrow="по месяцам">
            {segs.length ? <StackedBars data={segs} keys={SEGS} yFmt={rubShort} height={200} /> : <Empty title="Завершите первый месяц, чтобы увидеть выручку" />}
          </Card>
        </div>

        <div class="stack loose">
          <Card title={`Показатели правительства на ${yearOf(G.t)} год`} eyebrow="итоги подводятся в декабре">
            {kp.map((k) => (
              <div class="stack tight">
                <div class="row between"><span class="small">{k.name}</span><span class="small"><b>{k.text}</b> <span class="muted">цель {k.ttext}</span></span></div>
                <Bar value={Math.min(1, k.val)} tone={k.ok ? "ok" : "warn"} mark={k.target <= 1 ? k.target : null} thin />
              </div>
            ))}
            <span class="small muted">Выполненный показатель добавляет доверие государства, проваленный — отнимает. ГОЗ весит вдвое больше остальных.</span>
          </Card>

          {mr ? (
            <Card title={`Итоги: ${date(mr.t)}`} eyebrow="прошлый месяц">
              <dl class="kv">
                <dt>Выручка</dt><dd>{rub(mr.rev)}</dd>
                <dt>EBITDA</dt><dd>{rub(mr.ebitda)}</dd>
                <dt>Чистая прибыль</dt><dd class={mr.np >= 0 ? "" : "down"}>{rub(mr.np)}</dd>
                <dt>Изменение денег</dt><dd>{rub(mr.cash, { sign: true })}</dd>
                <dt>Простой мощностей</dt><dd>{rub(mr.idle)}</dd>
              </dl>
              {Object.keys(mr.delivered).length ? (
                <div class="stack tight">
                  <span class="eyebrow">Поставлено</span>
                  <div class="row wrap">{Object.entries(mr.delivered).map(([v, n]) => <span class="chip">{VAR[v].name} × {n}</span>)}</div>
                </div>
              ) : <span class="small muted">Поставок не было.</span>}
              {mr.rejects ? <St tone="warn">возвращено на доработку: {mr.rejects}</St> : null}
              {mr.noCash ? <St tone="crit">часть изделий не запущена — не хватило денег</St> : null}
            </Card>
          ) : null}

          <Card title="Лента событий" actions={<button class="btn sm ghost" onClick={() => go("journal")}>Весь журнал</button>} flush>
            {G.log.length ? <div class="log">{G.log.slice(-8).reverse().map((l) => <LogRow l={l} />)}</div> : <Empty title="Пока тихо" />}
          </Card>
        </div>
      </div>
    </>
  );
}

function Guide({ G }) {
  const seen = (G.settings.seen = G.settings.seen || {});
  const steps = [
    { id: "orders", text: "Откройте «Заказы» и принимайте проекты ГОЗ. Не успеваете — просите +6 месяцев, но не отказывайтесь: отказ снижает доверие.", done: seen.orders },
    { id: "prod", text: "Загляните в «Производство»: двигатели — главное узкое место, ВК-2500 нужны всем вертолётам.", done: seen.prod },
    { id: "rnd", text: "В «НИОКР» начните ВК-650В для «Ансата» (без него не хватит двигателей PW207K) и попросите субсидию. Затем SJ-100 и МС-21.", done: Object.values(G.rnd).some((r) => r.st === "active") },
    { id: "export", text: "В «Экспорте» подайте заявку на каждый тендер: цена около прейскуранта +10%, оплата по поставке, без рассрочки и госкредита.", done: G.tenders.some((T) => T.bid) },
    { id: "next", text: "Нажмите «Завершить месяц». Решения по событиям лучше принимать до конца следующего месяца.", done: G.t > 0 },
  ];
  return (
    <Card title="С чего начать" eyebrow="первые шаги" actions={<button class="btn sm ghost" onClick={() => { G.settings.hideGuide = true; update(); }}>Скрыть</button>}>
      <div class="stack tight">
        {steps.map((s, i) => (
          <div class="row top">
            <span style="margin-top:2px" class={s.done ? "up" : "muted"}><Ic n={s.done ? "check" : "info"} size={16} /></span>
            <span class={s.done ? "muted" : ""}>{i + 1}. {s.text}</span>
            {s.id !== "next" && !s.done ? <button class="btn xs" onClick={() => go(s.id)}>Открыть</button> : null}
          </div>
        ))}
      </div>
    </Card>
  );
}
