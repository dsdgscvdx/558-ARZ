/* Финансы: отчёт о прибылях и убытках, движение денег, баланс, кредиты и валюта, макроэкономика. */
import { useState } from "preact/hooks";
import { S, openModal, act, go } from "../store.js";
import { Card, Tabs, Tile, St, Empty, KV } from "../components.jsx";
import { LineChart, StackedBars } from "../charts.jsx";
import { rub, rubShort, money, num, pct, date, dateShort, dateCap, months } from "../fmt.js";
import { PL_NAMES, CF_NAMES, revenue, ebitda, pretax, netProfit, balance, debt, rating, loanOffers, repayLoan, convertFx, INR_DISCOUNT, sumCF, cfNet } from "../../sim/finance.js";
import { BANKS } from "../../data/scenario.js";
import { loanRate, CUR_NAME, rate } from "../../sim/macro.js";
import { setAutoFx } from "../../sim/actions.js";
import { getForecast } from "../sel.js";
import { sum, yearOf } from "../../sim/util.js";

const PL_ROWS = [
  ["revGoz", 1], ["revExp", 1], ["revCiv", 1], ["revSvc", 1], ["REV", 0], ["cogs", -1], ["idle", -1], ["pkg", -1], ["rnd", -1], ["sga", -1], ["pen", -1], ["proptax", -1], ["other", -1], ["otherInc", 1], ["EBITDA", 0],
  ["dep", -1], ["int", -1], ["intInc", 1], ["fxd", 1], ["PRETAX", 0], ["tax", -1], ["NP", 0],
];
const TOT = { REV: ["Выручка", revenue], EBITDA: ["EBITDA", ebitda], PRETAX: ["Прибыль до налога", pretax], NP: ["Чистая прибыль", netProfit] };

export function Finance({ G }) {
  const [tab, setTab] = useState(S.ui.params?.tab || "pl");
  return (
    <>
      <div class="screen-head">
        <div><h1>Финансы</h1><p>Выручка признаётся при поставке, авансы — обязательство до поставки. Авансы ГОЗ лежат на отдельных счетах и тратятся только на свои изделия. Свободные деньги приносят проценты по депозиту (ключевая − 2%), кредиты стоят ключевая + маржа.</p></div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: "pl", label: "Прибыли и убытки" }, { id: "cash", label: "Движение денег" }, { id: "balance", label: "Баланс" },
        { id: "loans", label: "Кредиты" }, { id: "fx", label: "Валюта" }, { id: "macro", label: "Экономика страны" },
      ]} />
      {tab === "pl" ? <PL G={G} /> : tab === "cash" ? <Cash G={G} /> : tab === "balance" ? <Balance G={G} /> : tab === "loans" ? <Loans G={G} /> : tab === "fx" ? <FX G={G} /> : <Macro G={G} />}
    </>
  );
}

