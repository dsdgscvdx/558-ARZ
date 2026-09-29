// Сборка: бандлит src/main.js (three.js + three-mesh-bvh + код игры) и встраивает
// JS и CSS в один самодостаточный файл dist/index.html, который открывается без сервера.
import * as esbuild from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const watch = process.argv.includes("--watch");
const dev = watch || process.argv.includes("--dev");

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
  await writeFile(resolve(root, "dist/index.html"), html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`dist/index.html — ${kb} KB${dev ? " (dev)" : ""}`);
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
  await assemble(r.outputFiles[0].text);
}
