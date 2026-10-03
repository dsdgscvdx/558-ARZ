/* События: макроэкономика, санкции, кадры, проверки, экспортные риски. Часть требует решения игрока —
   такие события ждут ответа до конца следующего месяца, иначе принимается вариант по умолчанию. */
import { ENT } from "../data/enterprises.js";
import { PARTNER, PARTNERS } from "../data/partners.js";
import { RND_BY } from "../data/rnd.js";
import { VAR, FAM, unlocked } from "./catalog.js";
import { fxShock as fxShockRaw, rate } from "./macro.js";
const fxShock = (G, pct) => withReval(G, () => fxShockRaw(G, pct));
import { chance, uni, irand, clamp, pick, pickW, nextId, yearOf, monthOf, sum } from "./util.js";
import { spend, receive, plAdd, cfAdd, logF, fmtM, netProfit, debt, convertFx, withReval } from "./finance.js";
import { rndTrouble } from "./rnd.js";
import { makeTender } from "./tenders.js";
import { wage } from "./workforce.js";
import { DIFFS } from "./state.js";

const ents = (G) => Object.values(G.ents);
const pickEnt = (G, f = () => true) => { const l = ents(G).filter(f); return l.length ? pick(G, l) : null; };
const entName = (id) => ENT[id].short;

