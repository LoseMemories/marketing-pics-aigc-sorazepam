import { writeFileSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const OUT = "/Users/sunsizhe/Documents/deepseek-harness/handoff/fonts-gf/chinese";
const TMP = "/tmp/zh-fonts";
const UA = { "user-agent": "Mozilla/5.0" };
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

// ① Google Fonts 补下：涂鸦/点阵/手写 CJK
const GF = [
  "Reggae One", "DotGothic16", "RocknRoll One", "Klee One", "Hachi Maru Pop",
  "Yuji Syuku", "Yuji Mai", "New Tegomin", "Zen Tokyo Zoo", "Stick",
  "Kosugi", "M PLUS 1p", "M PLUS Code Latin", "Zen Kurenaido", "Kaisei HarunoUmi",
  "Yomogi", "Shippori Antique", "Zen Loop", "Kiwi Maru", "Shippori Mincho B1"
];

async function dlGoogle(name) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${name.replace(/ /g, "+")}&display=swap`, { headers: UA })).text();
    const m = css.match(/src:\s*url\((https:\/\/[^)]+)\)/);
    if (!m) throw new Error("no url");
    const res = await fetch(m[1], { headers: UA });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ext = m[1].includes(".ttf") ? "ttf" : "woff2";
    writeFileSync(path.join(OUT, `${name.replace(/ /g, "_")}.${ext}`), Buffer.from(await res.arrayBuffer()));
    return { name, ok: true };
  } catch (e) { return { name, ok: false, err: e.message }; }
}

async function dlGithub(name, url, ext) {
  try {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(path.join(OUT, `${name.replace(/ /g, "_")}.${ext}`), Buffer.from(await res.arrayBuffer()));
    return { name, ok: true };
  } catch (e) { return { name, ok: false, err: e.message }; }
}

function findTtf(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const r = findTtf(p); if (r) return r; }
    else if (e.name.toLowerCase().endsWith(".ttf") || e.name.toLowerCase().endsWith(".otf")) return p;
  }
  return null;
}

const results = [];
for (const n of GF) results.push(await dlGoogle(n));

results.push(await dlGithub("LXGW WenKai", "https://github.com/lxgw/LxgwWenKai/releases/download/v1.530/LXGWWenKai-Regular.ttf", "ttf"));
results.push(await dlGithub("Yozai", "https://github.com/lxgw/yozai-font/releases/download/v0.868/Yozai-Regular.ttf", "ttf"));

try {
  const res = await fetch("https://github.com/atelier-anchor/smiley-sans/releases/download/v2.0.1/smiley-sans-v2.0.1.zip", { headers: UA });
  const zip = path.join(TMP, "smiley.zip");
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  execFileSync("unzip", ["-o", "-q", zip, "-d", path.join(TMP, "smiley")]);
  const ttf = findTtf(path.join(TMP, "smiley"));
  if (ttf) { copyFileSync(ttf, path.join(OUT, "Smiley_Sans.ttf")); results.push({ name: "Smiley Sans", ok: true }); }
  else results.push({ name: "Smiley Sans", ok: false, err: "no ttf" });
} catch (e) { results.push({ name: "Smiley Sans", ok: false, err: e.message }); }

const ok = results.filter((r) => r.ok);
console.log(`\n=== 补充下载：成功 ${ok.length} / ${results.length} ===`);
for (const r of results.filter((r) => !r.ok)) console.log(`[失败] ${r.name}: ${r.err}`);
console.log("输出:", OUT);
