import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const OUT = "/Users/sunsizhe/Documents/deepseek-harness/handoff/fonts-gf/english";
const UA = { "user-agent": "Mozilla/5.0" };
mkdirSync(OUT, { recursive: true });

// 从 MotionSites 提示词中提取的新字体（Google Fonts）
const NEW_FONTS = [
  "Inter", "Inter Tight", "Geist", "Figtree", "Instrument Serif", "Barlow",
  "Sora", "JetBrains Mono", "Questrial", "Urbanist", "Newsreader", "Nunito",
  "Prata", "Hanken Grotesk", "Manrope", "Orbitron", "Open Sans"
];

async function dl(name) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${name.replace(/ /g, "+")}&display=swap`, { headers: UA })).text();
    const m = css.match(/src:\s*url\((https:\/\/[^)]+)\)/);
    if (!m) throw new Error("no url");
    const res = await fetch(m[1], { headers: UA });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ext = m[1].includes(".ttf") ? "ttf" : "woff2";
    writeFileSync(path.join(OUT, `${name.replace(/ /g, "_")}.${ext}`), Buffer.from(await res.arrayBuffer()));
    return { name, ok: true, ext };
  } catch (e) { return { name, ok: false, err: e.message }; }
}

const results = [];
for (const n of NEW_FONTS) results.push(await dl(n));

const ok = results.filter((r) => r.ok);
console.log(`\n=== 下载结果：成功 ${ok.length} / ${results.length} ===`);
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.err ? "  (" + r.err + ")" : ""}`);
