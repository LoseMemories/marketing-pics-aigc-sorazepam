import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = "/Users/sunsizhe/Documents/Codex/2026-10-25/ni/marketing-photo-aigc/backend/data/motionsites";
const CATALOG = "/Users/sunsizhe/Documents/Codex/2026-10-25/ni/marketing-photo-aigc/frontend/src/shared/fonts/font-catalog.ts";

function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith("-prompt.md") || e.name.endsWith(".json")) acc.push(p);
  }
  return acc;
}

const prompts = [];
for (const f of walk(ROOT)) {
  if (f.endsWith("-prompt.md")) prompts.push(readFileSync(f, "utf8"));
  else {
    try { const j = JSON.parse(readFileSync(f, "utf8")); if (j.description) prompts.push(j.description); } catch {}
  }
}

const STOP = /^(sans|serif|mono|system|inherit|none|the|and|or|for|with|body|heading|display|font|size|weight|line|height|color|family|var|clamp|px|em|rem|normal|bold|medium|regular|light|italic|initial|unset|auto|text|title|main|hero|logo|button|link|nav|head|script|style|width|max|min)$/i;

const candidates = new Map();
function add(raw) {
  let name = (raw || "").trim().replace(/^["']|["']$/g, "").replace(/%20/g, " ").replace(/\+/g, " ");
  if (!name || name.length < 2 || name.length > 40) return;
  if (STOP.test(name)) return;
  if (/^\d/.test(name)) return;
  if (!/^[A-Z]/.test(name)) return; // 字体名通常大写开头
  candidates.set(name, (candidates.get(name) || 0) + 1);
}

for (const text of prompts) {
  // Google Fonts family=...
  for (const m of text.matchAll(/family=([A-Za-z0-9+%\- ]+)/g)) {
    for (const part of m[1].split(/[&+]/)) add(part);
  }
  // CSS 变量 / font-family / font: Name
  for (const m of text.matchAll(/(?:--font-[a-z-]+|font-family|typeface|typography)\s*[:：]\s*['"]?([A-Za-z][A-Za-z0-9\-_ ]{1,40})/gi)) {
    add(m[1].split(",")[0].split(" ")[0]);
  }
  // "Font: Anton" / "Body font: 'Inter'"
  for (const m of text.matchAll(/(?:font|typeface)\s*[:：]\s*['"]?([A-Z][A-Za-z0-9\-]+)/g)) add(m[1]);
}

// 现有字体库
const cat = readFileSync(CATALOG, "utf8");
const existing = new Set([...cat.matchAll(/"name": "([^"]+)"/g)].map((m) => m[1].toLowerCase()));

const extracted = [...candidates.entries()].sort((a, b) => b[1] - a[1]);
console.log(`扫描 ${prompts.length} 段提示词，提取到 ${extracted.length} 个字体候选：\n`);

const known = [], neu = [];
for (const [name, count] of extracted) {
  const isKnown = existing.has(name.toLowerCase());
  (isKnown ? known : neu).push({ name, count });
}

console.log("=== 已在字体库中 ===");
for (const k of known) console.log(`  ✓ ${k.name} (${k.count})`);
console.log("\n=== 新字体（库里没有）===");
for (const n of neu) console.log(`  + ${n.name} (${n.count})`);
