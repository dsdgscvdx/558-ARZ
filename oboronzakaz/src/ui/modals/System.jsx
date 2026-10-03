/* Системные окна: события, годовой отчёт, конец игры, меню и сохранения, вступление, справка, кредиты. */
import { useState } from "preact/hooks";
import { S, act, closeModal, openModal, replaceModal, update, toast, saveSlot, loadSlot, slotMeta, SLOTS, exportCode, importCode, applyTheme, savedTheme, closeAll } from "../store.js";
import { Modal, KV, St, Bar, Slider, Seg, Empty } from "../components.jsx";
import { rub, num, pct, date, dateCap, months } from "../fmt.js";
import { resolveEvent } from "../../sim/events.js";
import { takeLoan, repayLoan, revenue, netProfit, ebitda } from "../../sim/finance.js";
import { BANKS } from "../../data/scenario.js";
import { DIFFS } from "../../sim/state.js";
import { runMonth } from "../App.jsx";

export function EventModal({ id }) {
  const G = S.G;
  const ev = G.ev.queue.find((x) => x.id === id) || G.ev.queue[0];
  if (!ev) return <Modal title="Решений не требуется"><Empty title="Все события разобраны" /></Modal>;
  const left = G.ev.queue.length - 1;
  const choose = (i) => {
    resolveEvent(G, ev.id, i);
    S.ui.modals.pop();
    if (G.ev.queue.length) S.ui.modals.push({ type: "event", props: { id: G.ev.queue[0].id }, id: Math.random().toString(36).slice(2) });
    update();
  };
  return (
    <Modal eyebrow={`событие · ${date(ev.t)}${left ? ` · ещё ${left}` : ""}`} title={ev.title} icon="flag" size="narrow">
      <p class="fg2" style="line-height:1.55">{ev.text}</p>
      <div class="stack tight">
        {ev.choices.map((c, i) => (
          <button class={`choice${i === ev.def ? " def" : ""}`} onClick={() => choose(i)}>
            <b>{c.label}</b>
            {c.hint ? <span>{c.hint}</span> : null}
            {i === ev.def && ev.choices.length > 1 ? <span>выберется само, если не ответить до конца месяца</span> : null}
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function ConfirmNextModal() {
  const G = S.G;
  return (
    <Modal title="Остались нерешённые события" size="narrow" footer={<><button class="btn" onClick={() => replaceModal("event", { id: G.ev.queue[0].id })}>Решить сейчас</button><button class="btn primary" onClick={() => { closeModal(); runMonth(); }}>Завершить месяц</button></>}>
      <p>По этим событиям будет выбран вариант по умолчанию:</p>
      <ul class="stack tight" style="margin:0;padding-left:18px">{G.ev.queue.map((e) => <li>{e.title} — <span class="muted">{e.choices[e.def]?.label}</span></li>)}</ul>
    </Modal>
  );
}

export function YearModal() {
  const G = S.G;
  const R = G.lastReport;
  if (!R) return null;
  const close = () => { R.seen = true; closeModal(); if (G.ev.queue.length) openModal("event", { id: G.ev.queue[0].id }); };
  return (
    <Modal eyebrow="итоги года" title={`${R.year} год`} onClose={close} footer={<button class="btn primary" onClick={close}>Принято</button>}>
      <div class="tiles">
        <div class="tile"><span class="eyebrow">Выручка</span><span class="v">{rub(R.rev)}</span></div>
        <div class="tile"><span class="eyebrow">EBITDA</span><span class="v">{rub(R.ebitda)}</span></div>
        <div class="tile"><span class="eyebrow">Чистая прибыль</span><span class={`v ${R.np < 0 ? "down" : ""}`}>{rub(R.np)}</span></div>
        <div class="tile"><span class="eyebrow">Долг на конец года</span><span class="v">{rub(R.debt)}</span></div>
      </div>
      <div class="stack tight">
        <span class="eyebrow">Показатели правительства</span>
        {R.kpis.map((k) => (
          <div class="row between">
            <span class="row">{k.ok ? <St tone="ok">выполнено</St> : <St tone="crit">не выполнено</St>}<span>{k.name}</span></span>
            <span class="small"><b>{k.actual}</b> <span class="muted">цель {k.target} · доверие {k.dt > 0 ? "+" : ""}{num(k.dt, 1)}</span></span>
          </div>
        ))}
      </div>
      <p class={R.dt >= 0 ? "" : "down"}>Итого доверие государства {R.dt >= 0 ? "+" : ""}{num(R.dt, 1)}. Сейчас — {Math.round(G.trust)} из 100.</p>
    </Modal>
  );
}

export function OverModal() {
  const G = S.G;
  const o = G.over;
  if (!o) return null;
  const sc = o.kind === "final" ? o.score : null;
  return (
    <Modal eyebrow={o.kind === "final" ? "декабрь 2035 года" : dateCap(o.t)} title={o.kind === "final" ? "Итоги десяти лет" : o.kind === "fired" ? "Отставка" : "Банкротство"} footer={
      <>
        <button class="btn" onClick={() => { S.G = null; closeAll(); }}>В главное меню</button>
        {o.kind === "final" ? <button class="btn primary" onClick={() => { o.cont = true; G.over = { ...o, kind: "final", cont: true }; closeModal(); }}>Продолжить управлять</button> : null}
      </>
    }>
      {sc ? (
        <>
          <div class="doc">
            <span class="doc-t">Оценка правительства</span>
            <p style="font-size:30px;font-family:var(--f-display);font-weight:600;text-align:center">{num(sc.total, 1)} из 100</p>
            <p style="text-align:center"><b>{sc.title}</b></p>
          </div>
          <div class="stack tight">
            {sc.parts.map((p) => <div class="stack tight"><div class="row between small"><span>{p.name} <span class="muted">· вес {p.w}%</span></span><b>{num(p.v)}</b></div><Bar value={p.v} max={100} tone={p.v >= 70 ? "ok" : p.v >= 40 ? "warn" : "crit"} thin /></div>)}
          </div>
          <p class="small muted">Чистая прибыль за 10 лет в ценах 2026 года: {rub(sc.npReal)}. Можно продолжать игру без ограничения срока.</p>
        </>
      ) : <p class="fg2" style="line-height:1.55">{o.text}</p>}
    </Modal>
  );
}

export function MenuModal() {
  const G = S.G;
  const [code, setCode] = useState("");
  const [theme, setTheme] = useState(savedTheme());
  const [confirmNew, setConfirmNew] = useState(false);
  const [, force] = useState(0);
  return (
    <Modal title="Меню" size="narrow" footer={confirmNew ? (
      <><span class="small grow">Текущая партия останется в автосохранении до следующего месяца новой игры.</span><button class="btn" onClick={() => setConfirmNew(false)}>Отмена</button><button class="btn danger" onClick={() => { S.G = null; closeAll(); }}>Выйти в главное меню</button></>
    ) : <button class="btn" onClick={() => setConfirmNew(true)}>Выйти в главное меню</button>}>
      {G ? <p class="small muted">{G.player.name} · {G.player.holding} · {DIFFS[G.diff]?.name.toLowerCase()} уровень · {dateCap(G.t)}</p> : null}
      <div class="stack tight">
        <span class="eyebrow">Сохранить и загрузить</span>
        {SLOTS.filter((s) => s !== "auto").map((s) => {
          const m = slotMeta(s);
          return (
            <div class="row between">
              <span class="small">Ячейка {s}: {m ? `${dateCap(m.t)} · ${m.name}` : <span class="muted">пусто</span>}</span>
              <span class="row">
                <button class="btn xs" disabled={!G} onClick={() => { if (saveSlot(s)) toast(`Сохранено в ячейку ${s}`, "ok"); else toast("Браузер не дал сохранить. Используйте код сохранения.", "warn"); force((x) => x + 1); }}>Сохранить</button>
                <button class="btn xs" disabled={!m} onClick={() => { try { const g = loadSlot(s); if (g) { S.G = g; closeAll(); toast("Загружено", "ok"); } } catch (e) { toast(e.message, "crit"); } }}>Загрузить</button>
              </span>
            </div>
          );
        })}
        <span class="small muted">Автосохранение — после каждого месяца.</span>
      </div>
      <div class="stack tight">
        <span class="eyebrow">Код сохранения</span>
        <span class="small muted">Перенос партии на другое устройство или в другой браузер: скопируйте код и вставьте его там через «Ввести код сохранения».</span>
        <div class="row wrap">
          <button class="btn sm" disabled={!G} onClick={async () => { const c = await exportCode(G); setCode(c); try { await navigator.clipboard.writeText(c); toast("Код скопирован", "ok"); } catch (e) { toast("Скопируйте код из поля вручную", "info"); } }}>Получить код</button>
          <button class="btn sm" onClick={() => replaceModal("import")}>Ввести код</button>
        </div>
        {code ? <textarea class="input" id="savecode" readOnly value={code} onFocus={(e) => e.currentTarget.select()} /> : null}
      </div>
      <div class="row between">
        <span class="small muted">Тема</span>
        <Seg items={[{ id: "system", label: "Как в системе" }, { id: "dark", label: "Тёмная" }, { id: "light", label: "Светлая" }]} value={theme} onChange={(v) => { setTheme(v); applyTheme(v); }} />
      </div>
      <button class="btn sm" onClick={() => replaceModal("help")}>Как играть</button>
    </Modal>
  );
}

export function ImportModal() {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  return (
    <Modal title="Ввести код сохранения" size="narrow" footer={<button class="btn primary" disabled={!code.trim()} onClick={async () => { try { const g = await importCode(code); S.G = g; closeAll(); toast("Партия загружена", "ok"); } catch (e) { setErr(e.message || "Код не распознан"); } }}>Загрузить партию</button>}>
      <textarea class="input" id="importcode" placeholder="Вставьте код, который начинается с OZ1: или OZ0:" value={code} onInput={(e) => { setCode(e.currentTarget.value); setErr(""); }} />
      {err ? <St tone="crit">{err}</St> : null}
    </Modal>
  );
}

export function IntroModal() {
  const G = S.G;
  return (
    <Modal eyebrow="январь 2026 года" title="Назначение" size="wide" footer={<button class="btn primary big" onClick={() => closeModal()}>Приступить к работе</button>}>
      <div class="doc">
        <span class="doc-t">Протокол заседания наблюдательного совета № 1/2026</span>
        <p>Назначить <b>{G.player.name}</b> генеральным директором «{G.player.holding}» — холдинга, объединяющего 26 ведущих предприятий оборонно-промышленного комплекса: от Комсомольского-на-Амуре авиазавода до Адмиралтейских верфей.</p>
        <p>Поручить в 2026–2035 годах: выполнять государственный оборонный заказ в срок, наращивать экспорт вооружений, ежегодно повышать долю гражданской продукции и удерживать долговую нагрузку в пределах четырёх годовых EBITDA.</p>
        <span class="stamp">Для служебного пользования</span>
      </div>
      <div class="grid g2">
        <div class="stack tight">
          <span class="eyebrow">Положение на начало года</span>
          <ul class="stack tight small" style="margin:0;padding-left:18px">
            <li>Портфель ГОЗ — многолетние контракты по ценам «затраты плюс»: рентабельность 4–7%, инфляция её съедает.</li>
            <li>Выгоднее всего экспорт: Индия ждёт последние дивизионы С-400, Алжир — Су-57Э и Су-35.</li>
            <li>Ключевая ставка 16%: кредиты дороги, зато свободные деньги приносят проценты.</li>
            <li>SJ-100 и МС-21 «Аэрофлоту» ещё не сертифицированы — нужна НИОКР, иначе неустойки.</li>
            <li>Двигатели — узкое место: без АЛ-41Ф1С и ВК-2500 самолёты и вертолёты стоят недоделанными.</li>
          </ul>
        </div>
        <div class="stack tight">
          <span class="eyebrow">Как идёт ход</span>
          <ul class="stack tight small" style="margin:0;padding-left:18px">
            <li>Один ход — один месяц. Принимайте решения, затем нажмите «Завершить месяц».</li>
            <li>Заводы сами запускают изделия под контракты, пока хватает людей, мест и денег.</li>
            <li>Ваши рычаги: какие заказы брать, по какой цене идти в тендеры, кого нанимать и сколько платить, во что вкладывать и где брать деньги.</li>
            <li>Доверие государства упадёт до нуля — отставка. Три месяца без денег на зарплату — тоже.</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
}

export function HelpModal() {
  return (
    <Modal title="Как играть" size="wide">
      <div class="grid g2">
        <div class="stack">
          <div><b>Цель</b><p class="fg2">Десять лет, с января 2026 по декабрь 2035. В конце правительство оценит ГОЗ в срок (20%), экспорт (20%), прибыль (20%), технологии (15%), своё доверие к вам (15%) и долговую нагрузку (10%). Каждый декабрь проверяются годовые показатели — от них растёт или падает доверие.</p></div>
          <div><b>Заказы</b><p class="fg2">ГОЗ приходит проектами контрактов, когда заказ по изделию подходит к концу: можно принять, поторговаться о цене или сроке, отказаться (минус доверие). Аванс ложится на отдельный счёт контракта. Просрочка — неустойка 1/300 ключевой ставки в день и падение доверия.</p></div>
          <div><b>Экспорт</b><p class="fg2">Страны объявляют тендеры. Ваша заявка соревнуется с иностранными конкурентами по цене, технике, политике, офсетам и финансированию. Анализ рынка показывает точные шансы. Выставки и делегации улучшают отношения и учащают запросы. Победы дают поставки и сервисные контракты на годы вперёд.</p></div>
          <div><b>Производство</b><p class="fg2">Изделие занимает место на линии весь цикл. Двигатели ставятся в конце — следите за АЛ-41Ф1С, ВК-2500, ПС-90А-76. Брак на приёмке растёт с износом фондов и долей новичков.</p></div>
        </div>
        <div class="stack">
          <div><b>Люди</b><p class="fg2">Зарплату задаёте в процентах от средней по региону. Ниже 100% — люди уходят и пишут жалобы, выше — легче нанимать. Новички год работают вполсилы. Рынок труда со временем сжимается: помогают жильё и учебные центры.</p></div>
          <div><b>Деньги</b><p class="fg2">Простой мощностей — прямой убыток: держите численность под заказы. Свободные деньги приносят проценты (ключевая − 2%), кредиты стоят ключевая + маржа по рейтингу. При нехватке денег включается овердрафт под ключевую + 6%. Экспортная выручка приходит в валюте; рупии продаются только с дисконтом.</p></div>
          <div><b>НИОКР и инвестиции</b><p class="fg2">Новые изделия (Су-75, Т-14, С-500), двигатели (АЛ-51Ф-1, ВК-650В, ПД-12В) и импортозамещение ЭКБ. Модернизация станков повышает производительность — но по ГОЗ экономия при следующем контракте уходит заказчику, а на экспорте остаётся у вас.</p></div>
          <div><b>Советы</b><p class="fg2">Не берите ГОЗ, который не успеваете сделать. Цена в тендере на 5–10% ниже прейскуранта часто решает исход. Держите резерв денег на полгода зарплат. Санкции дорожают — импортозамещение ЭКБ окупается.</p></div>
        </div>
      </div>
    </Modal>
  );
}

export function LoanModal({ offer }) {
  const G = S.G;
  const max = Math.max(1000, Math.round(offer.max / 1000) * 1000);
  const [amt, setAmt] = useState(Math.min(max, Math.round(max / 2 / 1000) * 1000));
  const rate = offer.kind === "goz" ? offer.rate : G.m.key + offer.spread;
  return (
    <Modal title={`Кредит ${BANKS[offer.bank].name}`} size="narrow" footer={<button class="btn primary" onClick={() => { act(takeLoan)(offer, amt); closeModal(); toast(`Получено ${rub(amt)}`, "ok"); }}>Получить {rub(amt)}</button>}>
      <KV rows={[["Срок", months(offer.term)], ["Ставка сейчас", `${num(rate, 2)}%${offer.kind === "goz" ? " фиксированная" : " (ключевая + " + num(offer.spread, 2) + "%)"}`], ["Погашение", "в конце срока; досрочно — без комиссии"]]} />
      <Slider id="loanamt" label="Сумма" value={amt} min={1000} max={max} step={1000} fmt={rub} onInput={setAmt} hint={`Проценты ≈ ${rub((amt * rate) / 1200)} в месяц`} />
    </Modal>
  );
}

export function RepayModal({ id }) {
  const G = S.G;
  const l = G.loans.find((x) => x.id === id);
  const max = l ? Math.max(0, Math.min(l.amt, G.cash)) : 0;
  const [amt, setAmt] = useState(Math.round(max));
  if (!l) return null;
  return (
    <Modal title={`Погасить: ${BANKS[l.bank].name}`} size="narrow" footer={<button class="btn primary" disabled={amt <= 0} onClick={() => { act(repayLoan)(id, amt); closeModal(); toast(`Погашено ${rub(amt)}`, "ok"); }}>Погасить {rub(amt)}</button>}>
      <KV rows={[["Остаток долга", rub(l.amt)], ["Свободные деньги", rub(G.cash)]]} />
      <Slider id="repayamt" label="Сумма" value={amt} min={0} max={Math.round(max)} step={Math.max(1, Math.round(max / 200))} fmt={rub} onInput={setAmt} />
    </Modal>
  );
}
export { revenue, netProfit, ebitda, pct };
