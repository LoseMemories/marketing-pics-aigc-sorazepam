import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const OUT = "/Users/sunsizhe/Documents/deepseek-harness/handoff/fonts-gf";
const UA = { "user-agent": "Mozilla/5.0" };

const ENGLISH = [
  "Bebas Neue", "Abril Fatface", "Playfair Display", "Lobster", "Pacifico",
  "Caveat", "Dancing Script", "Permanent Marker", "Anton", "Oswald",
  "Montserrat", "Poppins", "Lora", "Merriweather", "Raleway",
  "Josefin Sans", "Comfortaa", "Quicksand", "Shadows Into Light", "Satisfy",
  "Great Vibes", "Righteous", "Bungee", "Fredoka", "Lilita One",
  "Passion One", "Archivo Black", "Space Grotesk", "DM Serif Display", "Special Elite"
];

const CHINESE = [
  "Noto Sans SC", "Noto Serif SC", "Ma Shan Zheng", "Zhi Mang Xing", "Long Cang",
  "Liu Jian Mao Cao", "ZCOOL KuaiLe", "ZCOOL XiaoWei", "ZCOOL QingKe HuangYou", "LXGW WenKai TC",
  "Zen Kaku Gothic New", "Zen Maru Gothic", "Zen Old Mincho", "Zen Antique", "Zen Dots",
  "M PLUS Rounded 1c", "Kosugi Maru", "Shippori Mincho", "Yusei Magic", "Kaisei Decol"
];

function enc(name) {
  return name.replace(/ /g, "+");
}

async function downloadOne(name, lang) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${enc(name)}&display=swap`, { headers: UA })).text();
    const m = css.match(/src:\s*url\((https:\/\/[^)]+)\)/);
    if (!m) throw new Error("no src url");
    const url = m[1];
    const ext = url.includes(".ttf") ? "ttf" : "woff2";
    const dir = path.join(OUT, lang);
    mkdirSync(dir, { recursive: true });
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const file = `${name.replace(/ /g, "_")}.${ext}`;
    writeFileSync(path.join(dir, file), buf);
    return { name, lang, file, size: buf.length };
  } catch (e) {
    return { name, lang, error: e.message };
  }
}

const results = [];
for (const n of ENGLISH) results.push(await downloadOne(n, "english"));
for (const n of CHINESE) results.push(await downloadOne(n, "chinese"));

const ok = results.filter((r) => !r.error);
const fail = results.filter((r) => r.error);
console.log(`\n=== 结果：成功 ${ok.length} / ${results.length} ===`);
for (const r of fail) console.log(`[失败] ${r.name}: ${r.error}`);
console.log("\n英文成功:", ok.filter((r) => r.lang === "english").length);
console.log("中文成功:", ok.filter((r) => r.lang === "chinese").length);
console.log("输出目录:", OUT);