export const EVENTS = {
  sanctions: {
    w: () => 1.0, cd: 8,
    make: (G) => ({ title: "Новый пакет санкций", text: "США и ЕС расширили списки: под ограничения попали посредники, через которых шла импортная электронная компонентная база. Цена «серого» импорта ЭКБ вырастет.",
      choices: [{ label: "Срочно выкупить ЭКБ через третьи страны", hint: `${fmtM(3000 * G.m.cpi)} — рост цен будет вдвое меньше` }, { label: "Переждать", hint: "наценка на импортную ЭКБ вырастет на 20–30 п.п." }], def: 1 }),
    apply: (G, p, i) => {
      G.m.sanc = clamp(G.m.sanc + uni(G, 5, 10), 30, 100);
      let d = uni(G, 0.2, 0.3);
      if (i === 0) { const c = 3000 * G.m.cpi; spend(G, c, "materials"); plAdd(G, "other", c); d /= 2; }
      G.m.ekbPrem += d;
    },
  },
  oilDown: {
    w: (G) => (G.m.oil > 50 ? 0.7 : 0.2), cd: 10,
    make: () => ({ title: "Нефть дешевеет", text: "Цена Urals упала на фоне избытка предложения. Доходы бюджета снижаются: Минфин предупреждает о сокращении будущего гособоронзаказа, рубль слабеет.", choices: [{ label: "Принять к сведению", hint: "" }], def: 0 }),
    apply: (G) => { G.m.oil *= uni(G, 0.78, 0.88); G.m.gozBudget = clamp(G.m.gozBudget - 0.06, 0.7, 1.3); fxShock(G, uni(G, 0.05, 0.1)); },
  },
  oilUp: {
    w: (G) => (G.m.oil < 75 ? 0.6 : 0.2), cd: 10,
    make: () => ({ title: "Нефть дорожает", text: "Сокращение добычи странами ОПЕК+ подняло цены. Бюджет получит дополнительные доходы — Минобороны готово увеличить закупки. Рубль укрепляется, экспортная выручка в рублях снизится.", choices: [{ label: "Принять к сведению", hint: "" }], def: 0 }),
    apply: (G) => { G.m.oil *= uni(G, 1.12, 1.22); G.m.gozBudget = clamp(G.m.gozBudget + 0.05, 0.7, 1.3); fxShock(G, -uni(G, 0.04, 0.08)); },
  },
  rubCrash: {
    w: () => 0.35, cd: 18,
    make: () => ({ title: "Рубль резко ослаб", text: "Курс доллара за неделю вырос на 15%. Экспортная выручка в рублях растёт, но импортная ЭКБ и станки дорожают, а ЦБ может экстренно поднять ставку.", choices: [{ label: "Принять к сведению", hint: "" }], def: 0 }),
    apply: (G) => { fxShock(G, uni(G, 0.12, 0.2)); if (chance(G, 0.5)) { G.m.key = clamp(G.m.key + 2, 5, 25); logF(G, "ЦБ на внеочередном заседании поднял ключевую ставку на 2 п.п.", "warn"); } },
  },
  rubStrong: {
    w: () => 0.35, cd: 14,
    make: () => ({ title: "Рубль укрепился", text: "Курс доллара снизился на 10%. Экспортные контракты в валюте приносят меньше рублей, зато импорт дешевеет.", choices: [{ label: "Принять к сведению", hint: "" }], def: 0 }),
    apply: (G) => fxShock(G, -uni(G, 0.08, 0.12)),
  },
  metals: {
    w: () => 0.6, cd: 12,
    make: () => ({ title: "Подорожали титан и алюминий", text: "Мировые цены на металлы выросли, поставщики проката пересматривают договоры. Материалы для новых изделий подорожают.", choices: [{ label: "Принять к сведению", hint: "" }], def: 0 }),
    apply: (G) => { G.m.matIdx *= uni(G, 1.04, 1.07); },
  },
  laborCrunch: {
    w: () => 0.6, cd: 12,
    make: (G) => ({ title: "Дефицит кадров обостряется", text: "Безработица на историческом минимуме. Оборонные заводы конкурируют за сварщиков, фрезеровщиков и инженеров с другими отраслями.",
      choices: [{ label: "Программа переезда специалистов из других регионов", hint: `${fmtM(4000 * G.m.cpi)} — смягчит дефицит` }, { label: "Ничего не делать", hint: "найм станет труднее на всех заводах" }], def: 1 }),
    apply: (G, p, i) => { G.m.labor = clamp(G.m.labor - 0.06, 0.55, 1.2); if (i === 0) { const c = 4000 * G.m.cpi; spend(G, c, "other"); plAdd(G, "other", c); G.m.labor = clamp(G.m.labor + 0.04, 0.55, 1.2); } },
  },
  workersLetter: {
    w: (G) => (ents(G).some((e) => e.wageR < 1.0) ? 1.2 : 0), cd: 6,
    make: (G) => {
      const e = pickEnt(G, (x) => x.wageR < 1.0);
      if (!e) return null;
      return { p: { e: e.id }, title: `Коллективное письмо работников ${entName(e.id)}`,
        text: `Зарплата на ${entName(e.id)} (${Math.round(wage(e))} тыс. ₽) ниже средней по региону (${Math.round(e.rwage)} тыс. ₽). Работники грозят увольнениями и пишут губернатору.`,
        choices: [{ label: "Поднять зарплату до 110% от региональной", hint: "фонд оплаты труда вырастет" }, { label: "Отказать", hint: "забастовка, текучесть и падение доверия" }], def: 1 };
    },
    apply: (G, p, i) => { const e = G.ents[p.e]; if (!e) return; if (i === 0) e.wageR = Math.max(e.wageR, 1.1); else { e.strike = 2; G.trust -= 2; logF(G, `${entName(p.e)}: итальянская забастовка, производительность −25% на 2 месяца.`, "crit"); } },
  },
  poach: {
    w: (G) => (ents(G).some((e) => e.wageR < 1.06) ? 0.8 : 0.2), cd: 8,
    make: (G) => {
      const e = pickEnt(G, (x) => x.wageR < 1.1) || pickEnt(G);
      return { p: { e: e.id }, title: `Переманивают инженеров ${entName(e.id)}`, text: `IT-компании и частные заводы предлагают конструкторам и технологам ${entName(e.id)} зарплаты в полтора раза выше. Уже уходят целые отделы.`,
        choices: [{ label: "Поднять зарплаты на 10%", hint: "дороже, но кадры останутся" }, { label: "Не реагировать", hint: `потеря около 2% персонала` }], def: 1 };
    },
    apply: (G, p, i) => { const e = G.ents[p.e]; if (!e) return; if (i === 0) e.wageR *= 1.1; else { const k = Math.round(e.staff * 0.02); e.staff -= k; } },
  },
  audit: {
    w: (G) => (G.contracts.some((c) => c.kind === "goz" && c.late > 0) ? 1 : 0.4), cd: 12,
    make: (G) => {
      const base = (G.pl.years[yearOf(G.t) - 1]?.revGoz || G.pl.y.revGoz || 100000);
      const fine = Math.round(base * uni(G, 0.004, 0.012));
      return { p: { fine }, title: "Проверка Счётной палаты", text: `Аудиторы нашли завышение цен в калькуляциях по ГОЗ и нецелевое использование средств отдельных счетов. Предлагаемый штраф и возврат — ${fmtM(fine)}.`,
        choices: [{ label: "Оспорить в суде", hint: "50%: штраф отменят, 50%: штраф ×1,5 и доверие −2" }, { label: "Признать и заплатить", hint: "доверие −1" }], def: 1 };
    },
    apply: (G, p, i) => {
      let fine = p.fine;
      if (i === 0) { if (chance(G, 0.5)) { logF(G, "Арбитражный суд отменил решение Счётной палаты.", "ok"); return; } fine *= 1.5; G.trust -= 2; }
      else G.trust -= 1;
      spend(G, fine, "penalties"); plAdd(G, "pen", fine);
    },
  },
  theft: {
    w: () => 0.5, cd: 14,
    make: (G) => {
      const e = pickEnt(G);
      const loss = Math.round(ENT[e.id].staff * uni(G, 0.05, 0.2) * G.m.cpi);
      return { p: { e: e.id, loss }, title: `Уголовное дело о хищениях на ${entName(e.id)}`, text: `Следователи задержали заместителя директора: через аффилированных поставщиков выведено ${fmtM(loss)}. Деньги уже не вернуть.`,
        choices: [{ label: "Внутренний аудит и смена руководства завода", hint: `${fmtM(400 * G.m.cpi)}, доверие государства восстановится; 3 месяца неразберихи (−5% мощности)` }, { label: "Не выносить сор из избы", hint: "доверие −3, риск повторения" }], def: 1 };
    },
    apply: (G, p, i) => {
      spend(G, p.loss, "other"); plAdd(G, "other", p.loss);
      const e = G.ents[p.e];
      if (i === 0) { const c = 400 * G.m.cpi; spend(G, c, "other"); plAdd(G, "other", c); e.pBonus = -0.05; e.pBonusT = 3; G.trust += 0.5; }
      else { G.trust -= 3; G.ev.cd.theft = G.t + 4; }
    },
  },
  rationalizers: {
    w: () => 0.7, cd: 6,
    make: (G) => {
      const e = pickEnt(G);
      const cost = Math.round(ENT[e.id].staff * uni(G, 0.02, 0.05) * G.m.cpi);
      return { p: { e: e.id, cost }, title: `Рационализаторы ${entName(e.id)} предлагают улучшение`, text: `Технологи предлагают перестроить маршрут деталей между цехами и оснастить участок новыми приспособлениями. Стоимость — ${fmtM(cost)}, эффект — около +4% производительности.`,
        choices: [{ label: "Внедрить", hint: fmtM(cost) }, { label: "Отложить", hint: "" }], def: 1 };
    },
    apply: (G, p, i) => { if (i !== 0) return; const e = G.ents[p.e]; spend(G, p.cost, "capex"); e.fa += p.cost; e.prodPerm = (e.prodPerm || 0) + 0.04; },
  },
  visit: {
    w: () => 0.45, cd: 12,
    make: (G) => {
      const e = pickEnt(G);
      return { p: { e: e.id }, title: `Визит первых лиц государства на ${entName(e.id)}`, text: `Через неделю завод посетят руководители страны. Будут смотреть цеха, новые изделия и выполнение гособоронзаказа.`,
        choices: [{ label: "Показать всё как есть", hint: "если завод загружен и сроки не сорваны — доверие вырастет" }, { label: "Навести лоск: покраска, временные таблички, «образцовый» участок", hint: `${fmtM(300 * G.m.cpi)}, небольшой гарантированный плюс` }], def: 0 };
    },
    apply: (G, p, i) => {
      const e = G.ents[p.e];
      const late = G.contracts.some((c) => c.status === "active" && c.late > 0 && VAR[c.v] && FAM[VAR[c.v].fam].ent === p.e);
      if (i === 1) { const c = 300 * G.m.cpi; spend(G, c, "sga"); plAdd(G, "sga", c); G.trust += 1.5; return; }
      if ((e.util || 0) > 0.75 && !late) { G.trust += 4; logF(G, `Визит прошёл успешно: ${entName(p.e)} похвалили за загрузку и сроки.`, "ok"); }
      else { G.trust -= 3; logF(G, `Визит выявил проблемы на ${entName(p.e)}: ${late ? "сорваны сроки ГОЗ" : "простаивают цеха"}. Доверие −3.`, "warn"); }
    },
  },
  testCrash: {
    w: (G) => (Object.values(G.rnd).some((s) => s.st === "active") ? 0.5 : 0), cd: 18,
    make: (G) => {
      const act = Object.entries(G.rnd).filter(([, s]) => s.st === "active").map(([id]) => id);
      const id = pick(G, act);
      return { p: { id }, title: "Авария на испытаниях", text: `При испытаниях по теме «${RND_BY[id].name}» разрушен опытный образец. Работы задержатся, иностранная пресса пишет о «ненадёжности российской техники».`,
        choices: [{ label: "Независимая комиссия и открытые выводы", hint: `${fmtM(1000 * G.m.cpi)}, репутация частично восстановится` }, { label: "Закрытое расследование", hint: "экспортная репутация −3" }], def: 1 };
    },
    apply: (G, p, i) => {
      const s = G.rnd[p.id]; s.months += irand(G, 2, 5);
      if (i === 0) { const c = 1000 * G.m.cpi; spend(G, c, "rnd"); plAdd(G, "rnd", c); G.rep -= 1; } else G.rep -= 3;
    },
  },
  caatsa: {
    w: (G) => (G.contracts.some((c) => c.status === "active" && c.kind === "exp" && PARTNER[c.client].caatsa >= 0.5 && c.done < c.qty) ? 1.0 : 0), cd: 10,
    make: (G) => {
      const cs = G.contracts.filter((c) => c.status === "active" && c.kind === "exp" && PARTNER[c.client].caatsa >= 0.5 && c.done < c.qty);
      const c = pick(G, cs);
      const P = PARTNER[c.client];
      return { p: { c: c.id }, title: `Давление США на ${P.name}`, text: `Госдепартамент пригрозил ${P.name} санкциями по закону CAATSA за контракт ${c.no} (${VAR[c.v].name} × ${c.qty - c.done}). Заказчик колеблется.`,
        choices: [{ label: "Скидка 10% на оставшиеся поставки", hint: "контракт почти наверняка сохранится" }, { label: "Перевести расчёты в национальные валюты и ждать", hint: "50% — контракт сохранится, 50% — будет расторгнут" }, { label: "Согласиться на заморозку на полгода", hint: "поставки приостановятся" }], def: 1 };
    },
    apply: (G, p, i) => {
      const c = G.contracts.find((x) => x.id === p.c);
      if (!c || c.status !== "active") return;
      const P = PARTNER[c.client];
      if (i === 0) { c.price *= 0.9; if (chance(G, 0.9)) return; }
      if (i === 1 && chance(G, 0.5)) return;
      if (i === 2) { c.hold = true; c.due += 6; G.partners[c.client].frozen = 6; G.ev.active[`unhold_${c.id}`] = G.t + 6; logF(G, `Контракт ${c.no} заморожен на 6 месяцев.`, "warn"); return; }
      // расторжение: аванс остаётся у нас, изделия на складе можно продать другим
      plAdd(G, "otherInc", c.advLeft); c.advLeft = 0; c.status = "cancelled";
      G.partners[c.client].rel = clamp(G.partners[c.client].rel - 10, 0, 100);
      logF(G, `${P.name} под давлением США расторгла контракт ${c.no}. Полученный аванс остаётся у нас.`, "crit");
    },
  },
  coup: {
    w: () => 0.25, cd: 24,
    make: (G) => {
      const P = pickW(G, PARTNERS.filter((x) => ["africa", "asia", "latam"].includes(x.region)), (x) => 1 - x.pay);
      if (!P) return null;
      const good = chance(G, 0.5);
      return { p: { pid: P.id, good }, title: `Смена власти: ${P.name}`, text: good ? `Новое руководство ${P.name} объявило о стратегическом партнёрстве с Россией и пересмотре оборонных закупок.` : `К власти в ${P.name} пришли силы, ориентированные на Запад. Военно-техническое сотрудничество под вопросом.`,
        choices: [{ label: "Принять к сведению", hint: "" }], def: 0 };
    },
    apply: (G, p) => {
      const pp = G.partners[p.pid];
      pp.rel = clamp(pp.rel + (p.good ? 18 : -22), 0, 100);
      pp.pref.ru = clamp((pp.pref.ru || 0) + (p.good ? 0.15 : -0.2), 0, 1);
      if (!p.good) for (const T of G.tenders) if (T.partner === p.pid && T.status === "open") { T.status = "cancelled"; T.decided = G.t; }
    },
  },
  payChannel: {
    w: (G) => (G.contracts.some((c) => c.recv.length && c.kind === "exp") ? 0.7 : 0.15), cd: 12,
    make: (G) => ({ title: "Платежи застревают в банках третьих стран", text: "Банки-корреспонденты под угрозой вторичных санкций возвращают платежи по оборонным контрактам. Экспортная выручка будет приходить с задержкой.",
      choices: [{ label: "Перейти на расчёты в юанях через СПФС и банки-партнёры", hint: `${fmtM(500 * G.m.cpi)}, проблема на 2 месяца` }, { label: "Ждать", hint: "задержки около 5 месяцев" }], def: 1 }),
    apply: (G, p, i) => { if (i === 0) { const c = 500 * G.m.cpi; spend(G, c, "sga"); plAdd(G, "sga", c); G.ev.active.payChannel = G.t + 2; } else G.ev.active.payChannel = G.t + 5; },
  },
  rupees: {
    w: (G) => (G.fx.INR * G.m.inr > 15000 ? 2 : 0), cd: 8,
    make: (G) => {
      const rub = G.fx.INR * G.m.inr;
      return { title: "Рупии на счетах в индийских банках", text: `На счетах скопилось ₹${Math.round(G.fx.INR).toLocaleString("ru-RU")} млн (${fmtM(rub)}). Свободно конвертировать рупии нельзя, при продаже — дисконт 6%.`,
        choices: [{ label: "Закупить индийскую продукцию для своих заводов", hint: "конвертация с дисконтом 3%" }, { label: "Вложить в совместное предприятие с HAL", hint: "рупии уйдут в капитал СП, отношения с Индией +8, новые заказы на машинокомплекты" }, { label: "Пусть лежат", hint: "" }], def: 2 };
    },
    apply: (G, p, i) => {
      const amt = G.fx.INR;
      if (i === 0) { const rub = amt * G.m.inr * 0.97; G.fx.INR = 0; G.cash += rub; plAdd(G, "fxd", -amt * G.m.inr * 0.03); }
      else if (i === 1) {
        const rub = amt * G.m.inr; G.fx.INR = 0; plAdd(G, "other", rub * 0.5); G.cash += rub * 0.5; // половина — в капитал СП (списывается), половина возвращается дивидендами и заказами
        G.partners.in.rel = clamp(G.partners.in.rel + 8, 0, 100);
        const T = makeTender(G, PARTNER.in, "kit"); if (T) { T.direct = true; T.comp = []; G.tenders.push(T); }
      }
    },
  },
  dumping: {
    w: (G) => (G.tenders.some((T) => T.status === "open" && T.comp.some((c) => c.id && ["j10ce", "jf17", "vt4", "vn17", "hq9b", "wl2", "ch5", "sr5", "l15", "fk2000", "hq17a", "s26t", "type056"].includes(c.id))) ? 0.8 : 0), cd: 6,
    make: () => ({ title: "Китайские конкуренты снижают цены", text: "Норинко, AVIC и CPMIEC предлагают заказчикам скидки до 15% и кредиты китайских госбанков.", choices: [{ label: "Принять к сведению", hint: "" }], def: 0 }),
    apply: (G) => { for (const T of G.tenders) if (T.status === "open") for (const c of T.comp) if (["j10ce", "jf17", "vt4", "vn17", "hq9b", "wl2", "ch5", "sr5", "l15", "fk2000", "hq17a", "s26t", "type056", "hq16", "fk3", "ar3", "sh15", "hj12", "fn16", "pl15", "pl10", "c802", "cm400", "bp12a", "z10me", "z8", "k8", "firedragon"].includes(c.id)) { c.price = Math.round(c.price * 0.88 * 10) / 10; c.fin = "state"; } },
  },
  copycat: {
    w: (G) => (G.partners.cn.rel > 50 ? 0.3 : 0), cd: 24, once: true,
    make: () => ({ title: "Китайская копия российского двигателя", text: "Китай представил собственный двигатель, повторяющий конструкцию АЛ-31Ф. Пекин сокращает закупки российских двигателей.", choices: [{ label: "Принять к сведению", hint: "" }], def: 0 }),
    apply: (G) => { G.partners.cn.pref.ru = clamp(G.partners.cn.pref.ru - 0.15, 0, 1); G.partners.cn.rel -= 5; },
  },
  upgradeRequest: {
    w: () => 0.6, cd: 4,
    make: (G) => {
      const cands = [];
      for (const [pid, pp] of Object.entries(G.partners)) {
        if (pp.rel < 55 || pp.frozen > 0) continue;
        for (const [fid, n] of Object.entries(pp.fleet)) if (n > 5 && FAM[fid] && FAM[fid].tcat) cands.push([pid, fid]);
      }
      if (!cands.length) return null;
      const [pid, fid] = pick(G, cands);
      return { p: { pid, fid }, title: `${PARTNER[pid].name} хочет пополнить парк`, text: `Военные ${PARTNER[pid].name} довольны техникой семейства «${FAM[fid].name}» и предлагают прямые переговоры о новой партии без конкурса.`,
        choices: [{ label: "Начать переговоры", hint: "появится прямой запрос в разделе «Экспорт»" }, { label: "Отказаться", hint: "отношения −3" }], def: 0 };
    },
    apply: (G, p, i) => {
      if (i !== 0) { G.partners[p.pid].rel -= 3; return; }
      const T = makeTender(G, PARTNER[p.pid], FAM[p.fid].tcat);
      if (T) { T.direct = true; T.comp = []; G.tenders.push(T); }
    },
  },
  priceIndex: {
    w: (G) => (G.m.infl > 7 ? 0.8 : 0.1), cd: 12,
    make: () => ({ title: "Минобороны индексирует цены ГОЗ", text: "Из-за высокой инфляции правительство разрешило проиндексировать цены по долгосрочным контрактам на 4%.", choices: [{ label: "Отлично", hint: "" }], def: 0 }),
    apply: (G) => { for (const c of G.contracts) if (c.status === "active" && c.kind === "goz" && G.t - c.t0 >= 12) c.price *= 1.04; },
  },
  sequester: {
    w: (G) => (G.m.oil < 55 ? 0.7 : 0.15), cd: 18,
    make: () => ({ title: "Секвестр федерального бюджета", text: "Минфин сокращает расходы. Оплата поставок по ГОЗ будет приходить с задержкой до трёх месяцев, объём заказов на следующий год урежут.", choices: [{ label: "Принять к сведению", hint: "" }], def: 0 }),
    apply: (G) => { G.ev.active.sequester = G.t + 6; G.m.gozBudget = clamp(G.m.gozBudget - 0.08, 0.7, 1.3); },
  },
  debtRelief: {
    w: (G) => (debt(G) > 300000 && G.trust >= 55 ? 0.5 : 0), cd: 36,
    make: (G) => {
      const mkt = sum(G.loans.filter((l) => l.kind === "mkt"), (l) => l.amt);
      const amt = Math.round(mkt * 0.2);
      return { p: { amt }, title: "Реструктуризация долгов ОПК", text: `Правительство готово за счёт бюджета погасить ${fmtM(amt)} рыночных кредитов холдинга. Взамен — обязательство не сокращать персонал два года и отчёт о каждом рубле.`,
        choices: [{ label: "Согласиться", hint: "долг уменьшится; сокращения персонала будут стоить вдвое больше доверия" }, { label: "Отказаться", hint: "" }], def: 0 };
    },
    apply: (G, p, i) => {
      if (i !== 0) return;
      let left = p.amt;
      for (const l of G.loans.filter((x) => x.kind === "mkt").sort((a, b) => b.amt - a.amt)) { const k = Math.min(l.amt, left); l.amt -= k; left -= k; if (left <= 0) break; }
      G.loans = G.loans.filter((l) => l.amt >= 1);
      plAdd(G, "otherInc", p.amt - left);
      G.flags.noLayoff = G.t + 24;
    },
  },
  capital: {
    w: (G) => (G.trust >= 68 ? 0.35 : 0), cd: 24,
    make: (G) => {
      const amt = Math.round(uni(G, 15000, 40000) * G.m.cpi);
      return { p: { amt }, title: "Взнос государства в уставный капитал", text: `Правительство выделяет ${fmtM(amt)} на техническое перевооружение холдинга в обмен на дополнительную эмиссию акций.`, choices: [{ label: "Принять", hint: "" }], def: 0 };
    },
    apply: (G, p) => { receive(G, p.amt, "capIn"); G.stats.capIn += p.amt; },
  },
  natproj: {
    w: () => 0.3, cd: 36,
    make: () => ({ title: "Национальный проект «Средства производства и автоматизации»", text: "Государство компенсирует часть затрат на отечественные станки и роботов: модернизация станочного парка в ближайший год обойдётся на 20% дешевле.", choices: [{ label: "Отлично", hint: "" }], def: 0 }),
    apply: (G) => { G.ev.active.natproj = G.t + 12; },
  },
  machineBan: {
    w: (G) => (G.bonus.modCost >= 1 ? 0.4 : 0), cd: 24,
    make: () => ({ title: "Запрет на поставку станков", text: "Тайвань и Япония ужесточили экспортный контроль: обрабатывающие центры с ЧПУ придётся везти сложными схемами. Модернизация заводов подорожает на 15%, пока нет своих станков.", choices: [{ label: "Принять к сведению", hint: "проект «Отечественные станки с ЧПУ» решит проблему" }], def: 0 }),
    apply: (G) => { G.ev.active.machineBan = G.t + 18; },
  },
  cyber: {
    w: () => 0.4, cd: 10,
    make: (G) => {
      const e = pickEnt(G);
      return { p: { e: e.id }, title: `Кибератака на ${entName(e.id)}`, text: "Вирус-шифровальщик заблокировал систему управления производством и конструкторскую документацию.",
        choices: [{ label: "Нанять внешнюю команду реагирования", hint: `${fmtM(300 * G.m.cpi)}, работа восстановится сразу` }, { label: "Восстанавливать своими силами", hint: "мощность завода −20% на 2 месяца" }], def: 1 };
    },
    apply: (G, p, i) => { const e = G.ents[p.e]; if (i === 0) { const c = 300 * G.m.cpi; spend(G, c, "other"); plAdd(G, "other", c); } else { e.pBonus = -0.2; e.pBonusT = 2; } },
  },
  licence: {
    w: (G) => (G.partners.in.rel >= 55 ? 0.3 : 0), cd: 36,
    make: (G) => {
      const fams = ["mi8", "ka52", "t90", "pantsir", "kalibr"].filter((f) => unlocked(G, FAM[f].variants[0].id));
      const fid = pick(G, fams);
      const fee = Math.round(uni(G, 300, 700));
      return { p: { fid, fee }, title: "Индия предлагает лицензионное производство", text: `Министерство обороны Индии готово заплатить $${fee} млн за лицензию и техническую помощь в организации выпуска «${FAM[fid].name}» на индийских заводах по программе «Make in India». Прямые поставки этого семейства в Индию после этого прекратятся.`,
        choices: [{ label: "Продать лицензию", hint: `$${fee} млн, отношения с Индией +10` }, { label: "Отказаться", hint: "отношения −4" }], def: 1 };
    },
    apply: (G, p, i) => {
      if (i !== 0) { G.partners.in.rel -= 4; return; }
      const rub = p.fee * G.m.usd;
      G.fx.INR += (p.fee * G.m.usd) / G.m.inr * 0.6; G.cash += rub * 0.4; cfAdd(G, "inExp", rub);
      plAdd(G, "revExp", rub);
      G.partners.in.rel = clamp(G.partners.in.rel + 10, 0, 100);
      (G.flags.licensed = G.flags.licensed || {})[p.fid] = true;
      logF(G, `Продана лицензия Индии на «${FAM[p.fid].name}»: $${p.fee} млн (часть — рупиями).`, "star");
    },
  },
  windfall: {
    w: (G) => ((G.pl.years[yearOf(G.t) - 1] && netProfit(G.pl.years[yearOf(G.t) - 1]) > 150000) ? 0.6 : 0), cd: 36, once: true,
    make: (G) => {
      const np = netProfit(G.pl.years[yearOf(G.t) - 1]);
      const amt = Math.round((np - 100000) * 0.1);
      return { p: { amt }, title: "Разовый налог на сверхприбыль", text: `Минфин вводит разовый взнос в 10% с прибыли сверх обычного уровня. Для холдинга это ${fmtM(amt)}.`, choices: [{ label: "Заплатить", hint: "" }], def: 0 };
    },
    apply: (G, p) => { spend(G, p.amt, "taxes"); plAdd(G, "other", p.amt); },
  },
};

