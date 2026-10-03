/* Иконки: силуэты техники (заливка) и элементы интерфейса (контур). */

const FILL = {
  air: "M12 2l1.2 5.5L21 12.5V14l-7.8-2-.2 5.5 2.5 2V21L12 20l-3.5 1v-1.5l2.5-2-.2-5.5L3 14v-1.5l7.8-5z",
  heli: "M2 8.2h20v1.3H2zM11.4 9.5h1.3v1.6h-1.3zM5 11h8.5c3 0 5 1.6 5 3.6S16.5 18 13.5 18h-5C6.5 18 5 16.6 5 14.6zM1.5 12.3l4 1.1V15l-4-.8zM7 19.6h10v1.2H7z",
  armor: "M3 14h18a2.5 2.5 0 0 1 0 5H3a2.5 2.5 0 0 1 0-5zM7 10h7.5l1.5 3H6zM14 10.6h8v1.3h-8z",
  art: "M2 15h13v3H2zM15.5 12.5h4l2.5 3V18h-6.5zM4 9.5l9.5-4.3 1 2.3L5 11.8zM5.5 18.5a1.6 1.6 0 1 0 0 .01zM12.5 18.5a1.6 1.6 0 1 0 0 .01zM18.5 18.5a1.6 1.6 0 1 0 0 .01z",
  ad: "M4.5 3.5c-.5 6.5 4 11.5 10.5 12zM9 10l6.3-6.3.9.9L9.9 10.9zM10 15.5h2l2 5H8z",
  missile: "M20.5 3.5c-4 .3-7.2 2.2-9.6 5.2l-3 3.7 2.2 2.2 3.7-3c3-2.4 4.9-5.6 5.2-9.6zM8 11.4l-3.5.6-1.7 2.4 3.8-.2zM12.6 16l-.6 3.5-2.4 1.7.2-3.8zM6.4 15.4l2.2 2.2-3.4 2.2-.9-.9z",
  navy: "M2 15h20l-2.5 4.5H5zM7 11h7v4H7zM10 6h1.3v5H10zM15 13.3h5v1.2h-5z",
  uav: "M11.2 3h1.6v17h-1.6zM2 9.5h20v2H2zM8 18h8v1.6H8z",
  engine: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM11.3 5.5h1.4v4h-1.4zM11.3 14.5h1.4v4h-1.4zM5.5 11.3h4v1.4h-4zM14.5 11.3h4v1.4h-4z",
  civil: "M12 2.5l8.5 4.5v10L12 21.5 3.5 17V7zm0 2.3L6.2 7.8 12 10.9l5.8-3.1zM5.5 9.5v6.3l5.5 2.9v-6.2zm13 0L13 12.5v6.2l5.5-2.9z",
};

const STROKE = {
  dash: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  orders: "M7 3h8l4 4v14H7zM15 3v4h4M10 11h6M10 15h6M10 19h4",
  prod: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1",
  ent: "M3 21V11l5 3V11l5 3V7l8-3v17zM7 21v-3M12 21v-3M17 21v-3",
  rnd: "M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7 15h10",
  export: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9M12 3c-2.5 2.6-3.7 5.6-3.7 9s1.2 6.4 3.7 9",
  fin: "M8 21V4h5.5a4 4 0 0 1 0 8H6M6 16h8",
  journal: "M5 5h14M5 10h14M5 15h14M5 20h9",
  catalog: "M4 4.5A1.5 1.5 0 0 1 5.5 3H11v17H5.5A1.5 1.5 0 0 0 4 21.5zM20 4.5A1.5 1.5 0 0 0 18.5 3H13v17h5.5a1.5 1.5 0 0 1 1.5 1.5z",
  menu: "M4 6h16M4 12h16M4 18h16",
  next: "M5 5l7 7-7 7M13 5l7 7-7 7",
  play: "M7 4l13 8-13 8z",
  warn: "M12 3L2 20h20zM12 9v5M12 17v.5",
  check: "M4 12.5l5 5L20 6.5",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5v.5",
  x: "M6 6l12 12M18 6L6 18",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  back: "M15 5l-7 7 7 7",
  save: "M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v5M16 3v5",
  people: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.8 3.1-6 6.5-6s5.9 2.2 6.5 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.3c2 .8 3.2 2.8 3.5 5.7",
  bolt: "M13 2L5 13h6l-1 9 8-11h-6z",
  bank: "M3 9l9-5 9 5M5 10v8M9.7 10v8M14.3 10v8M19 10v8M3 20h18",
  doc: "M7 3h8l4 4v14H7zM15 3v4h4",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  sun: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1.5v2M12 20.5v2M1.5 12h2M20.5 12h2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M4.6 19.4L6 18M18 6l1.4-1.4",
  moon: "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z",
  help: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.1-2.5 3.8M12 17v.5",
  chart: "M4 20V4M4 20h16M8 16l4-5 3 3 5-7",
  lock: "M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11",
  wrench: "M14.5 6.5a4 4 0 0 0 5 5L21 13l-8 8-3-3 8-8-1.5-1.5a4 4 0 0 1-5-5L13 2z",
  pause: "M8 5v14M16 5v14",
};

export function Ic({ n, size, class: cls, title }) {
  const s = size || 24;
  if (FILL[n]) return (<svg viewBox="0 0 24 24" width={s} height={s} class={cls} fill="currentColor" aria-hidden={title ? undefined : "true"} role={title ? "img" : undefined}>{title ? <title>{title}</title> : null}<path d={FILL[n]} /></svg>);
  const d = STROKE[n] || STROKE.info;
  return (<svg viewBox="0 0 24 24" width={s} height={s} class={cls} fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden={title ? undefined : "true"} role={title ? "img" : undefined}>{title ? <title>{title}</title> : null}<path d={d} /></svg>);
}
export const CAT_ICON = { air: "air", heli: "heli", engine: "engine", armor: "armor", art: "art", ad: "ad", missile: "missile", navy: "navy", uav: "uav", civil: "civil" };
