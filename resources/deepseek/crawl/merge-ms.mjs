import { writeFileSync, readdirSync, copyFileSync, mkdirSync, statSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = "/Users/sunsizhe/Documents/deepseek-harness/handoff/crawl-raw";
const MINE = path.join(ROOT, "motionsites");
const CODEX = path.join(ROOT, "motionsites_codex");

function normCat(c) {
  const t = (c || "").trim().toLowerCase().replace(/[\s-]+/g, "");
  const m = { landingpage: "landingpage", "3d": "3d", creative: "creative", travel: "travel", technology: "technology", ecommerce: "ecommerce" };
  return m[t] || t || "other";
}

function walkJson(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".DS_Store") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkJson(p, acc);
    else if (e.name.endsWith(".json")) acc.push(p);
  }
  return acc;
}

const myFiles = walkJson(MINE);
const codexFiles = walkJson(CODEX);
console.log("mine json:", myFiles.length, "codex json:", codexFiles.length);

const map = new Map();
for (const f of myFiles) {
  const d = JSON.parse(readFileSync(f, "utf8"));
  const key = (d.title || "").trim().toLowerCase();
  if (key) map.set(key, { data: d, fromCodex: false, dir: path.dirname(f), base: path.basename(f, ".json") });
}
for (const f of codexFiles) {
  const d = JSON.parse(readFileSync(f, "utf8"));
  const key = (d.title || "").trim().toLowerCase();
  if (key) map.set(key, { data: d, fromCodex: true, dir: path.dirname(f), base: path.basename(f, ".json") });
}
console.log("unique items (by title):", map.size);

function findImage(dir, base) {
  for (const ext of [".webp", ".gif", ".png", ".jpg", ".jpeg"]) {
    const p = path.join(dir, base + ext);
    try { statSync(p); return p; } catch {}
  }
  return null;
}

const manifest = [];
let freeCount = 0, paidCount = 0, promptCount = 0, copied = 0, promptMdCount = 0;

for (const [key, it] of map) {
  const d = it.data;
  const cat = normCat(d.bigCategory || d.category);
  const promptText = ((d.description && d.description.trim()) || d.prompt || "");
  const isFree = d.access === "free" || (promptText && d.access !== "paid");
  if (isFree) freeCount++; else paidCount++;
  if (promptText) promptCount++;

  const outDir = path.join(MINE, cat);
  mkdirSync(outDir, { recursive: true });
  const base = it.base;

  let imageFile = null;
  const img = findImage(it.dir, base);
  if (img) {
    const dest = path.join(outDir, path.basename(img));
    copyFileSync(img, dest);
    imageFile = path.basename(img);
    copied++;
  }

  const merged = { ...d };
  if (!merged.description && promptText) merged.description = promptText;
  if (!merged.access) merged.access = isFree ? "free" : "paid";
  if (!merged.imageFile) merged.imageFile = imageFile;
  writeFileSync(path.join(outDir, base + ".json"), JSON.stringify(merged, null, 2) + "\n", "utf8");

  if (isFree && promptText) {
    writeFileSync(path.join(outDir, base + "-prompt.md"), promptText + "\n", "utf8");
    promptMdCount++;
  }

  manifest.push({ title: d.title, category: cat, free: isFree, hasPrompt: !!promptText, imageFile, promptLen: promptText.length });
}

manifest.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
const statusOf = (m) => (m.free ? (m.hasPrompt ? "free ✅ 已拿到提示词" : "free ⚠️ 无提示词") : "paid（不免费）");
const lines = [
  "# MotionSites 素材清单",
  "",
  `> 总数 ${manifest.length} · 免费 ${freeCount} · 付费 ${paidCount} · 已拿到提示词 ${promptCount} · 已生成 -prompt.md ${promptMdCount}`,
  "",
  "| 分类 | 标题 | 状态 | 图片 | 提示词长度 |",
  "|---|---|---|---|---|"
];
for (const m of manifest) {
  lines.push(`| ${m.category} | ${m.title} | ${statusOf(m)} | ${m.imageFile || "—"} | ${m.promptLen > 0 ? m.promptLen : "—"} |`);
}
writeFileSync(path.join(MINE, "manifest.md"), lines.join("\n") + "\n", "utf8");

console.log("\n=== 合并完成 ===");
console.log("唯一条目:", map.size, "| 免费:", freeCount, "| 付费:", paidCount, "| 有提示词:", promptCount, "| 复制图片:", copied, "| 生成 prompt.md:", promptMdCount);
console.log("清单:", path.join(MINE, "manifest.md"));
