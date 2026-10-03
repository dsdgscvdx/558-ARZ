/* Модальные окна сделок: предложение ГОЗ/гражданское, контракт, экспортный тендер, страна-партнёр. */
import { useState } from "preact/hooks";
import { S, act, closeModal, openModal, replaceModal, update, toast } from "../store.js";
import { Modal, KV, St, Bar, Kind, Stepper, Slider, Seg, Empty } from "../components.jsx";
import { rub, usd, money, num, pct, date, months, dateCap } from "../fmt.js";
import { VAR, FAM, stdCost, techOf, eligibleVariants, unitOf, compsOf, compName } from "../../sim/catalog.js";
import { ENT } from "../../data/enterprises.js";
import { PARTNER } from "../../data/partners.js";
import { COUNTRIES, TCATS } from "../../data/competitors.js";
import { clientName, feasibility, acceptOffer, declineOffer, negotiate, negotiateChance, remaining } from "../../sim/contracts.js";
import { odds, shownOdds, submitBid, buyIntel, INTEL_COST, ourList, compById, sendDelegation, DELEGATION_COST } from "../../sim/tenders.js";
import { setPrio, setHold, cancelContract } from "../../sim/actions.js";
import { rate } from "../../sim/macro.js";
import { clamp, sum } from "../../sim/util.js";
import { pkgShare } from "../../sim/state.js";

/* ───────── предложение ───────── */
export function OfferModal({ id, decline }) {
  const G = S.G;
  const o = G.offers.find((x) => x.id === id);
  const [confirmDecline, setConfirmDecline] = useState(!!decline);
  if (!o) return <Modal title="Предложение больше не действует"><Empty title="Его уже приняли, отклонили или срок ответа истёк" /></Modal>;
  const v = VAR[o.v], f = FAM[v.fam];
  const fz = feasibility(G, o);
  const cost = stdCost(G, o.v);
  const m = o.price / cost - 1;
  const total = o.price * o.qty;
  const trustLoss = clamp(1 + total / 50000, 1, 5);
  const engines = Object.entries(compsOf(G, o.v));
  return (
    <Modal eyebrow={o.kind === "goz" ? "проект контракта ГОЗ" : "гражданский заказ"} title={`${v.name} × ${num(o.qty)}`} footer={
      confirmDecline ? (
        <><span class="small grow">Отказ от ГОЗ снизит доверие государства на {num(trustLoss, 1)}.</span><button class="btn" onClick={() => setConfirmDecline(false)}>Не отказываться</button><button class="btn danger" onClick={() => { act(declineOffer)(o.id); closeModal(); }}>Отказаться</button></>
      ) : (
        <><button class="btn ghost" onClick={() => (o.kind === "goz" ? setConfirmDecline(true) : (act(declineOffer)(o.id), closeModal()))}>Отказаться</button><button class="btn primary" onClick={() => { act(acceptOffer)(o.id); closeModal(); toast(`Контракт подписан: ${v.name} × ${o.qty}`, "ok"); }}>Подписать контракт</button></>
      )}>
      <div class="row wrap"><Kind k={o.kind} /><span class="fg2">{clientName(o)}</span>{o.urgent ? <St tone="warn">срочный заказ</St> : null}</div>
      <div class="grid g2">
        <KV rows={[
          ["Цена за единицу", rub(o.price)], ["Сумма контракта", rub(total)], ["Аванс", `${pct(o.adv)} · ${rub(total * o.adv)}`],
          ["Куда пойдёт аванс", o.kind === "goz" ? "на отдельный счёт" : "свободные деньги"], ["Срок поставки", `${date(o.due)} (через ${months(o.due - G.t)})`],
        ]} />
        <KV rows={[
          ["Нормативная себестоимость", rub(cost)], ["Рентабельность", pct(m, 1)], ["Завод", `${ENT[f.ent].short}`],
          ["Цикл изготовления", months(v.cycle)], ["Двигатели", engines.length ? engines.map(([k, n]) => `${n} × ${compName(k)}`).join(", ") : "свои / покупные"],
        ]} />
      </div>
      <div class="stack tight">
        <span class="eyebrow">Успеем ли</span>
        {fz.short ? <St tone="crit">нет двигателей: {compName(fz.short.id)} — свободно {fz.short.free} из нужных {fz.short.need}. Нужна НИОКР по замене двигателя.</St> : fz.ok ? <St tone="ok">да: при нынешней загрузке около {months(fz.months)}</St> : <St tone="crit">нет: понадобится около {months(fz.months)}, а до срока {months(o.due - G.t)}</St>}
        <span class="small muted">На линии уже заказано {num(fz.backlog)} ед. этого семейства. Предел линии ≈ {num(fz.slotRate, 1)} ед. в месяц, людей хватает на ≈ {num(fz.laborRate, 1)}. Можно расширить линию или нанять людей — см. «Предприятия».</span>
      </div>
      {o.kind === "goz" ? (
        <div class="stack tight">
          <span class="eyebrow">Переговоры с заказчиком</span>
          <div class="row wrap">
            <button class="btn sm" disabled={o.neg.price} onClick={() => { const ok = act(negotiate)(o.id, "price"); toast(ok ? "Цена повышена на 5%" : "Минобороны отказало в повышении цены", ok ? "ok" : "warn"); }}>Просить +5% к цене · шанс {pct(negotiateChance(G, "price"))}</button>
            <button class="btn sm" disabled={o.neg.time} onClick={() => { const ok = act(negotiate)(o.id, "time"); toast(ok ? "Срок продлён на полгода" : "Минобороны отказало в переносе срока", ok ? "ok" : "warn"); }}>Просить +6 месяцев · шанс {pct(negotiateChance(G, "time"))}</button>
          </div>
          <span class="small muted">Каждую просьбу можно сделать один раз. Отказ немного снижает доверие. Без ответа до {date(o.exp)} контракт подписывается на условиях заказчика.</span>
        </div>
      ) : <span class="small muted">Предложение действует до {date(o.exp)}.</span>}
    </Modal>
  );
}

