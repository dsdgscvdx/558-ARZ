/* НИОКР: опытно-конструкторские работы, импортозамещение, программы производительности. */
import { act } from "../store.js";
import { Card, Bar, St, Tile } from "../components.jsx";
import { rub, pct, months, date } from "../fmt.js";
import { RND } from "../../data/rnd.js";
import { startRnd, pauseRnd, applyRndFunding, rndMonthly, rndLeftCost, rndMonthsLeft, describeFx, fundingChance } from "../../sim/rnd.js";
import { sum } from "../../sim/util.js";

const SECT = [
  ["avia", "Авиация"], ["engine", "Двигатели"], ["armor", "Бронетехника"], ["art", "Артиллерия"], ["ad", "ПВО"], ["missile", "Ракеты"], ["navy", "Флот"], ["uav", "Беспилотники"], ["all", "Межотраслевые программы"],
];

export function Research({ G }) {
  const active = RND.filter((r) => G.rnd[r.id].st === "active");
  const monthly = sum(active, (r) => rndMonthly(G, r.id) * (1 - G.rnd[r.id].share));
  const done = RND.filter((r) => G.rnd[r.id].st === "done").length;
  return (
    <>
      <div class="screen-head">
        <div><h1>НИОКР</h1><p>Новые изделия, двигатели и импортозамещение. Военные работы может оплатить Минобороны (70%), гражданские — Минпромторг (50%): шанс одобрения зависит от доверия государства. Трудности на испытаниях потребуют денег или времени.</p></div>
      </div>
      <div class="tiles">
        <Tile label="Идёт работ" value={String(active.length)} sub={`завершено ${done} из ${RND.length}`} />
        <Tile label="Расходы в месяц" value={rub(monthly)} sub="за свой счёт, после доли государства" />
      </div>
      {SECT.map(([sid, name]) => {
        const list = RND.filter((r) => r.sector === sid);
        if (!list.length) return null;
        return (
          <Card title={name} flush>
            <div class="items">{list.map((r) => <RndRow G={G} r={r} />)}</div>
          </Card>
        );
      })}
    </>
  );
}

function RndRow({ G, r }) {
  const s = G.rnd[r.id];
  const st = s.st;
  const left = rndLeftCost(G, r.id) * (1 - s.share);
  const ml = rndMonthsLeft(G, r.id);
  const chance = fundingChance(G, r.id);
  return (
    <div class="item">
      <div class="stack tight">
        <h4>
          {r.name}
          {st === "done" ? <St tone="ok">завершена {s.doneT != null ? date(s.doneT) : ""}</St> : st === "active" ? <St tone="info">идёт</St> : st === "paused" ? <St tone="neutral">приостановлена</St> : null}
          {s.share ? <St tone="ok">госфинансирование {pct(s.share)}</St> : s.pending ? <St tone="neutral">заявка рассматривается</St> : null}
        </h4>
        <span class="small fg2">{r.desc}</span>
        <span class="small muted">{describeFx(r)}</span>
        {st !== "done" ? (
          <div class="row wrap small">
            <div style="width:180px"><Bar value={s.prog} tone="acc" thin /></div>
            <span>{pct(s.prog)} готово</span>
            <span class="muted">· осталось ≈ {months(ml)} и {rub(left)}{s.share ? " собственных средств" : ""}</span>
            <span class="muted">· риск трудностей {pct(r.risk)}</span>
          </div>
        ) : null}
      </div>
      {st !== "done" ? (
        <div class="acts">
          {st === "active" ? <button class="btn sm" onClick={() => act(pauseRnd)(r.id)}>Приостановить</button> : <button class="btn sm primary" onClick={() => act(startRnd)(r.id)}>{st === "paused" ? "Возобновить" : "Начать"}</button>}
          {r.state && !s.share ? (
            <button class="btn sm" disabled={s.pending || G.t - s.applyT < 6} onClick={() => act(applyRndFunding)(r.id)} title={`Ответ придёт в следующем месяце. Вероятность одобрения сейчас ≈ ${pct(chance)}`}>
              {s.pending ? "Ждём ответа" : G.t - s.applyT < 6 ? `Повторно через ${6 - (G.t - s.applyT)} мес.` : `Просить ${r.state === "mil" ? "ОКР у Минобороны" : "субсидию Минпромторга"} (${pct(chance)})`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
