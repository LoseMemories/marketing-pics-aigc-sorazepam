import { writeFileSync, mkdirSync, readdirSync, copyFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const OUT = "/Users/sunsizhe/Documents/deepseek-harness/handoff/fonts";
const TMP = "/tmp/ms-fonts3";
const SLUGS = [
  "ranade", "chillax", "clash-display", "cabinet-grotesk", "satoshi",
  "kihim", "rowan", "general-sans", "comico", "gambetta",
  "synonym", "technor", "gambarino", "sentient", "boska",
  "switzer", "tabular", "tanker", "expose", "striper"
];

const list = await (await fetch("https://api.fontshare.com/v2/fonts", { headers: { "user-agent": "Mozilla/5.0" } })).json();
const metaBySlug = new Map(list.fonts.map((f) => [f.slug, f]));

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const manifest = [];
for (const slug of SLUGS) {
  const m = metaBySlug.get(slug) || {};
  const category = m.category || "?";
  const tags = (m.font_tags || []).slice(0, 6);
  const story = (m.story || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 160);

  const dir = path.join(OUT, slug);
  mkdirSync(dir, { recursive: true });
  const zipPath = path.join(TMP, `${slug}.zip`);
  try {
    const res = await fetch(`https://api.fontshare.com/v2/fonts/download/${slug}`, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
    const extractDir = path.join(TMP, slug);
    mkdirSync(extractDir, { recursive: true });
    execFileSync("unzip", ["-o", "-q", zipPath, "-d", extractDir]);

    const woff2 = await findExt(extractDir, ".woff2");
    const ttf = (await findExt(extractDir, ".ttf")) || (await findExt(extractDir, ".otf"));
    let woff2File = null, ttfFile = null;
    if (woff2) { copyFileSync(woff2, path.join(dir, `${slug}.woff2`)); woff2File = `${slug}.woff2`; }
    if (ttf) { copyFileSync(ttf, path.join(dir, `${slug}.ttf`)); ttfFile = `${slug}.ttf`; }

    manifest.push({ name: m.name || slug, slug, category, tags, story, woff2: woff2File, ttf: ttfFile });
    console.log(`✓ ${m.name || slug}  [${category}]  ${tags.join(", ") || "-"}`);
  } catch (e) {
    console.log(`[skip] ${slug}: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 100));
}

// 写清单
const md = [
  "# 字体清单（Fontshare · FFL 授权）",
  "",
  "| 字体 | 分类 | 风格标签 | 适配场景描述 |",
  "|---|---|---|---|"
];
for (const m of manifest) {
  md.push(`| ${m.name} | ${m.category} | ${m.tags.join(", ") || "—"} | ${m.story.slice(0, 60) || "—"} |`);
}
writeFileSync(path.join(OUT, "manifest.md"), md.join("\n") + "\n", "utf8");
writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

console.log(`\n完成，${manifest.length} 个字体，清单: ${OUT}/manifest.md`);

async function findExt(dir, ext) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const r = await findExt(p, ext);
      if (r) return r;
    } else if (e.name.toLowerCase().endsWith(ext)) return p;
  }
  return null;
}
