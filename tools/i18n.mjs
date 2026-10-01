// Локализация сборки: токенизатор минифицированного бандла находит строковые литералы и
// статические куски шаблонных строк и заменяет их по словарю (ключ — русский текст).
// Комментариев в минифицированном коде нет, поэтому вся кириллица — это строки интерфейса.

const CYR = /[А-Яа-яЁё]/;
const REGEX_PREV = new Set("(,=:[!&|?;{}~+-*%<>^".split(""));
const REGEX_WORDS = new Set(["return", "typeof", "case", "void", "in", "of", "new", "delete", "throw", "else", "do", "instanceof"]);

/* разбор: вызывает onChunk(raw, quote) для каждого строкового фрагмента, возвращает собранный текст */
export function transformJS(src, onChunk) {
  let out = "", i = 0;
  const n = src.length;
  const stack = [];            // для шаблонов: глубина фигурных скобок внутри ${…}
  let lastSig = "";            // последний значимый символ/слово (для отличия регулярки от деления)
  const isIdent = (c) => /[A-Za-z0-9_$]/.test(c);
  while (i < n) {
    const c = src[i];
    // комментарии
    if (c === "/" && src[i + 1] === "/") { const e = src.indexOf("\n", i); const j = e < 0 ? n : e; out += src.slice(i, j); i = j; continue; }
    if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); const j = e < 0 ? n : e + 2; out += src.slice(i, j); i = j; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === "\\") j++; j++; }
      out += c + onChunk(src.slice(i + 1, j), c) + c; i = j + 1; lastSig = "s"; continue;
    }
    if (c === "`") { i = template(i + 1); lastSig = "s"; continue; }
    if (c === "/") {
      const prevWord = /([A-Za-z_$][\w$]*)\s*$/.exec(out);
      const regex = lastSig === "" || REGEX_PREV.has(lastSig) || (prevWord && REGEX_WORDS.has(prevWord[1]) && lastSig === "w");
      if (regex) {
        let j = i + 1, cls = false;
        while (j < n) { const d = src[j]; if (d === "\\") { j += 2; continue; } if (d === "[") cls = true; else if (d === "]") cls = false; else if (d === "/" && !cls) break; else if (d === "\n") break; j++; }
        j++; while (j < n && /[a-z]/.test(src[j])) j++;
        out += src.slice(i, j); i = j; lastSig = "s"; continue;
      }
    }
    if (c === "{" && stack.length) stack[stack.length - 1]++;
    if (c === "}" && stack.length) {
      if (stack[stack.length - 1] === 0) { stack.pop(); out += "}"; i = template(i + 1); lastSig = "s"; continue; }
      stack[stack.length - 1]--;
    }
    out += c;
    if (!/\s/.test(c)) lastSig = isIdent(c) ? "w" : c;
    i++;
  }
  return out;

  // шаблонная строка с позиции p (после открывающего ` или закрывающей } подстановки)
  function template(p) {
    let j = p;
    while (j < n) {
      if (src[j] === "\\") { j += 2; continue; }
      if (src[j] === "`") { out += (p === i + 1 && src[i] === "`" ? "`" : "") + onChunk(src.slice(p, j), "`") + "`"; return j + 1; }
      if (src[j] === "$" && src[j + 1] === "{") { out += (src[i] === "`" && p === i + 1 ? "`" : "") + onChunk(src.slice(p, j), "`") + "${"; stack.push(0); return j + 2; }
      j++;
    }
    throw new Error("незакрытая шаблонная строка");
  }
}

const unesc = (raw) => raw.replace(/\\(["'`\\$])/g, "$1");
function escFor(text, quote) {
  let t = text.replace(/\\(?!n|u|x|t)/g, "\\\\");
  if (quote === "`") t = t.replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
  else t = t.split(quote).join("\\" + quote);
  return t;
}

/* все русские фрагменты бандла */
export function extractKeys(js) {
  const keys = new Set();
  transformJS(js, (raw) => { if (CYR.test(raw)) keys.add(unesc(raw)); return raw; });
  return [...keys];
}
/* перевод бандла: dict[ru] = en | null (оставить как есть); missing — непереведённые ключи */
export function translateJS(js, dict, missing = new Set()) {
  return transformJS(js, (raw, q) => {
    if (!CYR.test(raw)) return raw;
    const k = unesc(raw);
    if (!(k in dict)) { missing.add(k); return raw; }
    return dict[k] == null ? raw : escFor(dict[k], q);
  });
}
/* перевод статического HTML: текстовые узлы и атрибуты title/aria-label/placeholder/value */
export function translateHTML(html, dict, missing = new Set()) {
  const tr = (s) => {
    const k = s.trim(); if (!CYR.test(k)) return s;
    if (!(k in dict)) { missing.add(k); return s; }
    return dict[k] == null ? s : s.replace(k, dict[k]);
  };
  return html
    .replace(/(title|aria-label|placeholder|value)="([^"]*)"/g, (m, a, v) => `${a}="${tr(v)}"`)
    .replace(/>([^<>]+)</g, (m, t) => ">" + tr(t) + "<");
}
export function extractHTML(html) {
  const keys = new Set();
  translateHTML(html, {}, keys);
  return [...keys];
}