/* ───────── контракт ───────── */
export function ContractModal({ id }) {
  const G = S.G;
  const c = G.contracts.find((x) => x.id === id);
  const [confirmCancel, setConfirmCancel] = useState(false);
  if (!c) return <Modal title="Контракт не найден"><Empty title="Запись удалена из архива" /></Modal>;
  const r = rate(G, c.cur);
  const rem = c.qty - c.done;
  const stock = c.v ? G.stock[c.v]?.n || 0 : 0;
  let inWork = 0, waiting = 0;
  if (c.v) for (const e of Object.values(G.ents)) for (const l of e.lines) for (const u of l.wip) if (u.v === c.v) { inWork++; if (u.w) waiting++; }
  const recv = sum(c.recv, (x) => x.amt);
  const isSvc = c.kind === "svc";
  const fine = 0.05 * rem * c.price * r;
  return (
    <Modal eyebrow={c.no} title={isSvc ? `Сервис парка — ${clientName(c)}` : `${VAR[c.v].name} × ${num(c.qty)}`} footer={
      c.status === "active" && !isSvc ? (confirmCancel ? (
        <><span class="small grow">Вернём аванс {rub(c.advLeft)} и заплатим неустойку {rub(fine)}.{c.kind === "exp" ? " Отношения и репутация упадут." : ""}</span><button class="btn" onClick={() => setConfirmCancel(false)}>Не расторгать</button><button class="btn danger" onClick={() => { act(cancelContract)(c.id); closeModal(); }}>Расторгнуть</button></>
      ) : (
        <>
          {c.kind !== "goz" ? <button class="btn ghost danger" onClick={() => setConfirmCancel(true)}>Расторгнуть</button> : null}
          {c.kind !== "goz" ? <button class="btn" onClick={() => act(setHold)(c.id, !c.hold)}>{c.hold ? "Возобновить поставки" : "Приостановить поставки"}</button> : null}
          <button class={`btn ${c.prio ? "" : "primary"}`} onClick={() => act(setPrio)(c.id, c.prio ? 0 : 1)}>{c.prio ? "Снять приоритет" : "Поставлять в первую очередь"}</button>
        </>
      )) : null}>
      <div class="row wrap"><Kind k={c.kind} /><span class="fg2">{clientName(c)}</span>{c.status === "done" ? <St tone="ok">исполнен</St> : c.status === "cancelled" ? <St tone="crit">расторгнут</St> : c.late ? <St tone="crit">просрочка {months(c.late)}</St> : <St tone="info">в работе</St>}</div>
      {!isSvc ? (
        <>
          <div class="stack tight">
            <div class="row between small"><span>Поставлено {num(c.done)} из {num(c.qty)} {unitOf(c.v)}</span><span class="muted">на складе {stock} · в работе {inWork}{waiting ? ` (ждут двигателей ${waiting})` : ""}</span></div>
            <Bar value={c.done} max={c.qty} tone={c.late ? "crit" : "ok"} />
          </div>
          <div class="grid g2">
            <KV rows={[
              ["Цена за единицу", `${money(c.cur, c.price)}${c.cur !== "RUB" ? ` ≈ ${rub(c.price * r)}` : ""}`], ["Сумма", money(c.cur, c.price * c.qty)], ["Срок", `${date(c.due)}`],
              ["Подписан", c.t0 >= 0 ? dateCap(c.t0) : "до 2026 года"],
              c.kind === "exp" ? ["Сопровождение и комиссия", pct(c.pkg + c.offset * 0.5)] : null,
              c.offset ? ["Офсет", pct(c.offset)] : null, c.fin && c.fin !== "none" ? ["Финансирование", c.fin === "state" ? "госкредит РФ" : "рассрочка от производителя"] : null,
            ]} />
            <KV rows={[
              ["Аванс получен", money(c.cur, c.adv)], ["Аванс ещё не зачтён", rub(c.advLeft)], c.kind === "goz" ? ["На отдельном счёте", rub(c.restr)] : null,
              ["Ждём оплаты", recv ? money(c.cur, recv) : "—"], ["Выручка по контракту", rub(c.rev)], ["Себестоимость поставленного", rub(c.cost)], ["Неустойки", c.pen ? rub(c.pen) : "—"],
            ]} />
          </div>
          {c.status === "active" && c.kind === "goz" ? <p class="small muted">Изделия по контракту запускаются и поставляются автоматически, в порядке сроков. Приоритет ставит этот контракт первым при распределении готовых изделий со склада.</p> : null}
        </>
      ) : (
        <KV rows={[["Годовая сумма", `${money(c.cur, c.price)} ≈ ${rub(c.price * r)}`], ["Прошло месяцев", `${c.done} из ${c.qty}`], ["Выручка", rub(c.rev)], ["Затраты", rub(c.cost)]]} />
      )}
    </Modal>
  );
}

