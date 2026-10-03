/* Справочник: техника, иностранные конкуренты, предприятия, термины. */
import { useState } from "preact/hooks";
import { Card, Tabs, St, Kind } from "../components.jsx";
import { Ic } from "../icons.jsx";
import { rub, usd, num, pct, people } from "../fmt.js";
import { FAMILIES, CATS } from "../../data/products.js";
import { COMPETITORS, COUNTRIES, TCATS } from "../../data/competitors.js";
import { ENTERPRISES, ENT, SECTORS } from "../../data/enterprises.js";
import { RND } from "../../data/rnd.js";
import { stdCost, techOf, listUsd, unlocked, compsOf, compName } from "../../sim/catalog.js";

export function Catalog({ G }) {
  const [tab, setTab] = useState("tech");
  return (
    <>
      <div class="screen-head">
        <div><h1>Справочник</h1><p>Названия техники, предприятий и иностранных конкурентов — настоящие. Цены — ориентировочные оценки по открытым источникам: точные контрактные цены не публикуются.</p></div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "tech", label: "Наша техника" }, { id: "comp", label: "Конкуренты" }, { id: "ents", label: "Предприятия" }, { id: "terms", label: "Термины" }]} />
      {tab === "tech" ? <Tech G={G} /> : tab === "comp" ? <Comp /> : tab === "ents" ? <Ents G={G} /> : <Terms />}
    </>
  );
}

