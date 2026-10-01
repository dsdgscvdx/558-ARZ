// Сборка: бандлит src/main.js (three.js + three-mesh-bvh + код игры) и встраивает
// JS и CSS в один самодостаточный файл dist/index.html, который открывается без сервера.
import * as esbuild from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { extractKeys, translateJS, translateHTML } from "./i18n.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const watch = process.argv.includes("--watch");
const dev = watch || process.argv.includes("--dev");
// --crazygames: английская сборка для CrazyGames (SDK v3) → dist/crazygames/index.html и zip-архив
const cg = process.argv.includes("--crazygames");

/* английский словарь + надписи, которые остаются по-русски (кабина, трафареты, шейдеры) */
async function enDict() {
  const dict = { ...(await import("./lang/en.mjs")).default };
  const keep = ["view/cockpit.js", "view/cockpitArt.js", "view/decals.js", "view/vehicles.js", "view/materials.js", "view/effects.js", "view/render.js"];
  for (const f of keep) for (const k0 of extractKeys(await readFile(resolve(root, "src", f), "utf8"))) for (const k of [k0, k0.replace(/\\n/g, "\n")]) if (!(k in dict)) dict[k] = null;
  return dict;
}
async function assembleCG(jsText) {
  const dict = await enDict(), missing = new Set();
  let js = translateJS(jsText, dict, missing).replace(/"ru-RU"/g, '"en-US"');
  for (const [k, v] of Object.entries(dict)) if (v == null && k.length > 300 && /uniform|gl_/.test(k)) missing.delete(k);
  const [tpl0, css] = await Promise.all([readFile(resolve(root, "src/index.html"), "utf8"), readFile(resolve(root, "src/styles.css"), "utf8")]);
  const tpl = translateHTML(tpl0, dict, missing).replace('<html lang="ru">', '<html lang="en">')
    .replace("</head>", '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n</head>');
  const shaders = [...missing].filter((k) => k.length > 300 && /uniform|gl_/.test(k));
  for (const k of shaders) missing.delete(k);
  if (missing.size) { console.warn(`не переведено строк: ${missing.size}`); for (const k of missing) console.warn("  " + JSON.stringify(k).slice(0, 160)); }
  js = js.replace(/<\/script/gi, "<\\/script");
  const html = tpl.replace("<!--CSS-->", () => `<style>\n${css}</style>`).replace("<!--JS-->", () => `<script>\n${js}</script>`);
  const dir = resolve(root, "dist/crazygames");
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, "index.html"), html);
  const zip = resolve(root, "dist/558-arz-crazygames.zip");
  try { execFileSync("rm", ["-f", zip]); execFileSync("zip", ["-j", "-9", "-q", zip, resolve(dir, "index.html")]); } catch (e) { console.warn("zip:", e.message); }
  console.log(`dist/crazygames/index.html — ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB, архив dist/558-arz-crazygames.zip`);
}

async function assemble(jsText) {
  const [tpl, css] = await Promise.all([
    readFile(resolve(root, "src/index.html"), "utf8"),
    readFile(resolve(root, "src/styles.css"), "utf8"),
  ]);
  const js = jsText.replace(/<\/script/gi, "<\\/script");
  const html = tpl
    .replace("<!--CSS-->", () => `<style>\n${css}</style>`)
    .replace("<!--JS-->", () => `<script>\n${js}</script>`);
  await mkdir(resolve(root, "dist"), { recursive: true });
  const out = dev ? "dist/dev.html" : "dist/index.html";   // отладочная сборка не попадает в репозиторий
  await writeFile(resolve(root, out), html);
  if (!dev) {
    // вариант для публикации артефактом: оболочку <!doctype>/<html>/<head>/<body> добавляет площадка
    const art = html
      .replace(/<!doctype html>\s*/i, "").replace(/<html[^>]*>/i, "").replace(/<\/html>\s*$/i, "")
      .replace(/<head>/i, "").replace(/<\/head>/i, "").replace(/<body>/i, "").replace(/<\/body>/i, "")
      .replace(/<meta charset="utf-8">/i, "").replace(/<meta name="viewport"[^>]*>/i, "");
    await writeFile(resolve(root, "dist/artifact.html"), art.trimStart());
  }
  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`${out} — ${kb} KB${dev ? " (dev)" : ""}`);
}

const options = {
  entryPoints: [resolve(root, "src/main.js")],
  bundle: true,
  format: "iife",
  target: ["es2020"],
  minify: !dev,
  sourcemap: dev ? "inline" : false,
  write: false,
  legalComments: "none",
  logLevel: "warning",
  define: { __DEV__: dev ? "true" : "false" },
  ...(cg ? { charset: "utf8" } : {}),
};

if (watch) {
  const ctx = await esbuild.context({
    ...options,
    plugins: [{ name: "assemble", setup(b) { b.onEnd(async (r) => { if (!r.errors.length) await assemble(r.outputFiles[0].text); }); } }],
  });
  await ctx.watch();
  console.log("watching…");
} else {
  const r = await esbuild.build(options);
  if (cg) await assembleCG(r.outputFiles[0].text);
  else await assemble(r.outputFiles[0].text);
}
