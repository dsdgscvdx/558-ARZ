/* Журнал событий с фильтрами */
import { useState } from "preact/hooks";
import { Card, Seg, Empty } from "../components.jsx";
import { Ic } from "../icons.jsx";
import { dateShort } from "../fmt.js";

const TONE_ICON = { ok: "check", warn: "warn", crit: "warn", star: "star", goz: "doc", exp: "export", civ: "doc", fin: "fin", rnd: "rnd", inv: "ent", event: "flag", year: "chart", info: "info" };
const FILTERS = [
  { id: "all", label: "Всё", test: () => true },
  { id: "goz", label: "ГОЗ", test: (l) => l.tone === "goz" || /ГОЗ|Минобороны|ИГК/.test(l.text) },
  { id: "exp", label: "Экспорт", test: (l) => l.tone === "exp" || l.tone === "star" || /тендер|Экспорт|экспорт/.test(l.text) },
  { id: "fin", label: "Финансы", test: (l) => l.tone === "fin" || /кредит|ЦБ|дивиденд|рупи/i.test(l.text) },
  { id: "prob", label: "Проблемы", test: (l) => l.tone === "warn" || l.tone === "crit" },
];

export function LogRow({ l }) {
  return (
    <div class={`log-row ${l.tone}`}>
      <time>{dateShort(l.t)}</time>
      <Ic n={TONE_ICON[l.tone] || "info"} />
      <span>{l.text}</span>
    </div>
  );
}

export function Journal({ G }) {
  const [f, setF] = useState("all");
  const flt = FILTERS.find((x) => x.id === f);
  const rows = G.log.filter(flt.test).slice(-300).reverse();
  return (
    <>
      <div class="screen-head">
        <div><h1>Журнал</h1><p>Все решения, контракты, тендеры, аварии и решения государства — по месяцам.</p></div>
        <Seg items={FILTERS} value={f} onChange={setF} />
      </div>
      <Card flush>{rows.length ? <div class="log">{rows.map((l) => <LogRow l={l} />)}</div> : <Empty title="Записей нет" />}</Card>
    </>
  );
}
