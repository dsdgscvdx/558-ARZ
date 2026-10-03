/* Главное меню: новая игра, продолжение, загрузка сохранений. */
import { useState } from "preact/hooks";
import { S, update, openModal, loadSlot, slotMeta, SLOTS, applyTheme, savedTheme, toast, storageOk } from "../store.js";
import { newGame, DIFFS } from "../../sim/state.js";
import { ENTERPRISES } from "../../data/enterprises.js";
import { FAMILIES } from "../../data/products.js";
import { PARTNERS } from "../../data/partners.js";
import { Seg } from "../components.jsx";
import { Ic } from "../icons.jsx";
import { dateCap } from "../fmt.js";

export function Menu() {
  const [name, setName] = useState("");
  const [holding, setHolding] = useState("Объединённая оборонно-промышленная корпорация");
  const [diff, setDiff] = useState("normal");
  const [theme, setTheme] = useState(savedTheme());
  const auto = slotMeta("auto");
  const variants = FAMILIES.reduce((s, f) => s + f.variants.length, 0);
  const start = () => {
    S.G = newGame({ diff, name: name.trim() || "Генеральный директор", holding: holding.trim() || "Объединённая оборонно-промышленная корпорация" });
    S.ui.screen = "dash";
    update();
    openModal("intro");
  };
  const load = (slot) => {
    try { const G = loadSlot(slot); if (!G) { toast("Сохранение не найдено.", "warn"); return; } S.G = G; S.ui.screen = "dash"; update(); }
    catch (e) { toast(`Не удалось загрузить: ${e.message}`, "crit", 7000); }
  };
  return (
    <div class="menu-screen">
      <div class="menu-card">
        <div class="menu-left">
          <div class="stack tight">
            <span class="logo-sub">Стратегия · 2026–2035</span>
            <div class="logo-big">ОБОРОНЗАКАЗ</div>
          </div>
          <p>Вы возглавляете оборонно-промышленный холдинг страны: от КнААЗ в Комсомольске-на-Амуре до Адмиралтейских верфей в Петербурге. Выполняйте гособоронзаказ, выигрывайте экспортные тендеры у Rafale, F-16 и J-10CE, планируйте выпуск, нанимайте людей, берите кредиты и вкладывайте в НИОКР. Деньги считаются по-настоящему: авансы на отдельных счетах, ключевая ставка, курс рубля, санкции и неустойки.</p>
          <div class="facts">
            <div><b>{ENTERPRISES.length}</b><span>заводов и КБ</span></div>
            <div><b>{variants}</b><span>изделий: самолёты, вертолёты, ПВО, ракеты, флот</span></div>
            <div><b>{PARTNERS.length}</b><span>стран-заказчиков</span></div>
          </div>
          <p class="small muted">Названия техники, предприятий и иностранных конкурентов — настоящие. Цены, численность и объёмы — оценки по открытым источникам, упрощённые для игры.</p>
        </div>
        <div class="menu-right">
          {auto ? (
            <button class="btn primary big block" onClick={() => load("auto")}>
              <Ic n="play" />Продолжить: {dateCap(auto.t)}{auto.over ? " (игра окончена)" : ""}
            </button>
          ) : null}
          <div class="stack">
            <span class="eyebrow">Новая игра</span>
            <label class="field"><span>Ваше имя</span><input class="input" id="pname" maxLength={40} value={name} placeholder="Генеральный директор" onInput={(e) => setName(e.currentTarget.value)} /></label>
            <label class="field"><span>Название холдинга</span><input class="input" id="pholding" maxLength={70} value={holding} onInput={(e) => setHolding(e.currentTarget.value)} /></label>
            <div class="field"><span>Сложность</span><Seg items={Object.entries(DIFFS).map(([id, d]) => ({ id, label: d.name }))} value={diff} onChange={setDiff} /></div>
            <span class="small muted">{diff === "easy" ? "Больше денег, меньше долгов, мягче санкции и конкуренты." : diff === "hard" ? "Мало денег, большие долги, жёсткие санкции, сильные конкуренты, больше неприятных событий." : "Положение, близкое к реальному на начало 2026 года."}</span>
            <button class={`btn ${auto ? "" : "primary "}big block`} onClick={start}><Ic n="flag" />Начать управление холдингом</button>
          </div>
          <div class="sep" />
          <div class="stack tight">
            <span class="eyebrow">Сохранения</span>
            {SLOTS.filter((s) => s !== "auto").map((s) => {
              const m = slotMeta(s);
              return (
                <div class="row between">
                  <span class="small">Ячейка {s}: {m ? `${dateCap(m.t)} · ${m.name}` : <span class="muted">пусто</span>}</span>
                  <button class="btn sm" disabled={!m} onClick={() => load(s)}>Загрузить</button>
                </div>
              );
            })}
            <button class="btn sm" onClick={() => openModal("import")}>Ввести код сохранения</button>
            {!storageOk() ? <span class="small muted">Браузер не разрешает сохранять игру на этом устройстве — пользуйтесь кодом сохранения.</span> : null}
          </div>
          <div class="row between">
            <span class="small muted">Тема</span>
            <Seg items={[{ id: "system", label: "Как в системе" }, { id: "dark", label: "Тёмная" }, { id: "light", label: "Светлая" }]} value={theme} onChange={(v) => { setTheme(v); applyTheme(v); }} />
          </div>
        </div>
      </div>
    </div>
  );
}