/* Технические трудности НИОКР — отдельное событие с выбором */
function rndTroubleEvent(G, id) {
  const r = RND_BY[id];
  return { key: "rndTrouble", p: { id }, title: `Трудности в работе «${r.name}»`, text: "Испытания выявили недоработки: нужен дополнительный цикл доводки. Можно добавить денег и людей или сдвинуть сроки.",
    choices: [{ label: "Добавить финансирование", hint: "+10–20% к стоимости, срок сохраняется" }, { label: "Сдвинуть сроки", hint: "+2–6 месяцев" }], def: 1 };
}
EVENTS.rndTrouble = { w: () => 0, apply: (G, p, i) => rndTrouble(G, p.id, i) };

/* Дивиденды в бюджет — каждый июнь, если по итогам прошлого года есть прибыль */
EVENTS.dividends = {
  w: () => 0,
  apply: (G, p, i) => {
    if (i === 0) { spend(G, p.amt, "divs"); G.stats.divs += p.amt; G.trust += 1; logF(G, `Выплачены дивиденды в бюджет: ${fmtM(p.amt)}.`, "fin"); return; }
    if (chance(G, clamp(0.2 + G.trust / 150, 0.1, 0.8))) { G.trust -= 1; logF(G, "Правительство разрешило направить прибыль на инвестиционную программу вместо дивидендов.", "ok"); }
    else { const a = p.amt * 1.5; spend(G, a, "divs"); G.stats.divs += a; G.trust -= 2; logF(G, `В отсрочке дивидендов отказано: выплачено ${fmtM(a)} (с учётом повышенного норматива).`, "warn"); }
  },
};

