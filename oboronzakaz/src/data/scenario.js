/* Стартовое положение — январь 2026 года. Портфель заказов, кредиты и макроэкономика.
   Контракты, заключённые до начала игры, частично оплачены авансами; часть изделий уже в производстве. */

export const START = {
  year: 2026,
  months: 120,          // кампания до декабря 2035 года
  cash: 140000,         // свободные средства, млн ₽
  macro: {
    usd: 92, eurusd: 1.16, usdcny: 7.1, usdinr: 87, usdaed: 3.6725,
    key: 16, infl: 6.5, oil: 60, sanc: 70, ekbPrem: 1.45, labor: 1.0, gozBudget: 1.0, realRate: 8.5, mandSale: 25,
  },
  trust: 60, rep: 60,
  loans: [
    { bank: "psb", kind: "goz", amt: 100000, rate: 7.0, left: 30 },
    { bank: "psb", kind: "mkt", amt: 70000, spread: 2.5, left: 24 },
    { bank: "vtb", kind: "mkt", amt: 60000, spread: 3.0, left: 18 },
    { bank: "sber", kind: "mkt", amt: 40000, spread: 2.75, left: 30 },
    { bank: "gpb", kind: "mkt", amt: 30000, spread: 3.25, left: 12 },
  ],
  // запасы двигателей на складах (шт.)
  stock: { al41f1s: 8, al31fm1: 4, al31fp: 4, rd33mk: 4, vk2500: 24, tv7v: 4, ps90: 8, pd14: 6, d136: 12, pw207: 30, t72b3m: 6, btr82a: 10, tigrm: 10 },
  /* Контракты: kind goz | exp | civ; client: mo, rosgv, mchs или код страны, или гражданский заказчик;
     price — за единицу (₽ млн для goz/civ и стран ОДКБ, $ млн для экспорта — пересчитывается в валюту контракта);
     due — срок исполнения (номер месяца от января 2026), adv — полученный аванс (доля), rate — курс на дату аванса. */
  /* Контракты: kind goz | exp | civ; client: mo, rosgv, mchs или код страны, или гражданский заказчик.
     ГОЗ и гражданские контракты оценены «затраты плюс»: m — заложенная рентабельность к нормативной себестоимости
     (старые контракты съела инфляция — рентабельность ниже нынешних 8–9%).
     Экспорт: price — $ млн за единицу (у стран ОДКБ — ₽ млн), rate — курс доллара на дату получения аванса.
     due — срок исполнения (номер месяца от января 2026), adv — полученный аванс (доля). */
  contracts: [
    // ГОЗ — Минобороны: многолетние контракты 2024–2025 годов
    { kind: "goz", client: "mo", v: "su35s", qty: 20, due: 23, adv: 0.6, m: 0.05 },
    { kind: "goz", client: "mo", v: "su57", qty: 22, due: 35, adv: 0.6, m: 0.06 },
    { kind: "goz", client: "mo", v: "su34m", qty: 18, due: 23, adv: 0.6, m: 0.05 },
    { kind: "goz", client: "mo", v: "su30sm2", qty: 10, due: 17, adv: 0.6, m: 0.06 },
    { kind: "goz", client: "mo", v: "yak130", qty: 14, due: 23, adv: 0.6, m: 0.06 },
    { kind: "goz", client: "mo", v: "mig35s", qty: 4, due: 23, adv: 0.5, m: 0.05 },
    { kind: "goz", client: "mo", v: "mig29k", qty: 4, due: 29, adv: 0.5, m: 0.06 },
    { kind: "goz", client: "mo", v: "il76md90a", qty: 12, due: 35, adv: 0.6, m: 0.04 },
    { kind: "goz", client: "mo", v: "il78m90a", qty: 3, due: 35, adv: 0.6, m: 0.05 },
    { kind: "goz", client: "mo", v: "mi8mtv5", qty: 30, due: 17, adv: 0.6, m: 0.07 },
    { kind: "goz", client: "mo", v: "mi8amtsh", qty: 26, due: 17, adv: 0.6, m: 0.07 },
    { kind: "goz", client: "mo", v: "mi28nm", qty: 22, due: 23, adv: 0.6, m: 0.06 },
    { kind: "goz", client: "mo", v: "ka52m", qty: 24, due: 23, adv: 0.6, m: 0.06 },
    { kind: "goz", client: "mo", v: "mi35m", qty: 8, due: 17, adv: 0.6, m: 0.07 },
    { kind: "goz", client: "mo", v: "mi38t", qty: 5, due: 17, adv: 0.6, m: 0.06 },
    { kind: "goz", client: "mo", v: "mi26t2v", qty: 2, due: 23, adv: 0.6, m: 0.06 },
    { kind: "goz", client: "mo", v: "ansatu", qty: 6, due: 17, adv: 0.6, m: 0.07 },
    { kind: "goz", client: "mo", v: "t90m", qty: 80, due: 17, adv: 0.7, m: 0.06 },
    { kind: "goz", client: "mo", v: "t72b3m", qty: 160, due: 17, adv: 0.7, m: 0.07 },
    { kind: "goz", client: "mo", v: "bmpt", qty: 8, due: 17, adv: 0.7, m: 0.07 },
    { kind: "goz", client: "mo", v: "tos1a", qty: 14, due: 17, adv: 0.7, m: 0.07 },
    { kind: "goz", client: "mo", v: "bmp3", qty: 130, due: 17, adv: 0.7, m: 0.06 },
    { kind: "goz", client: "mo", v: "bmd4m", qty: 40, due: 17, adv: 0.7, m: 0.06 },
    { kind: "goz", client: "mo", v: "btrmdm", qty: 26, due: 17, adv: 0.7, m: 0.07 },
    { kind: "goz", client: "mo", v: "btr82a", qty: 240, due: 17, adv: 0.7, m: 0.07 },
    { kind: "goz", client: "rosgv", v: "tigrm", qty: 160, due: 17, adv: 0.5, m: 0.07 },
    { kind: "goz", client: "mo", v: "2s19m2", qty: 30, due: 17, adv: 0.7, m: 0.06 },
    { kind: "goz", client: "mo", v: "tornados", qty: 14, due: 17, adv: 0.7, m: 0.06 },
    { kind: "goz", client: "mo", v: "tornadog", qty: 26, due: 17, adv: 0.7, m: 0.07 },
    { kind: "goz", client: "mo", v: "9m55k", qty: 16, due: 17, adv: 0.7, m: 0.07 },
    { kind: "goz", client: "mo", v: "s400", qty: 4, due: 29, adv: 0.6, m: 0.06 },
    { kind: "goz", client: "mo", v: "s350", qty: 3, due: 29, adv: 0.6, m: 0.06 },
    { kind: "goz", client: "mo", v: "torm2", qty: 22, due: 17, adv: 0.6, m: 0.07 },
    { kind: "goz", client: "mo", v: "pantsirs1", qty: 26, due: 17, adv: 0.6, m: 0.07 },
    { kind: "goz", client: "mo", v: "kornetd", qty: 40, due: 17, adv: 0.6, m: 0.07 },
    { kind: "goz", client: "mo", v: "r771", qty: 32, due: 17, adv: 0.6, m: 0.06 },
    { kind: "goz", client: "mo", v: "r74m", qty: 22, due: 17, adv: 0.6, m: 0.06 },
    { kind: "goz", client: "mo", v: "kh59mk2", qty: 14, due: 17, adv: 0.6, m: 0.06 },
    { kind: "goz", client: "mo", v: "kh35u", qty: 11, due: 17, adv: 0.6, m: 0.06 },
    { kind: "goz", client: "mo", v: "iskanderm", qty: 2, due: 29, adv: 0.6, m: 0.07 },
    { kind: "goz", client: "mo", v: "verba", qty: 8, due: 17, adv: 0.6, m: 0.07 },
    { kind: "goz", client: "mo", v: "3m14", qty: 14, due: 17, adv: 0.6, m: 0.06 },
    { kind: "goz", client: "mo", v: "p6363", qty: 3, due: 41, adv: 0.5, m: 0.05 },
    { kind: "goz", client: "mo", v: "p677", qty: 1, due: 29, adv: 0.5, m: 0.04 },
    { kind: "goz", client: "mo", v: "p22350", qty: 2, due: 47, adv: 0.5, m: 0.05 },
    { kind: "goz", client: "mo", v: "p20380", qty: 2, due: 35, adv: 0.5, m: 0.05 },
    { kind: "goz", client: "mo", v: "orion", qty: 12, due: 17, adv: 0.6, m: 0.07 },
    // гражданские заказчики
    { kind: "civ", client: "mchs", v: "mi8mtv1", qty: 6, due: 17, adv: 0.3, m: 0.06 },
    { kind: "civ", client: "aero", v: "sj100", qty: 10, due: 35, adv: 0.1, m: 0.03 },
    { kind: "civ", client: "aero", v: "ms21", qty: 6, due: 35, adv: 0.1, m: 0.03 },
    { kind: "civ", client: "gtlk", v: "mi171a2", qty: 8, due: 17, adv: 0.2, m: 0.06 },
    { kind: "civ", client: "nssa", v: "ansat", qty: 12, due: 11, adv: 0.2, m: 0.06 },
    { kind: "civ", client: "rail", v: "railcar", qty: 40, due: 11, adv: 0.1, m: 0.05 },
    { kind: "civ", client: "gazprom", v: "gtu16p", qty: 10, due: 17, adv: 0.3, m: 0.08 },
    { kind: "civ", client: "norebo", v: "trawler", qty: 2, due: 23, adv: 0.3, m: 0.06 },
    // экспорт (цены в $ млн за единицу; у стран ОДКБ — в ₽ млн)
    { kind: "exp", client: "in", v: "s400e", qty: 4, price: 520, due: 23, adv: 0.5, rate: 75 },
    { kind: "exp", client: "in", v: "su30mki_kit", qty: 12, price: 28, due: 23, adv: 0.3, rate: 88 },
    { kind: "exp", client: "in", v: "al31fp_kit", qty: 60, price: 4.2, due: 23, adv: 0.3, rate: 88 },
    { kind: "exp", client: "in", v: "t90s_kit", qty: 40, price: 3.4, due: 17, adv: 0.3, rate: 85 },
    { kind: "exp", client: "cn", v: "al31fn", qty: 30, price: 4.6, due: 17, adv: 0.3, rate: 90 },
    { kind: "exp", client: "cn", v: "rd93", qty: 24, price: 3.0, due: 11, adv: 0.3, rate: 90 },
    { kind: "exp", client: "dz", v: "su57e", qty: 6, price: 88, due: 29, adv: 0.25, rate: 85 },
    { kind: "exp", client: "dz", v: "su35e", qty: 6, price: 62, due: 17, adv: 0.3, rate: 82 },
    { kind: "exp", client: "by", v: "su30sm2", qty: 4, price: 2600, due: 17, adv: 0.3 },
    { kind: "exp", client: "by", v: "yak130", qty: 4, price: 1100, due: 11, adv: 0.3 },
    { kind: "exp", client: "kz", v: "btr82a", qty: 30, price: 60, due: 11, adv: 0.3 },
    { kind: "exp", client: "mm", v: "su30sme", qty: 4, price: 50, due: 11, adv: 0.3, rate: 80 },
    { kind: "exp", client: "la", v: "t72b1ms", qty: 10, price: 2.4, due: 11, adv: 0.3, rate: 85 },
    { kind: "exp", client: "vn", v: "yak130e", qty: 6, price: 17, due: 17, adv: 0.3, rate: 88 },
    { kind: "exp", client: "ae", v: "pantsirs1m", qty: 6, price: 17, due: 17, adv: 0.3, rate: 90 },
    { kind: "exp", client: "bd", v: "mi171sh", qty: 4, price: 18, due: 11, adv: 0.3, rate: 90 },
    { kind: "exp", client: "dz", v: "p6361", qty: 2, price: 520, due: 35, adv: 0.3, rate: 84 },
  ],
  // парк нашей техники у партнёров (для сервисных контрактов): семейство → шт.
  fleets: {
    in: { su30: 260, mig29: 60, mig29k: 40, t90: 1100, mi8: 150, s400: 6, al31: 400 },
    cn: { su35: 24, su30: 100, mi8: 100, s400: 4, al31: 300, rd33: 150 },
    dz: { su30: 58, mig29: 14, su35: 8, yak130: 16, mi28: 42, mi26: 6, mi171: 40, t90: 600, bmpt: 300, tos1: 50, tor: 10, pantsir: 38, iskander: 4, p636: 8 },
    eg: { mig29: 46, ka52: 46, mi8: 30, tor: 16, s350: 0 },
    vn: { su30: 36, yak130: 12, mi8: 40, t90: 64, p636: 6 },
    id: { su30: 16, bmp3: 54, mi35: 7, mi8: 15 },
    my: { su30: 18 },
    ae: { bmp3: 600, pantsir: 50 },
    iq: { mi28: 15, mi35: 6, mi171: 20, t90: 73, pantsir: 24, tos1: 10 },
    rs: { mig29: 14, mi35: 4, mi8: 3, pantsir: 1 },
    by: { su30: 8, yak130: 12, mi35: 12, mi8: 12, tor: 8, btr82: 100 },
    kz: { su30: 24, mi35: 12, mi171: 20, btr82: 140, tos1: 3 },
    am: { su30: 4, iskander: 1, tor: 2 },
    mm: { su30: 6, yak130: 16, mi35: 12, mi8: 20, pantsir: 6 },
    bd: { yak130: 16, mi171: 30, mig29: 8, btr82: 300 },
    ug: { su30: 6, mi8: 6, t90: 44 },
    ao: { su30: 12, mi8: 10 },
    pe: { mi171: 24, mig29: 18, mi35: 16 },
    ve: { su30: 24, mi35: 10, mi8: 30, mi26: 3, t72: 92, bmp3: 123 },
    la: { yak130: 10, mi8: 6, t72: 25 },
    et: { mi35: 8, mi171: 10, pantsir: 4 },
    tr: { s400: 4 },
  },
};

