/* Генерирует точечную маску суши (1° × 1°) из Natural Earth (world-atlas, land-110m) для карт в игре.
   Границы государств не рисуются — только суша. Результат: src/data/worldmap.js */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { feature } from "topojson-client";
import { geoContains } from "d3-geo";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const topo = JSON.parse(await readFile(resolve(root, "node_modules/world-atlas/land-110m.json"), "utf8"));
const land = feature(topo, topo.objects.land);

const LAT0 = 83, LAT1 = -57, LON0 = -180, LON1 = 180, STEP = 1;
const W = (LON1 - LON0) / STEP, H = (LAT0 - LAT1) / STEP + 1;
const bits = new Uint8Array(Math.ceil((W * H) / 8));
let n = 0;
for (let r = 0; r < H; r++) {
  const lat = LAT0 - r * STEP;
  for (let c = 0; c < W; c++) {
    const lon = LON0 + (c + 0.5) * STEP;
    if (geoContains(land, [lon, lat])) { const i = r * W + c; bits[i >> 3] |= 1 << (i & 7); n++; }
  }
}
const b64 = Buffer.from(bits).toString("base64");
const out = `/* Маска суши 1°×1° (Natural Earth 110m через world-atlas), сгенерировано tools/gen-map.mjs. */
export const MAP = { lat0: ${LAT0}, lon0: ${LON0}, step: ${STEP}, w: ${W}, h: ${H}, bits: "${b64}" };
`;
await writeFile(resolve(root, "src/data/worldmap.js"), out);
console.log(`src/data/worldmap.js: ${W}×${H}, суша ${n} точек, ${(out.length / 1024).toFixed(1)} KB`);
