/* Карточка предприятия (кадры, зарплаты, фонды, проекты) и производственной линии (план, изделия в работе). */
import { useState } from "preact/hooks";
import { S, act, openModal, replaceModal, toast } from "../store.js";
import { Modal, KV, St, Bar, Stepper, Slider, Seg, Empty, Kind } from "../components.jsx";
import { rub, num, pct, people, tsd, months, date } from "../fmt.js";
import { ENT, SECTORS } from "../../data/enterprises.js";
import { RND } from "../../data/rnd.js";
import { FAM, VAR, unlocked, stdCost, unitOf } from "../../sim/catalog.js";
import { PROJECTS, projectCost, projectAllowed, startProject, applyProjectSubsidy, subsidyChance, cancelProject } from "../../sim/rnd.js";
import { setWage, setTarget, setMaint, setLineAuto, setLinePlan, setLineHold } from "../../sim/actions.js";
import { attrition, hirePool, payroll, wage, eqF, wearF } from "../../sim/workforce.js";
import { defectRate, remaining } from "../../sim/contracts.js";
import { entStats } from "../sel.js";
import { sum } from "../../sim/util.js";

export function EntModal({ id }) {
  const G = S.G;
  const e = G.ents[id], d = ENT[id];
  const st = entStats(G, e);
  const [wr, setWr] = useState(e.wageR);
  const [pt, setPt] = useState("modern");
  const [pf, setPf] = useState(e.lines.find((l) => !FAM[l.fam].locked || G.unl[l.fam])?.fam || e.lines[0].fam);
  // оценка эффекта зарплаты до применения
  const sim = { ...e, wageR: wr };
  const attrM = attrition(sim), poolM = hirePool(G, sim);
  const payM = (e.staff * wr * e.rwage * 1.3) / 1000;
  const maintCost = (d.staff * d.capInt * G.m.cpi * e.maint) / 12;
  const pc = projectCost(G, e, pt, pf);
  const allowed = projectAllowed(G, e, pt, pf);
  return (
    <Modal size="wide" eyebrow={`${SECTORS[d.sector].name} · ${d.holding} · ${d.city}`} title={d.name}>
      <p class="small fg2">{d.desc}</p>
      <div class="tiles">
        <div class="tile"><span class="eyebrow">Персонал</span><span class="v">{num(e.staff)}</span><span class="d">новичков {num(st.tr)} · за месяц {e.last.hired >= 0 ? `+${num(e.last.hired || 0)}` : num(e.last.hired)} / −{num(e.last.left || 0)}</span></div>
        <div class="tile"><span class="eyebrow">Загрузка людей</span><span class="v">{pct(st.over)}</span><span class="d"><Bar value={Math.min(1, st.over)} tone={st.over > 1.05 ? "crit" : st.util < 0.6 ? "warn" : "ok"} thin /></span></div>
        <div class="tile"><span class="eyebrow">ФОТ в месяц</span><span class="v">{rub(st.pay)}</span><span class="d">накладные ≈ {rub(e.oh * G.m.cpi)}</span></div>
        <div class="tile"><span class="eyebrow">Брак на приёмке</span><span class="v">{pct(st.defect, 1)}</span><span class="d">зависит от износа, станков и новичков</span></div>
      </div>
      <div class="grid g2">
        <div class="stack">
          <span class="eyebrow">Кадры и зарплата</span>
          <Slider id="wage" label={`Зарплата: ${pct(wr)} от средней по региону (${tsd(e.rwage)})`} value={wr} min={0.8} max={1.6} step={0.01} fmt={() => tsd(wr * e.rwage)}
            onInput={setWr} onChange={(x) => act(setWage)(id, x)}
            hint={`Уход ≈ ${pct(attrM, 1)} персонала в месяц · найм до ≈ ${num(poolM)} чел. в месяц · ФОТ ${rub(payM)}`} />
          <div class="row between">
            <span class="small">Целевая численность</span>
            <Stepper label="Целевая численность" value={e.target} min={100} max={60000} step={100} fmt={num} onChange={(x) => act(setTarget)(id, x)} />
          </div>
          <span class="small muted">{e.target > e.staff ? `Набор идёт со скоростью рынка труда: ≈ ${num(poolM)} чел. в месяц. Новички первый год работают вполсилы.` : e.target < e.staff ? `Сокращение произойдёт в конце месяца: выходное пособие — два оклада${e.target < e.staff - 200 ? ", массовые увольнения снижают доверие государства" : ""}.` : "Численность поддерживается: ушедших замещают новыми."}</span>
          <span class="eyebrow" style="margin-top:6px">Основные фонды</span>
          <KV rows={[["Станочный парк", `${e.eq.toFixed(0)} из 5 (производительность ×${num(eqF(e.eq), 2)})`], ["Износ", `${pct(e.wear)} (производительность ×${num(wearF(e.wear), 2)})`], ["Остаточная стоимость", rub(e.fa)], ["Жильё / учебный центр", `${e.housing ? "есть" : "нет"} / ${e.school ? "есть" : "нет"}`]]} />
          <Slider id="maint" label="Ремонт фондов в год, % от восстановительной стоимости" value={e.maint} min={0.01} max={0.12} step={0.005} fmt={(x) => pct(x, 1)} onInput={(x) => act(setMaint)(id, x)}
            hint={`${rub(maintCost)} в месяц. Около 5% держат износ на месте; меньше — износ растёт, растут брак и риск аварий.`} />
        </div>
        <div class="stack">
          <span class="eyebrow">Инвестиционные проекты</span>
          {e.proj.length ? e.proj.map((p) => (
            <div class="card" style="padding:10px 12px;background:var(--surface-2)">
              <div class="row between"><b class="small">{PROJECTS[p.type].name}{p.fam ? ` — ${FAM[p.fam].name}` : ""}</b><span class="small muted">осталось {months(p.left)}</span></div>
              <Bar value={p.months - p.left} max={p.months} tone="acc" thin />
              <div class="row between small" style="margin-top:6px">
                <span class="muted">вложено {rub(p.spent)} из ≈ {rub(p.cost * (1 - p.share))}{p.share ? ` (субсидия ${pct(p.share)})` : ""}</span>
                <span class="row">
                  {!p.share ? <button class="btn xs" disabled={p.pending || G.t - p.applyT < 6} onClick={() => act(applyProjectSubsidy)(id, p.id)}>{p.pending ? "ждём ответа" : `субсидия (${pct(subsidyChance(G))})`}</button> : null}
                  <button class="btn xs ghost" onClick={() => act(cancelProject)(id, p.id)}>Остановить</button>
                </span>
              </div>
            </div>
          )) : <span class="small muted">Проектов нет.</span>}
          <div class="card" style="padding:12px;background:var(--surface-2)">
            <div class="stack tight">
              <label class="field"><span>Новый проект</span>
                <select class="input" id="ptype" value={pt} onChange={(ev) => setPt(ev.currentTarget.value)}>
                  {Object.entries(PROJECTS).map(([k, p]) => <option value={k}>{p.name}</option>)}
                </select>
              </label>
              {pt === "expand" ? (
                <label class="field"><span>Линия</span>
                  <select class="input" id="pfam" value={pf} onChange={(ev) => setPf(ev.currentTarget.value)}>
                    {e.lines.map((l) => <option value={l.fam}>{FAM[l.fam].name} — {l.slots} мест</option>)}
                  </select>
                </label>
              ) : null}
              <span class="small fg2">{PROJECTS[pt].desc}</span>
              {pc ? <span class="small">Стоимость ≈ <b>{rub(pc.cost)}</b>, срок {months(pc.months)}{pt === "expand" ? `, +${pc.n} мест` : ""}. Платежи равными долями.</span> : null}
              <button class="btn primary sm" disabled={!!allowed} onClick={() => { act(startProject)(id, pt, pt === "expand" ? pf : null); toast("Проект запущен", "ok"); }}>{allowed ? `Нельзя: ${allowed}` : "Запустить проект"}</button>
            </div>
          </div>
        </div>
      </div>
      <div class="stack tight">
        <span class="eyebrow">Линии</span>
        {e.lines.map((l) => (
          <button class="btn sm" style="justify-content:space-between" onClick={() => replaceModal("line", { ent: id, fam: l.fam, back: true })}>
            <span>{FAM[l.fam].name}</span><span class="muted">{FAM[l.fam].locked && !G.unl[l.fam] ? "нет допуска к серии" : `${l.wip.length} / ${l.slots} мест · ${l.auto ? "автоплан" : "ручной план"}`}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function LineModal({ ent, fam }) {
  const G = S.G;
  const e = G.ents[ent], d = ENT[ent];
  const l = e.lines.find((x) => x.fam === fam);
  const f = FAM[fam];
  const locked = f.locked && !G.unl[fam];
  const rnd = locked ? RND.find((r) => (r.fx.unlock || []).includes(fam)) : null;
  const outstanding = (vid) => sum(G.contracts.filter((c) => c.status === "active" && c.v === vid), (c) => c.qty - c.done);
  const units = [...l.wip].sort((a, b) => b.p - a.p);
  return (
    <Modal size="wide" eyebrow={`${d.short} · ${d.city}`} title={`Линия: ${f.name}`} footer={
      <>
        <button class="btn" onClick={() => replaceModal("ent", { id: ent })}>К предприятию</button>
        {!locked ? <button class="btn" onClick={() => act(setLineHold)(ent, fam, !l.hold)}>{l.hold ? "Возобновить запуск" : "Остановить запуск новых"}</button> : null}
      </>
    }>
      <p class="small fg2">{f.desc}</p>
      {locked ? <St tone="neutral">Серийный выпуск невозможен до завершения НИОКР «{rnd?.name}».</St> : null}
      <div class="grid g2">
        <div class="stack">
          <KV rows={[["Мест на линии", `${l.wip.length} занято из ${l.slots}`], ["Цикл изготовления", months(f.cycle)], ["Трудоёмкость", `${num(f.lab)} человеко-месяцев`], ["Предел выпуска", `≈ ${num(l.slots / f.cycle, 1)} ед. в месяц`]]} />
          {!locked ? (
            <div class="stack tight">
              <span class="eyebrow">План запуска</span>
              <Seg items={[{ id: "auto", label: "Автоплан под контракты" }, { id: "manual", label: "Ручной план" }]} value={l.auto ? "auto" : "manual"} onChange={(x) => act(setLineAuto)(ent, fam, x === "auto")} />
              <span class="small muted">{l.auto ? "Запускаем ровно столько, сколько нужно по подписанным контрактам и под двигатели для других заводов, — если хватает людей, мест и денег." : "Каждый месяц запускаем указанное число изделий — в том числе на склад под будущие заказы. Склад связывает деньги."}</span>
            </div>
          ) : null}
        </div>
        <div class="stack tight">
          <span class="eyebrow">Модификации</span>
          {f.variants.map((v) => {
            const ok = unlocked(G, v.id);
            return (
              <div class="card" style="padding:10px 12px;background:var(--surface-2)">
                <div class="row between">
                  <span class="row"><Kind k={v.mk === "comp" ? "civ" : v.mk} label={v.mk === "comp" ? "комплектующие" : undefined} /><b class="small">{v.name}</b></span>
                  {!ok ? <span class="small muted">нет допуска</span> : !l.auto && !locked ? <Stepper label={`План: ${v.name}`} value={l.plan[v.id] || 0} min={0} max={l.slots} onChange={(x) => act(setLinePlan)(ent, fam, v.id, x)} fmt={(x) => `${x}/мес`} /> : null}
                </div>
                <div class="small muted" style="margin-top:4px">заказано {num(outstanding(v.id))} · на складе {num(G.stock[v.id]?.n || 0)} · в работе {num(l.wip.filter((u) => u.v === v.id).length)} · себестоимость {rub(stdCost(G, v.id))}</div>
              </div>
            );
          })}
        </div>
      </div>
      {!locked ? (
        <div class="stack tight">
          <span class="eyebrow">Изделия в работе</span>
          {units.length ? (
            <div class="tblwrap"><table class="tbl">
              <thead><tr><th>Изделие</th><th>Готовность</th><th class="r">Вложено</th><th>Состояние</th></tr></thead>
              <tbody>{units.slice(0, 60).map((u) => (
                <tr><td>{VAR[u.v].name}</td><td style="min-width:140px"><Bar value={u.p} tone={u.w ? "crit" : u.r ? "warn" : "acc"} thin /></td><td class="r">{rub(u.c)}</td>
                  <td>{u.w ? <St tone="crit">ждёт двигателей</St> : u.r ? <St tone="warn">доработка после приёмки</St> : <span class="small muted">{pct(u.p)}</span>}</td></tr>
              ))}</tbody>
            </table></div>
          ) : <Empty title="Линия пуста" />}
        </div>
      ) : null}
    </Modal>
  );
}
export { openModal, date, payroll, wage, defectRate, remaining, unitOf };
