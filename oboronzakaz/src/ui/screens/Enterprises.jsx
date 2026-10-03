/* Предприятия: карта, персонал, зарплаты, загрузка, оснащённость и износ, инвестиционные проекты. */
import { openModal } from "../store.js";
import { Card, Bar, St } from "../components.jsx";
import { DotMap } from "../map.jsx";
import { num, pct, rub, people, tsd } from "../fmt.js";
import { ENTERPRISES, SECTORS, ENT } from "../../data/enterprises.js";
import { PROJECTS } from "../../sim/rnd.js";
import { entStats } from "../sel.js";
import { sum } from "../../sim/util.js";

export function Enterprises({ G }) {
  (G.settings.seen = G.settings.seen || {}).ents = true;
  const rows = ENTERPRISES.map((d) => ({ d, e: G.ents[d.id], st: entStats(G, G.ents[d.id]) }));
  const pins = rows.map(({ d, st }) => ({
    id: d.id, lat: d.lat, lon: d.lon, label: d.short.replace(/«|»/g, ""), size: 8 + Math.round(Math.sqrt(G.ents[d.id].staff) / 20),
    color: st.over > 1.05 ? "var(--crit)" : st.util < 0.6 ? "var(--warn)" : "var(--ok)",
    title: `${d.short}, ${d.city}: загрузка ${pct(st.over)}, ${people(G.ents[d.id].staff)}`,
  }));
  const staff = sum(rows, (r) => r.e.staff), pay = sum(rows, (r) => r.st.pay);
  return (
    <>
      <div class="screen-head">
        <div><h1>Предприятия</h1><p>Люди — главный ресурс: найм ограничен рынком труда региона и зарплатой. Износ фондов снижает производительность, повышает брак и риск аварий. Модернизация, жильё и учебные центры окупаются годами.</p></div>
        <span class="small muted">{people(staff)} · ФОТ {rub(pay)} в месяц</span>
      </div>
      <Card title="География холдинга" eyebrow="цвет метки — загрузка: зелёный — норма, жёлтый — простой, красный — не хватает людей">
        <DotMap view="russia" pins={pins} onPin={(id) => openModal("ent", { id })} />
      </Card>
      {Object.entries(SECTORS).map(([sid, s]) => (
        <Card title={s.name} flush>
          <div class="tblwrap">
            <table class="tbl">
              <thead><tr><th>Предприятие</th><th class="r">Персонал</th><th class="r">Зарплата</th><th>Загрузка людей</th><th class="r">Станки</th><th class="r">Износ</th><th>Проекты</th></tr></thead>
              <tbody>
                {rows.filter((r) => r.d.sector === sid).map(({ d, e, st }) => (
                  <tr class="click" onClick={() => openModal("ent", { id: d.id })}>
                    <td><b>{d.short}</b><div class="sub">{d.city}</div></td>
                    <td class="r">{num(e.staff)}<div class="sub">{e.target !== e.staff ? `цель ${num(e.target)}` : st.tr ? `новичков ${num(st.tr)}` : ""}</div></td>
                    <td class="r">{tsd(st.wage)}<div class={`sub ${e.wageR < 1 ? "down" : ""}`}>{pct(e.wageR)} от региона</div></td>
                    <td style="min-width:130px"><div class="small">{pct(st.over)}</div><Bar value={Math.min(1, st.over)} tone={st.over > 1.05 ? "crit" : st.util < 0.6 ? "warn" : "ok"} thin /></td>
                    <td class="r">{e.eq.toFixed(0)} из 5</td>
                    <td class="r">{e.wear > 0.65 ? <St tone="crit">{pct(e.wear)}</St> : pct(e.wear)}</td>
                    <td class="small">{e.proj.length ? e.proj.map((p) => `${PROJECTS[p.type].name} (${p.left} мес.)`).join(", ") : <span class="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </>
  );
}