const MK = { goz: "ГОЗ", exp: "экспорт", civ: "гражданский", comp: "комплектующие" };
function Tech({ G }) {
  const [cat, setCat] = useState("air");
  const fams = FAMILIES.filter((f) => f.cat === cat);
  return (
    <div class="stack">
      <div class="row wrap">
        {Object.entries(CATS).map(([id, name]) => <button class={`btn sm${cat === id ? " primary" : ""}`} onClick={() => setCat(id)}><Ic n={id} size={16} />{name}</button>)}
      </div>
      <div class="grid g2">
        {fams.map((f) => {
          const rnd = f.locked && !G.unl[f.id] ? RND.find((r) => (r.fx.unlock || []).includes(f.id)) : null;
          return (
            <Card title={f.name} eyebrow={`${ENT[f.ent].short} · ${ENT[f.ent].city}`}>
              <p class="small fg2">{f.desc}</p>
              <p class="small muted">{f.specs}</p>
              {rnd ? <St tone="neutral">серия после НИОКР «{rnd.name}»</St> : null}
              <div class="tblwrap"><table class="tbl">
                <thead><tr><th>Модификация</th><th>Рынок</th><th class="r">Цена</th><th class="r">Себест.</th></tr></thead>
                <tbody>{f.variants.map((v) => {
                  const c = stdCost(G, v.id);
                  const price = v.mk === "exp" ? usd(listUsd(G, v.id)) : v.mk === "comp" ? "—" : rub(c * 1.085);
                  const engines = Object.entries(compsOf(G, v.id)).map(([k, n]) => `${n} × ${compName(k)}`).join(", ");
                  return (
                    <tr>
                      <td><b>{v.name}</b>{engines ? <div class="sub">{engines}</div> : null}{v.mk === "exp" ? <div class="sub">экспортная оценка {techOf(G, v.id)}</div> : null}{!unlocked(G, v.id) ? <div class="sub">нет допуска к серии</div> : null}</td>
                      <td>{v.mk === "comp" ? <span class="small muted">двигатель</span> : <Kind k={v.mk} label={MK[v.mk]} />}</td>
                      <td class="r nowrap">{price}</td>
                      <td class="r nowrap">{rub(c)}</td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Comp() {
  const cats = Object.keys(TCATS).filter((c) => COMPETITORS.some((x) => x.cats.includes(c)));
  return (
    <div class="grid g2">
      {cats.map((c) => (
        <Card title={TCATS[c].name} flush>
          <div class="tblwrap"><table class="tbl">
            <thead><tr><th>Изделие</th><th>Страна</th><th class="r">Оценка</th><th class="r">Цена</th></tr></thead>
            <tbody>{COMPETITORS.filter((x) => x.cats.includes(c)).sort((a, b) => b.tech - a.tech).map((x) => (
              <tr><td><b>{x.name}</b><div class="sub">{x.maker}{x.allies ? " · только союзникам США" : ""}</div></td><td class="small">{COUNTRIES[x.c]}</td><td class="r">{x.tech}</td><td class="r nowrap">{usd(x.usd)}</td></tr>
            ))}</tbody>
          </table></div>
        </Card>
      ))}
    </div>
  );
}

function Ents({ G }) {
  return (
    <div class="grid g2">
      {ENTERPRISES.map((d) => (
        <Card title={d.name} eyebrow={`${SECTORS[d.sector].name} · ${d.holding}`}>
          <p class="small fg2">{d.desc}</p>
          <p class="small muted">{d.city}, {d.region} · {people(G.ents[d.id].staff)}</p>
        </Card>
      ))}
    </div>
  );
}

const TERMS = [
  ["ГОЗ", "Государственный оборонный заказ. Цена считается по схеме «затраты плюс норматив прибыли»: нормативная себестоимость при загрузке 85% плюс 7–10% рентабельности. Экономия на затратах при следующем контракте уходит заказчику."],
  ["ИГК", "Идентификатор государственного контракта — 25 цифр, по которому банк ведёт отдельный счёт контракта."],
  ["Отдельный счёт (целевые средства)", "Авансы по ГОЗ лежат на отдельных счетах в уполномоченном банке и тратятся только на материалы и работы по этому контракту. Остаток освобождается после исполнения контракта."],
  ["ВП МО", "Военное представительство Минобороны на заводе: принимает изделия. Брак возвращается на доработку — чем выше износ фондов и доля новичков, тем больше брака."],
  ["Неустойка по ГОЗ", "1/300 ключевой ставки за каждый день просрочки от стоимости непоставленного — около 1,5% в месяц при ставке 16%. Плюс падает доверие государства."],
  ["НЗП", "Незавершённое производство: деньги, вложенные в изделия, которые ещё не поставлены. Долгий цикл (подводные лодки — 2,5 года) связывает много денег."],
  ["Простой мощностей", "Зарплата и накладные, которые не пошли в изделия, потому что людям нечем было заняться. Прямой убыток."],
  ["ЭКБ", "Электронная компонентная база. Импортная ЭКБ идёт через параллельный импорт с наценкой, которая растёт с каждым пакетом санкций. Программы импортозамещения снижают долю импорта."],
  ["Спецэкспортёр", "Экспорт вооружений идёт через государственного посредника; его комиссия, обучение персонала заказчика, ЗИП и документация — около 19% цены экспортного контракта."],
  ["ФСВТС", "Федеральная служба по военно-техническому сотрудничеству: определяет, кому и что можно продавать. Поэтому не всё вооружение экспортируется (С-500, Т-14)."],
  ["CAATSA", "Американский закон о санкциях против покупателей российского оружия. Страны, зависящие от США, могут заморозить или расторгнуть контракт."],
  ["ОДКБ", "Организация Договора о коллективной безопасности. Члены покупают вооружение по внутренним российским ценам в рублях."],
  ["Офсет", "Обязательство продавца вложить часть стоимости контракта в экономику покупателя: локализация, передача технологий, закупки у местных заводов. Повышает шансы, но стоит денег."],
  ["ЭКСАР", "Российское агентство страхования экспортных кредитов. Страховка 2,5% стоимости контракта возмещает 90% неплатежа."],
  ["Госкредит", "Покупка в счёт государственного кредита России: заказчику проще заплатить, нам платят вовремя, но государство недовольно тратами бюджета."],
  ["Машинокомплект", "Набор узлов и деталей для лицензионной сборки на заводе заказчика — так Индия собирает Су-30МКИ и Т-90С."],
  ["Обязательная продажа валютной выручки", "Часть экспортной выручки в валюте экспортёр обязан продать на внутреннем рынке."],
  ["EBITDA", "Прибыль до процентов, налогов и амортизации — основа для расчёта долговой нагрузки банками."],
  ["Ключевая ставка", "Ставка Банка России. От неё зависят проценты по кредитам (ключевая + маржа банка), доходы по депозитам и спрос на гражданскую технику в лизинг."],
  ["Импортозамещение", "Замена импортных комплектующих отечественными: двигатели ПД-8 и ПД-14, ВК-650В вместо PW207K, ПД-12В вместо украинского Д-136, отечественная ЭКБ и станки."],
];
function Terms() {
  return (
    <Card>
      <dl class="stack">
        {TERMS.map(([t, d]) => <div><dt><b>{t}</b></dt><dd style="margin:2px 0 0" class="fg2">{d}</dd></div>)}
      </dl>
    </Card>
  );
}
export { num, pct };