EVENTS.bailout = {
  w: () => 0,
  apply: (G, p, i) => {
    if (i !== 0) return;
    G.loans.push({ id: nextId(G, "L"), bank: "state", kind: "state", amt: p.amt, rate: 3, left: 48, t0: G.t });
    receive(G, p.amt, "loansIn");
    G.trust -= 8;
    G.crisis = 0;
  },
};

export function queueEvent(G, key, ev) {
  G.ev.queue.push({ id: nextId(G, "E"), key, t: G.t, title: ev.title, text: ev.text, choices: ev.choices, def: ev.def ?? 0, p: ev.p || {} });
}

export function stepEvents(G) {
  const D = DIFFS[G.diff] || DIFFS.normal;
  // технические трудности НИОКР
  for (const id of G._rndTrouble || []) queueEvent(G, "rndTrouble", rndTroubleEvent(G, id));
  G._rndTrouble = [];
  // дивиденды
  if (monthOf(G.t) === 5) {
    const prev = G.pl.years[yearOf(G.t) - 1];
    const np = prev ? netProfit(prev) : 0;
    if (np > 0) {
      const amt = Math.round(np * 0.25);
      queueEvent(G, "dividends", { p: { amt }, title: `Дивиденды за ${yearOf(G.t) - 1} год`, text: `Чистая прибыль холдинга за прошлый год — ${fmtM(np)}. Норматив для госкомпаний — 25% прибыли в бюджет: ${fmtM(amt)}. Можно попросить оставить деньги на инвестиции.`,
        choices: [{ label: "Выплатить", hint: `${fmtM(amt)}, доверие +1` }, { label: "Просить отсрочку", hint: "при отказе — выплата ×1,5 и доверие −2" }], def: 0 });
    }
  }
  // случайное событие
  if (chance(G, 0.5 * D.events)) {
    const keys = Object.keys(EVENTS).filter((k) => {
      const E = EVENTS[k];
      if ((G.ev.cd[k] || -99) > G.t) return false;
      if (E.once && G.ev.once[k]) return false;
      return E.w(G) > 0;
    });
    const k = pickW(G, keys, (x) => EVENTS[x].w(G));
    if (k) {
      const ev = EVENTS[k].make(G);
      if (ev) {
        G.ev.cd[k] = G.t + (EVENTS[k].cd || 6);
        if (EVENTS[k].once) G.ev.once[k] = true;
        queueEvent(G, k, ev);
      }
    }
  }
  // снятие заморозки
  for (const [k, until] of Object.entries(G.ev.active)) {
    if (k.startsWith("unhold_") && until <= G.t) {
      const c = G.contracts.find((x) => x.id === k.slice(7));
      if (c) c.hold = false;
      delete G.ev.active[k];
    }
  }
  for (const pp of Object.values(G.partners)) if (pp.frozen > 0) pp.frozen--;
}

export function resolveEvent(G, id, idx) {
  const ev = G.ev.queue.find((x) => x.id === id);
  if (!ev) return;
  G.ev.queue = G.ev.queue.filter((x) => x !== ev);
  const E = EVENTS[ev.key];
  if (E && E.apply) E.apply(G, ev.p || {}, idx);
  const ch = ev.choices[idx];
  logF(G, `${ev.title}: ${ch ? ch.label.toLowerCase() : "решение принято"}.`, "event");
}
/* Нерешённые до конца месяца события закрываются вариантом по умолчанию */
export function autoResolve(G) {
  for (const ev of [...G.ev.queue]) if (ev.t < G.t) resolveEvent(G, ev.id, ev.def);
}
export { rate, convertFx };