/* ───────── экспортный тендер ───────── */
export function TenderModal({ id }) {
  const G = S.G;
  const T = G.tenders.find((x) => x.id === id);
  const P = T ? PARTNER[T.partner] : null;
  const vs = T ? eligibleVariants(G, T.tcat, P) : [];
  const init = T && T.bid ? T.bid : { v: vs[0], price: vs[0] ? ourList(G, T, vs[0]) : 0, fin: "none", offset: 0, svc: false, ins: false, months: T ? T.months : 24 };
  const [bid, setBid] = useState(init);
  if (!T) return <Modal title="Тендер завершён"><Empty title="Итоги — в журнале" /></Modal>;
  const set = (k, val) => setBid({ ...bid, [k]: val });
  const open = T.status === "open";
  const csto = P.csto;
  const list = bid.v ? ourList(G, T, bid.v) : 0;
  const so = bid.v ? shownOdds(G, T, bid) : null;
  const cost = bid.v ? stdCost(G, bid.v) : 0;
  const v = bid.v ? VAR[bid.v] : null;
  const pkg = v ? pkgShare(v, P) : 0;
  const priceRub = csto ? bid.price : bid.price * G.m.usd;
  const net = priceRub * (1 - pkg - bid.offset * 0.5);
  const margin = cost ? net / cost - 1 : 0;
  const total = priceRub * T.qty;
  const lo = Math.max(0.1, list * 0.6), hi = list * 1.4;
  const stepP = csto ? Math.max(1, Math.round(list / 200)) : list >= 100 ? 1 : list >= 10 ? 0.1 : 0.01;
  const fmtP = (x) => (csto ? rub(x) : usd(x));
  const pp = G.partners[P.id];
  const competitors = T.comp.map((c) => ({ ...c, C: compById(c.id) }));
  const ox = so ? so.o : null;
  return (
    <Modal size="wide" eyebrow={`${P.name} · ${TCATS[T.tcat].name}`} title={`${T.direct ? "Прямой запрос" : "Тендер"}: ${num(T.qty)} ед., решение ${date(T.close)}`} footer={open ? (
      <>
        {T.bid ? <button class="btn ghost" onClick={() => { act(submitBid)(T.id, null); toast("Заявка отозвана", "info"); }}>Отозвать заявку</button> : null}
        {!T.intel ? <button class="btn" onClick={() => act(buyIntel)(T.id)}>Анализ рынка · {rub(INTEL_COST)}</button> : null}
        <button class="btn primary" disabled={!bid.v} onClick={() => { act(submitBid)(T.id, bid); closeModal(); toast(`Заявка подана: ${P.name}, ${VAR[bid.v].name}`, "ok"); }}>{T.bid ? "Обновить заявку" : "Подать заявку"}</button>
      </>
    ) : null}>
      <div class="grid g2">
        <div class="stack">
          <KV rows={[
            ["Объём", `${num(T.qty)} ед.`], ["Бюджет заказчика", `≈ ${usd(T.budget)}`], ["Нужна поставка за", months(T.months)],
            ["Отношения", `${Math.round(pp.rel)} из 100`], ["Риск санкций США", P.caatsa >= 0.7 ? "высокий" : P.caatsa >= 0.4 ? "средний" : "низкий"],
            ["Расчёты", csto ? "в рублях по внутренним ценам (ОДКБ)" : P.cur], ["Платёжная дисциплина", P.pay >= 0.85 ? "хорошая" : P.pay >= 0.65 ? "задержки" : "плохая"],
          ]} />
          <div class="stack tight">
            <span class="eyebrow">{T.direct ? "Конкурентов нет" : "Конкуренты"}</span>
            {competitors.map((c) => (
              <div class="row between small">
                <span><b>{c.C.name}</b> <span class="muted">{c.C.maker}, {COUNTRIES[c.C.c]} · оценка {c.C.tech}</span></span>
                <span class="nowrap">{T.intel ? `${usd(c.price)}${c.fin === "state" ? " · кредит" : ""}${c.offset ? ` · офсет ${pct(c.offset)}` : ""}` : `≈ ${usd(c.C.usd * G.m.usdInfl)}`}</span>
              </div>
            ))}
            {!T.intel ? <span class="small muted">Без анализа рынка видны только прейскурантные цены конкурентов, а наши шансы — с погрешностью.</span> : null}
          </div>
          {T.status !== "open" ? <St tone={T.status === "won" ? "ok" : T.status === "lost" ? "warn" : "neutral"}>{T.status === "won" ? "Мы победили" : T.status === "lost" ? `Победил ${compById(T.winner).name}` : "Конкурс отменён"}</St> : null}
        </div>
        <div class="stack">
          {!vs.length ? <Empty title="Нам нечего предложить в этой категории">Нужна НИОКР или экспортная модификация.</Empty> : (
            <>
              <label class="field"><span>Что предлагаем</span>
                <select class="input" id="bidv" value={bid.v} disabled={!open} onChange={(e) => { const nv = e.currentTarget.value; setBid({ ...bid, v: nv, price: ourList(G, T, nv) }); }}>
                  {vs.map((x) => <option value={x}>{VAR[x].name} — оценка {techOf(G, x)}</option>)}
                </select>
              </label>
              <Slider id="bidprice" label={`Цена за единицу (прейскурант ${fmtP(list)})`} value={bid.price} min={lo} max={hi} step={stepP} fmt={fmtP} onInput={(x) => set("price", x)} />
              <div class="field"><span>Финансирование</span>
                <Seg items={[{ id: "none", label: "Оплата по поставке" }, { id: "vendor", label: "Рассрочка" }, { id: "state", label: "Госкредит РФ" }]} value={bid.fin} onChange={(x) => open && set("fin", x)} />
                <span class="small muted">{bid.fin === "state" ? "Платит бюджет России, нам — вовремя. Доверие государства −1,5 при победе." : bid.fin === "vendor" ? "Аванс 10%, оплата поставок через 1,5 года — деньги придут позже." : "Обычные условия: аванс и оплата поставок."}</span>
              </div>
              <Slider id="bidoff" label="Офсет и локализация" value={bid.offset} min={0} max={0.5} step={0.05} fmt={(x) => pct(x)} onInput={(x) => open && set("offset", x)} hint={`Заказчик ценит офсеты ${P.offset >= 0.6 ? "очень высоко" : P.offset >= 0.3 ? "умеренно" : "мало"}. Половина офсета — наши расходы.`} />
              <div class="row wrap">
                <label class="check"><input type="checkbox" id="bidsvc" checked={bid.svc} disabled={!open} onChange={(e) => set("svc", e.currentTarget.checked)} />Пакет послепродажного обслуживания</label>
                <label class="check"><input type="checkbox" id="bidins" checked={bid.ins} disabled={!open} onChange={(e) => set("ins", e.currentTarget.checked)} />Страховка ЭКСАР (2,5%)</label>
              </div>
              <div class="field"><span>Обещанный срок поставки</span><Stepper value={bid.months} min={6} max={60} onChange={(x) => open && set("months", x)} fmt={(x) => `${x} мес.`} label="Срок поставки" /></div>
              <div class="card" style="padding:12px 14px;background:var(--surface-2)">
                <div class="row between"><span class="eyebrow">Шансы на победу</span><b style="font-size:20px">{so.exact ? "" : "≈ "}{pct(so.p)}</b></div>
                <Bar value={so.p} tone={so.p >= 0.5 ? "ok" : so.p >= 0.25 ? "warn" : "crit"} />
                {ox ? <div class="small muted" style="margin-top:6px">{T.intel ? ox.list.filter((x) => x.id !== "us").map((x) => `${compById(x.id).name} ${pct(x.p)}`).join(" · ") + ` · отмена конкурса ${pct(ox.none)}` : "Точные шансы конкурентов покажет анализ рынка."}</div> : null}
                <div class="kv small" style="margin-top:8px">
                  <dt>Контракт</dt><dd>{rub(total)}{total / G.m.usd > T.budget ? " — выше бюджета заказчика!" : ""}</dd>
                  <dt>Себестоимость единицы</dt><dd>{rub(cost)}</dd>
                  <dt>Нам после сопровождения и офсета</dt><dd>{rub(net)}</dd>
                  <dt>Рентабельность</dt><dd class={margin < 0 ? "down" : margin > 0.3 ? "up" : ""}>{pct(margin)}</dd>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ───────── страна-партнёр ───────── */
export function PartnerModal({ id }) {
  const G = S.G;
  const P = PARTNER[id], pp = G.partners[id];
  const contracts = G.contracts.filter((c) => c.client === id && c.status === "active");
  const tenders = G.tenders.filter((T) => T.partner === id && T.status === "open");
  const fleet = Object.entries(pp.fleet).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const prefs = Object.entries(pp.pref).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const canDeleg = !(pp.deleg > G.t);
  return (
    <Modal size="wide" eyebrow={`${P.capital} · расчёты: ${P.cur === "RUB" ? "рубли" : P.cur}`} title={P.name} footer={
      <button class="btn primary" disabled={!canDeleg} onClick={() => act(sendDelegation)(id)}>{canDeleg ? `Отправить делегацию · ${rub(DELEGATION_COST * G.m.cpi)}` : `Следующая делегация через ${pp.deleg - G.t} мес.`}</button>}>
      <p class="fg2">{P.note}</p>
      <div class="grid g3">
        <div class="stack tight"><span class="eyebrow">Отношения</span><b style="font-size:20px">{Math.round(pp.rel)}</b><Bar value={pp.rel} max={100} tone={pp.rel >= 65 ? "ok" : pp.rel >= 40 ? "warn" : "crit"} thin /></div>
        <div class="stack tight"><span class="eyebrow">Бюджет на импорт</span><b style="font-size:20px">{usd(P.budget * 1000)}</b><span class="small muted">в год</span></div>
        <div class="stack tight"><span class="eyebrow">Риск санкций США</span><b style="font-size:20px">{P.caatsa >= 0.7 ? "высокий" : P.caatsa >= 0.4 ? "средний" : "низкий"}</b><span class="small muted">{P.csto ? "член ОДКБ" : ""}</span></div>
      </div>
      <div class="grid g2">
        <div class="stack tight">
          <span class="eyebrow">У кого готовы покупать</span>
          {prefs.map(([c, v]) => <div class="row"><span class="small" style="width:110px">{COUNTRIES[c]}</span><div class="grow"><Bar value={v} max={1} tone={c === "ru" ? "acc" : ""} thin /></div></div>)}
          <span class="eyebrow" style="margin-top:8px">Что закупают</span>
          <div class="row wrap">{Object.keys(P.needs).map((k) => <span class="chip">{TCATS[k]?.name || k}</span>)}</div>
        </div>
        <div class="stack tight">
          <span class="eyebrow">Наша техника в эксплуатации</span>
          {fleet.length ? <div class="row wrap">{fleet.map(([f, n]) => <span class="chip">{FAM[f]?.name || f} — {num(n)}</span>)}</div> : <span class="small muted">нет</span>}
          <span class="eyebrow" style="margin-top:8px">На вооружении</span>
          <span class="small fg2">{P.fleet.join(", ")}</span>
        </div>
      </div>
      {contracts.length || tenders.length ? (
        <div class="stack tight">
          <span class="eyebrow">Сделки</span>
          {tenders.map((T) => <button class="btn sm" style="justify-content:space-between" onClick={() => replaceModal("tender", { id: T.id })}><span>Тендер: {TCATS[T.tcat].name.toLowerCase()}, {T.qty} ед.</span><span>{T.bid ? "заявка подана" : "без заявки"}</span></button>)}
          {contracts.map((c) => <button class="btn sm" style="justify-content:space-between" onClick={() => replaceModal("contract", { id: c.id })}><span>{c.v ? `${VAR[c.v].name} × ${c.qty}` : "Сервис парка"}</span><span>{c.v ? `${c.done}/${c.qty}` : `${c.done}/12 мес.`}</span></button>)}
        </div>
      ) : null}
    </Modal>
  );
}
export { openModal, update, remaining };
