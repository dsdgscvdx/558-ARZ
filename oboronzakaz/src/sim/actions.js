/* Действия игрока. Интерфейс вызывает только эти функции и функции модулей, перечисленные в конце файла. */
import { ENT } from "../data/enterprises.js";
import { FAM, VAR } from "./catalog.js";
import { clamp } from "./util.js";
import { spend, plAdd, logF, fmtM, cfAdd } from "./finance.js";
import { rate } from "./macro.js";
import { clientName } from "./contracts.js";
import { endMonth } from "./tick.js";

const line = (G, entId, fam) => G.ents[entId].lines.find((l) => l.fam === fam);

export function setLineAuto(G, entId, fam, auto) { const l = line(G, entId, fam); l.auto = !!auto; if (auto) l.plan = {}; }
export function setLinePlan(G, entId, fam, vid, n) { const l = line(G, entId, fam); l.auto = false; l.plan[vid] = clamp(Math.round(n), 0, l.slots); if (!l.plan[vid]) delete l.plan[vid]; }
export function setLineHold(G, entId, fam, hold) { line(G, entId, fam).hold = !!hold; }

export function setWage(G, entId, ratio) { G.ents[entId].wageR = clamp(ratio, 0.8, 1.6); }
export function setTarget(G, entId, n) { G.ents[entId].target = Math.max(100, Math.round(n)); }
export function setMaint(G, entId, r) { G.ents[entId].maint = clamp(r, 0.01, 0.12); }

export function setPrio(G, cid, prio) { const c = G.contracts.find((x) => x.id === cid); if (c) c.prio = prio; }
export function setHold(G, cid, hold) { const c = G.contracts.find((x) => x.id === cid); if (c && c.kind !== "goz") c.hold = !!hold; }

/* Расторжение экспортного или гражданского контракта по нашей инициативе: возврат аванса и неустойка 5% */
export function cancelContract(G, cid) {
  const c = G.contracts.find((x) => x.id === cid);
  if (!c || c.status !== "active" || c.kind === "goz" || c.kind === "svc") return;
  const r = rate(G, c.cur);
  const fine = 0.05 * (c.qty - c.done) * c.price * r;
  spend(G, c.advLeft + fine, "other");
  plAdd(G, "pen", fine);
  c.advLeft = 0;
  c.status = "cancelled";
  if (c.kind === "exp") { G.partners[c.client].rel = clamp(G.partners[c.client].rel - 20, 0, 100); G.rep -= 5; }
  logF(G, `Контракт ${c.no} с заказчиком «${clientName(c)}» расторгнут по нашей инициативе. Возврат аванса и неустойка ${fmtM(fine)}.`, "warn");
}

export function setAutoFx(G, on) { G.autoFx = !!on; }

export function nextMonth(G) { return endMonth(G); }

export { ENT, FAM, VAR, cfAdd };
