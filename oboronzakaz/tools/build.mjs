/* Сборка: esbuild бандлит src/ui/main.jsx (Preact + движок + данные), CSS и JS встраиваются в один файл
   dist/index.html, который открывается двойным щелчком без сервера.
   --watch — dist/dev.html с пересборкой; также пишется dist/artifact.html без обёртки документа (для публикации). */
import * as esbuild from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const watch = process.argv.includes("--watch");
const dev = watch || process.argv.includes("--dev");

async function assemble(jsText) {
  const [tpl, css] = await Promise.all([readFile(resolve(root, "src/index.html"), "utf8"), readFile(resolve(root, "src/styles.css"), "utf8")]);
  const js = jsText.replace(/<\/script/gi, "<\\/script");
  const html = tpl.replace("<!--CSS-->", () => `<style>\n${css}</style>`).replace("<!--JS-->", () => `<script>\n${js}</script>`);
  await mkdir(resolve(root, "dist"), { recursive: true });
  const out = dev ? "dist/dev.html" : "dist/index.html";
  await writeFile(resolve(root, out), html);
  if (!dev) {
    const art = html
      .replace(/<!doctype html>\s*/i, "").replace(/<html[^>]*>/i, "").replace(/<\/html>\s*$/i, "")
      .replace(/<head>/i, "").replace(/<\/head>/i, "").replace(/<body>/i, "").replace(/<\/body>/i, "")
      .replace(/<meta charset="utf-8">/i, "").replace(/<meta name="viewport"[^>]*>/i, "");
    await writeFile(resolve(root, "dist/artifact.html"), art.trimStart());
  }
  console.log(`${out} — ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
}

const options = {
  entryPoints: [resolve(root, "src/ui/main.jsx")],
  bundle: true, format: "iife", target: ["es2020"], minify: !dev, sourcemap: dev ? "inline" : false,
  write: false, legalComments: "none", logLevel: "warning", charset: "utf8",
  jsx: "automatic", jsxImportSource: "preact",
  define: { __DEV__: dev ? "true" : "false" },
};

if (watch) {
  const ctx = await esbuild.context({ ...options, plugins: [{ name: "assemble", setup(b) { b.onEnd(async (r) => { if (!r.errors.length) await assemble(r.outputFiles[0].text); }); } }] });
  await ctx.watch();
  console.log("watching…");
} else {
  const r = await esbuild.build(options);
  await assemble(r.outputFiles[0].text);
}
