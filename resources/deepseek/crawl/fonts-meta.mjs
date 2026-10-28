import { writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

const OUT = "/Users/sunsizhe/Documents/deepseek-harness/handoff/fonts";
const list = await (await fetch("https://api.fontshare.com/v2/fonts", { headers: { "user-agent": "Mozilla/5.0" } })).json();

// 已下载的字体目录
const slugs = readdirSync(OUT).filter((d) => !d.endsWith(".md") && !d.endsWith(".json"));

const FAMILY_MAP = {
  Sans: "sans", Serif: "serif", Display: "display", Mono: "mono", Handwritten: "display", Slab: "serif", Script: "display"
};

const manifest = [];
for (const slug of slugs) {
  const m = list.fonts.find((f) => f.slug === slug);
  if (!m) continue;
  const category = (Array.isArray(m.category) ? m.category : [m.category])[0] || "?";
  const tags = (m.font_tags || []).map((t) => t.name).slice(0, 6);
  const story = (m.story || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
  manifest.push({
    name: m.name, slug, category, family: FAMILY_MAP[category] || "sans", tags, story,
    woff2: `${slug}.woff2`, ttf: `${slug}.ttf`
  });
}

manifest.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
const md = [
  "# 字体清单（Fontshare · FFL 授权）",
  "",
  "| 字体 | 分类 | 项目 font | 适配场景 | 描述 |",
  "|---|---|---|---|---|"
];
for (const m of manifest) {
  md.push(`| ${m.name} | ${m.category} | \`${m.family}\` | ${m.tags.join("、") || "—"} | ${m.story.slice(0, 50) || "—"} |`);
}
writeFileSync(path.join(OUT, "manifest.md"), md.join("\n") + "\n", "utf8");
writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

console.log("字体数:", manifest.length);
for (const m of manifest) console.log(`- ${m.name} [${m.category}→${m.family}] ${m.tags.join("、") || "—"}`);