export const BANKS = {
  psb: { name: "ПСБ", note: "опорный банк ОПК" },
  vtb: { name: "ВТБ", note: "" },
  sber: { name: "Сбербанк", note: "" },
  gpb: { name: "Газпромбанк", note: "" },
  state: { name: "Минфин России", note: "бюджетный кредит" },
  od: { name: "ПСБ (овердрафт)", note: "автоматически при нехватке денег" },
};

export const GOZ_CLIENTS = {
  mo: "Минобороны России",
  rosgv: "Росгвардия",
  mchs: "МЧС России",
};

/* Международные выставки вооружений: месяц (0 — январь), чётность года, регион, стоимость участия (млн ₽) */
export const EXPOS = [
  { id: "idex", name: "IDEX", city: "Абу-Даби", month: 1, odd: true, region: "me", cost: 900, focus: ["ae", "sa", "eg", "iq", "dz"] },
  { id: "aeroindia", name: "Aero India", city: "Бангалор", month: 1, odd: true, region: "asia", cost: 700, focus: ["in"] },
  { id: "wds", name: "World Defense Show", city: "Эр-Рияд", month: 1, odd: false, region: "me", cost: 800, focus: ["sa", "ae", "iq", "eg"] },
  { id: "laad", name: "LAAD", city: "Рио-де-Жанейро", month: 3, odd: true, region: "latam", cost: 400, focus: ["pe", "ve"] },
  { id: "dsa", name: "DSA", city: "Куала-Лумпур", month: 4, odd: false, region: "asia", cost: 500, focus: ["my", "id", "vn", "bd", "la", "mm"] },
  { id: "kadex", name: "KADEX", city: "Астана", month: 5, odd: false, region: "cis", cost: 300, focus: ["kz", "by", "am"] },
  { id: "aad", name: "Africa Aerospace and Defence", city: "Претория", month: 8, odd: false, region: "africa", cost: 500, focus: ["ug", "ao", "et", "dz"] },
  { id: "dubai", name: "Dubai Airshow", city: "Дубай", month: 10, odd: true, region: "me", cost: 1100, focus: ["ae", "sa", "eg", "iq", "in", "dz"] },
  { id: "zhuhai", name: "Airshow China", city: "Чжухай", month: 10, odd: false, region: "asia", cost: 800, focus: ["cn", "mm", "la", "bd", "vn"] },
  { id: "indodef", name: "Indo Defence", city: "Джакарта", month: 10, odd: false, region: "asia", cost: 500, focus: ["id", "my", "vn"] },
  { id: "edex", name: "EDEX", city: "Каир", month: 11, odd: true, region: "africa", cost: 600, focus: ["eg", "dz", "et", "ug", "ao"] },
];

/* Коды стран для номеров экспортных контрактов (ISO 3166-1) */
export const ISO = {
  in: "356", cn: "156", dz: "012", eg: "818", vn: "704", id: "360", my: "458", ae: "784", sa: "682", iq: "368",
  rs: "688", by: "112", kz: "398", am: "051", mm: "104", bd: "050", ug: "800", ao: "024", pe: "604", ve: "862",
  la: "418", et: "231", tr: "792",
};