function PL({ G }) {
  const years = Object.keys(G.pl.years).map(Number).sort((a, b) => b - a).slice(0, 3);
  const cols = [
    { name: "Прошлый месяц", p: G.pl.lastM },
    { name: `${yearOf(G.t)} с начала года`, p: G.pl.y },
    ...years.map((y) => ({ name: `${y} год`, p: G.pl.years[y] })),
  ].filter((c) => c.p);
  const yrs = Object.keys(G.pl.years).map(Number).sort((a, b) => a - b);
  const SEG = [{ id: "goz", name: "ГОЗ", color: "var(--seg-goz)" }, { id: "exp", name: "Экспорт", color: "var(--seg-exp)" }, { id: "civ", name: "Гражданская", color: "var(--seg-civ)" }, { id: "svc", name: "Сервис", color: "var(--seg-svc)" }];
  return (
    <div class="stack loose">
      {!cols.length || !G.hist.length ? <Card><Empty title="Отчёт появится после первого месяца" /></Card> : (
        <Card flush title="Отчёт о прибылях и убытках">
          <div class="tblwrap">
            <table class="tbl">
              <thead><tr><th>Статья</th>{cols.map((c) => <th class="r">{c.name}</th>)}</tr></thead>
              <tbody>
                {PL_ROWS.map(([k, sign]) => {
                  if (TOT[k]) return <tr class="total"><td>{TOT[k][0]}</td>{cols.map((c) => { const v = TOT[k][1](c.p); return <td class={`r${v < 0 ? " neg" : ""}`}>{rub(v)}</td>; })}</tr>;
                  if (cols.every((c) => !c.p[k])) return null;
                  return <tr><td class={sign < 0 ? "fg2" : ""}>{sign < 0 ? "− " : ""}{PL_NAMES[k]}</td>{cols.map((c) => <td class="r">{c.p[k] ? rub(sign < 0 ? c.p[k] : c.p[k]) : "—"}</td>)}</tr>;
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {yrs.length ? (
        <Card title="Выручка по годам">
          <StackedBars height={220} yFmt={rubShort} keys={SEG}
            data={yrs.map((y) => { const p = G.pl.years[y]; return { label: String(y), parts: { goz: p.revGoz, exp: p.revExp, civ: p.revCiv, svc: p.revSvc } }; })} />
          <div class="tblwrap">
            <table class="tbl">
              <thead><tr><th>Год</th><th class="r">Выручка</th><th class="r">EBITDA</th><th class="r">Чистая прибыль</th><th class="r">Рентабельность</th></tr></thead>
              <tbody>{yrs.map((y) => { const p = G.pl.years[y]; const r = revenue(p); return <tr><td>{y}</td><td class="r">{rub(r)}</td><td class="r">{rub(ebitda(p))}</td><td class={`r${netProfit(p) < 0 ? " neg" : ""}`}>{rub(netProfit(p))}</td><td class="r">{r ? pct(netProfit(p) / r, 1) : "—"}</td></tr>; })}</tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

const CF_IN = ["inGoz", "inExp", "inCiv", "inSvc", "inAdv", "intInc", "loansIn", "capIn"];
const CF_OUT = ["payroll", "materials", "overhead", "rnd", "capex", "maint", "interest", "taxes", "penalties", "sga", "other", "loansOut", "divs"];
function Cash({ G }) {
  const fc = getForecast(G);
  const last = G.cf.lastM;
  const h = G.hist.slice(-24);
  const labels = [...h.map((x) => dateShort(x.t)), ...fc.map((x) => dateShort(x.t))];
  return (
    <div class="stack loose">
      <div class="grid g2">
        <Card title="Деньги и прогноз" eyebrow="пунктир — если ничего не менять">
          {labels.length >= 2 ? (
            <>
              <LineChart labels={labels} height={220} yFmt={rubShort} tipFmt={rub} series={[
                { name: "Свободные деньги", color: "var(--seg-civ)", values: [...h.map((x) => x.cash), ...fc.map((x) => x.cash)], dashFrom: h.length ? h.length - 1 : 0, area: true },
                { name: "Целевые средства ГОЗ", color: "var(--seg-goz)", values: [...h.map((x) => x.restr), ...fc.map((x) => x.restr)], dashFrom: h.length ? h.length - 1 : 0 },
              ]} />
              <div class="legend"><span><i class="line" style="background:var(--seg-civ)" />Свободные деньги</span><span><i class="line" style="background:var(--seg-goz)" />Целевые средства ГОЗ</span></div>
            </>
          ) : <Empty title="История появится после первого месяца" />}
        </Card>
        <Card title="Прогноз на полгода" flush>
          {fc.length ? (
            <div class="tblwrap"><table class="tbl">
              <thead><tr><th>Месяц</th><th class="r">Деньги на конец</th><th class="r">Овердрафт</th><th class="r">Чистая прибыль</th></tr></thead>
              <tbody>{fc.map((x) => <tr><td>{date(x.t)}</td><td class="r">{rub(x.cash)}</td><td class={`r${x.od > 0 ? " neg" : ""}`}>{x.od > 0 ? rub(x.od) : "—"}</td><td class={`r${x.np < 0 ? " neg" : ""}`}>{rub(x.np)}</td></tr>)}</tbody>
            </table></div>
          ) : <Empty title="Прогноз недоступен" />}
        </Card>
      </div>
      <Card title="Движение свободных денег" flush>
        {last ? (
          <div class="tblwrap"><table class="tbl">
            <thead><tr><th>Статья</th><th class="r">Прошлый месяц</th><th class="r">С начала года</th></tr></thead>
            <tbody>
              <tr class="grp"><td colspan="3">Поступления</td></tr>
              {CF_IN.filter((k) => last[k] || G.cf.y[k]).map((k) => <tr><td>{CF_NAMES[k]}</td><td class="r">{rub(last[k])}</td><td class="r">{rub(G.cf.y[k])}</td></tr>)}
              <tr class="grp"><td colspan="3">Платежи</td></tr>
              {CF_OUT.filter((k) => last[k] || G.cf.y[k]).map((k) => <tr><td>{CF_NAMES[k]}</td><td class="r">{rub(-last[k])}</td><td class="r">{rub(-G.cf.y[k])}</td></tr>)}
              <tr class="total"><td>Итого изменение денег</td><td class="r">{rub(cfNet(last), { sign: true })}</td><td class="r">{rub(cfNet(G.cf.y), { sign: true })}</td></tr>
            </tbody>
          </table></div>
        ) : <Empty title="Данные появятся после первого месяца" />}
      </Card>
    </div>
  );
}

function Balance({ G }) {
  const b = balance(G);
  const eqCheck = G.equity0 + netProfit(G.pl.all) - G.stats.divs + G.stats.capIn;
  return (
    <div class="grid g2">
      <Card title="Активы" eyebrow={rub(b.assets)}>
        <KV rows={[
          ["Свободные деньги", rub(b.cash)], ["Целевые средства ГОЗ (отдельные счета)", rub(b.restr)], ["Валютные счета", rub(b.fx)], ["Дебиторская задолженность", rub(b.recv)],
          ["Незавершённое производство", rub(b.wip)], ["Готовая продукция и двигатели на складе", rub(b.stock)], ["Незавершённое строительство", rub(b.cip)], ["Основные фонды (остаточная стоимость)", rub(b.fa)],
        ]} />
      </Card>
      <Card title="Обязательства и капитал" eyebrow={rub(b.liab + b.equity)}>
        <KV rows={[["Кредиты", rub(b.loans)], ["Полученные авансы", rub(b.adv)], ["Собственный капитал", rub(b.equity)]]} />
        <p class="small muted">Собственный капитал = капитал на начало 2026 года ({rub(G.equity0)}) + накопленная чистая прибыль ({rub(netProfit(G.pl.all))}) − дивиденды ({rub(G.stats.divs)}) + взносы государства ({rub(G.stats.capIn)}) = {rub(eqCheck)}.</p>
      </Card>
    </div>
  );
}

function Loans({ G }) {
  const r = rating(G);
  const offers = loanOffers(G);
  return (
    <div class="stack loose">
      <div class="tiles">
        <Tile label="Долг" value={rub(debt(G))} sub={`проценты ≈ ${rub(sum(G.loans, (l) => (l.amt * loanRate(G, l)) / 1200))} в месяц`} />
        <Tile label="Чистый долг / EBITDA" value={r.e12 > 0 ? num(r.ratio, 1) : "—"} sub={`рейтинг ${r.code}: маржа банков ${num(r.spread, 2)}%`} />
        <Tile label="Можно занять" value={rub(r.limit)} sub={r.limit > 0 ? "без льготного кредита ГОЗ" : "банки не дают новых кредитов"} />
      </div>
      <Card title="Действующие кредиты" flush>
        {G.loans.length ? (
          <div class="tblwrap"><table class="tbl">
            <thead><tr><th>Банк</th><th class="r">Сумма</th><th class="r">Ставка</th><th class="r">Осталось</th><th class="r">Проценты в месяц</th><th></th></tr></thead>
            <tbody>{G.loans.map((l) => (
              <tr>
                <td><b>{BANKS[l.bank].name}</b><div class="sub">{l.kind === "goz" ? "льготный кредит под ГОЗ, фиксированная ставка" : l.kind === "state" ? "бюджетный кредит" : l.kind === "od" ? "овердрафт: ключевая + 6%" : `плавающая: ключевая + ${num(l.spread, 2)}%`}</div></td>
                <td class="r">{rub(l.amt)}</td><td class="r">{num(loanRate(G, l), 2)}%</td><td class="r">{l.kind === "od" ? "—" : months(l.left)}</td><td class="r">{rub((l.amt * loanRate(G, l)) / 1200)}</td>
                <td class="r"><button class="btn xs" disabled={G.cash <= 0} onClick={() => openModal("repay", { id: l.id })}>Погасить</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty title="Долгов нет" />}
      </Card>
      <Card title="Предложения банков" eyebrow={`ключевая ставка ЦБ ${num(G.m.key, 1)}%`} flush>
        {offers.length ? (
          <div class="tblwrap"><table class="tbl">
            <thead><tr><th>Банк</th><th>Срок</th><th class="r">Ставка сейчас</th><th class="r">Лимит</th><th></th></tr></thead>
            <tbody>{offers.map((o) => (
              <tr>
                <td><b>{BANKS[o.bank].name}</b><div class="sub">{o.kind === "goz" ? "льготный кредит под исполнение ГОЗ, фиксированная ставка" : `ключевая + ${num(o.spread, 2)}%, ставка меняется вместе с ключевой`}</div></td>
                <td>{months(o.term)}</td><td class="r">{num(o.rate, 2)}%</td><td class="r">{rub(o.max)}</td>
                <td class="r"><button class="btn xs primary" onClick={() => openModal("loan", { offer: o })}>Взять</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty title="Банки не готовы кредитовать">Слишком высокая долговая нагрузка. Снизьте долг или поднимите EBITDA.</Empty>}
      </Card>
    </div>
  );
}

function FX({ G }) {
  const curs = Object.entries(G.fx);
  return (
    <div class="stack loose">
      <Card title="Валютные счета">
        <label class="check"><input type="checkbox" checked={G.autoFx} onChange={(e) => act(setAutoFx)(e.currentTarget.checked)} id="autofx" />Сразу продавать валютную выручку (рупии — с дисконтом {pct(INR_DISCOUNT)})</label>
        <p class="small muted">Если выключить, {num(G.m.mandSale)}% выручки всё равно продаётся по закону об обязательной продаже, остальное копится на счетах. Рупии свободно не конвертируются: их можно продать только с дисконтом.</p>
        <div class="tblwrap"><table class="tbl">
          <thead><tr><th>Валюта</th><th class="r">Остаток</th><th class="r">Курс</th><th class="r">В рублях</th><th></th></tr></thead>
          <tbody>{curs.map(([c, a]) => (
            <tr><td>{CUR_NAME[c]}</td><td class="r">{money(c, a)}</td><td class="r">{num(rate(G, c), c === "INR" ? 3 : 2)} ₽</td><td class="r">{rub(a * rate(G, c))}</td>
              <td class="r"><button class="btn xs" disabled={a < 0.01} onClick={() => act(convertFx)(c, a)}>Продать всё</button></td></tr>
          ))}</tbody>
        </table></div>
      </Card>
    </div>
  );
}

function Macro({ G }) {
  const h = G.hist.slice(-60);
  const labels = h.map((x) => dateShort(x.t));
  const m = G.m;
  return (
    <div class="stack loose">
      <div class="tiles">
        <Tile label="Курс доллара" value={`${num(m.usd, 2)} ₽`} sub={`юань ${num(m.cny, 2)} ₽ · евро ${num(m.eur, 2)} ₽`} />
        <Tile label="Ключевая ставка" value={`${num(m.key, 1)}%`} sub="заседания ЦБ: фев, мар, апр, июн, июл, сен, окт, дек" />
        <Tile label="Инфляция" value={`${num(m.infl, 1)}%`} sub="годовая; индексирует материалы и зарплаты" />
        <Tile label="Нефть Urals" value={`$${num(m.oil, 1)}`} sub="от нее зависят бюджет ГОЗ и рубль" />
        <Tile label="Наценка на импортную ЭКБ" value={`+${pct(m.ekbPrem - 1)}`} sub={`санкционное давление ${num(m.sanc)} из 100`} />
        <Tile label="Рынок труда" value={m.labor >= 1 ? "нормальный" : m.labor >= 0.8 ? "дефицит кадров" : "острый дефицит"} sub={`индекс ${num(m.labor, 2)}; зарплаты в регионах ×${num(m.wageIdx, 2)} к 2026`} />
      </div>
      {h.length >= 2 ? (
        <div class="grid g2">
          <Card title="Курс доллара, ₽"><LineChart labels={labels} height={190} zero={false} yFmt={(v) => num(v)} tipFmt={(v) => `${num(v, 2)} ₽`} series={[{ name: "USD/RUB", color: "var(--seg-goz)", values: h.map((x) => x.usd) }]} /></Card>
          <Card title="Ключевая ставка и инфляция, %">
            <LineChart labels={labels} height={190} yFmt={(v) => num(v)} tipFmt={(v) => `${num(v, 1)}%`} series={[{ name: "Ключевая ставка", color: "var(--seg-exp)", values: h.map((x) => x.key) }, { name: "Инфляция", color: "var(--seg-civ)", values: h.map((x) => x.infl) }]} />
            <div class="legend"><span><i class="line" style="background:var(--seg-exp)" />Ключевая ставка</span><span><i class="line" style="background:var(--seg-civ)" />Инфляция</span></div>
          </Card>
          <Card title="Нефть Urals, $ за баррель"><LineChart labels={labels} height={190} zero={false} yFmt={(v) => num(v)} tipFmt={(v) => `$${num(v, 1)}`} series={[{ name: "Urals", color: "var(--seg-svc)", values: h.map((x) => x.oil) }]} /></Card>
          <Card title="Доверие государства и экспортная репутация">
            <LineChart labels={labels} height={190} yFmt={(v) => num(v)} series={[{ name: "Доверие", color: "var(--seg-goz)", values: h.map((x) => x.trust) }, { name: "Репутация", color: "var(--seg-exp)", values: h.map((x) => x.rep) }]} />
            <div class="legend"><span><i class="line" style="background:var(--seg-goz)" />Доверие государства</span><span><i class="line" style="background:var(--seg-exp)" />Экспортная репутация</span></div>
          </Card>
        </div>
      ) : <Card><Empty title="Графики появятся через пару месяцев" /></Card>}
    </div>
  );
}
export { go, sumCF };
