/* Производство: линии заводов, изделия в работе, узкие места по двигателям. */
import { S, openModal } from "../store.js";
import { Card, Bar, St, Empty } from "../components.jsx";
import { Ic } from "../icons.jsx";
import { num, pct, people, rub } from "../fmt.js";
import { ENTERPRISES, SECTORS, ENT } from "../../data/enterprises.js";
import { FAM, VAR, compName, isStockOnly } from "../../sim/catalog.js";
import { STOCK_ONLY } from "../../data/products.js";
import { RND } from "../../data/rnd.js";
import { demand } from "../../sim/production.js";
import { entStats } from "../sel.js";

export function Production({ G }) {
  (G.settings.seen = G.settings.seen || {}).prod = true;
  const D = demand(G);
  return (
    <>
      <div class="screen-head">
        <div><h1>Производство</h1><p>Автоплан запускает изделия под подписанные контракты, пока хватает людей, мест на линии и денег. Ручной план запускает заданное число изделий каждый месяц — для работы на склад. Двигатели ставятся на окончательной сборке: без них готовое изделие ждёт и занимает место.</p></div>
      </div>
      <Comps G={G} D={D} />
      {Object.entries(SECTORS).map(([sid, s]) => {
        const ents = ENTERPRISES.filter((e) => e.sector === sid);
        return (
          <div class="stack">
            <span class="eyebrow">{s.name}</span>
            <div class="grid g2">{ents.map((d) => <EntLines G={G} e={G.ents[d.id]} D={D} />)}</div>
          </div>
        );
      })}
    </>
  );
}

function Comps({ G, D }) {
  const ids = ["al41f1s", "al51", "al31fm1", "al31fp", "rd33mk", "vk2500", "tv7v", "tv7st", "vk650", "ps90", "pd14", "pd12v", "d136", "pw207"];
  const wipN = D.wipN;
  const rows = ids.filter((id) => (G.stock[id]?.n || 0) + (wipN[id] || 0) + (D.comp[id] || 0) > 0 || (VAR[id] && G.unl[VAR[id].fam]));
  const waiting = G._prod?.waiting || {};
  return (
    <Card title="Двигатели собственного производства" eyebrow="узкое место авиастроения" flush>
      <div class="tblwrap">
        <table class="tbl">
          <thead><tr><th>Двигатель</th><th>Завод</th><th class="r">На складе</th><th class="r">В работе</th><th class="r">Нужно под заказы</th><th>Состояние</th></tr></thead>
          <tbody>
            {rows.map((id) => {
              const stock = G.stock[id]?.n || 0, inw = wipN[id] || 0, need = D.comp[id] || 0, wt = waiting[id] || 0;
              const so = isStockOnly(id);
              const tone = wt > 0 ? "crit" : so && need > stock ? "warn" : stock + inw < need * 0.4 ? "warn" : "ok";
              return (
                <tr>
                  <td><b>{compName(id)}</b>{so ? <div class="sub">{STOCK_ONLY[id].note}</div> : null}</td>
                  <td class="small">{so ? "—" : ENT[FAM[VAR[id].fam].ent].short}</td>
                  <td class="r">{num(stock)}</td>
                  <td class="r">{so ? "—" : num(inw)}</td>
                  <td class="r">{num(need)}</td>
                  <td>{wt > 0 ? <St tone="crit">ждут {wt} шт.</St> : tone === "warn" ? <St tone="warn">{so ? "запас кончается" : "мало"}</St> : <St tone="ok">хватает</St>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function EntLines({ G, e, D }) {
  const st = entStats(G, e);
  const tone = st.over > 1.05 ? "crit" : st.util < 0.6 ? "warn" : "ok";
  return (
    <section class="card">
      <div class="card-h" style="cursor:pointer" onClick={() => openModal("ent", { id: e.id })}>
        <div class="stack tight grow">
          <h2>{st.d.short}</h2>
          <span class="small muted">{st.d.city} · {people(e.staff)} · {pct(st.over)} загрузки людей</span>
        </div>
        <St tone={tone}>{st.over > 1.05 ? "не хватает людей" : st.util < 0.6 ? "простой" : "в норме"}</St>
      </div>
      <div class="card-b">
        <Bar value={Math.min(st.over, 1)} tone={tone} thin />
        <div class="items" style="margin:0 -16px">
          {e.lines.map((l) => <LineRow G={G} e={e} l={l} D={D} />)}
        </div>
      </div>
    </section>
  );
}

function LineRow({ G, e, l, D }) {
  const f = FAM[l.fam];
  const locked = f.locked && !G.unl[f.id];
  const rnd = locked ? RND.find((r) => (r.fx.unlock || []).includes(f.id)) : null;
  const waiting = l.wip.filter((u) => u.w).length;
  const stock = f.variants.reduce((s, v) => s + (G.stock[v.id]?.n || 0), 0);
  const show = Math.min(l.slots, 36);
  const units = [...l.wip].sort((a, b) => b.p - a.p).slice(0, show);
  return (
    <div class="item click" style="grid-template-columns:minmax(0,1fr) auto" onClick={() => openModal("line", { ent: e.id, fam: l.fam })}>
      <div class="stack tight">
        <div class="row wrap">
          <b>{f.name}</b>
          {locked ? <St tone="neutral">нужна НИОКР{rnd ? `: ${rnd.name}` : ""}</St> : l.hold ? <St tone="neutral">остановлена</St> : <span class="chip">{l.auto ? "автоплан" : "ручной план"}</span>}
          {waiting ? <St tone="crit">ждут двигателей: {waiting}</St> : null}
        </div>
        {!locked ? (
          <div class="pipe" title={`${l.wip.length} из ${l.slots} мест занято`}>
            {units.map((u) => <i class={u.w ? "wait" : u.r ? "rew" : ""}><b style={`height:${Math.round(u.p * 100)}%`} /></i>)}
            {Array.from({ length: Math.max(0, show - units.length) }).map(() => <i class="free" />)}
            {l.slots > show ? <span class="small muted">+{l.slots - show}</span> : null}
          </div>
        ) : null}
      </div>
      <div class="stack tight" style="text-align:right">
        <span class="small"><b>{l.wip.length}</b><span class="muted"> / {l.slots} мест</span></span>
        {stock ? <span class="small muted">на складе {stock}</span> : null}
      </div>
    </div>
  );
}
export { Ic };
