import { writeFileSync, mkdirSync, readdirSync, copyFileSync, statSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const OUT = "/Users/sunsizhe/Documents/deepseek-harness/handoff/fonts";
const TMP = "/tmp/ms-fonts2";
const ALREADY = new Set(["ranade", "chillax", "clash-display", "cabinet-grotesk", "satoshi"]);
const WANT = 15; // 再下 15 个，凑 20

const list = await (await fetch("https://api.fontshare.com/v2/fonts", { headers: { "user-agent": "Mozilla/5.0" } })).json();
const fonts = list.fonts.filter((f) => f.slug && !ALREADY.has(f.slug));
console.log("Fontshare 可选字体:", fonts.length);

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

let done = 0;
for (const f of fonts) {
  if (done >= WANT) break;
  const slug = f.slug;
  const zipPath = path.join(TMP, `${slug}.zip`);
  try {
    const res = await fetch(`https://api.fontshare.com/v2/fonts/download/${slug}`, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));

    const extractDir = path.join(TMP, slug);
    mkdirSync(extractDir, { recursive: true });
    execFileSync("unzip", ["-o", "-q", zipPath, "-d", extractDir]);

    const ttf = (await findExt(extractDir, ".ttf")) || (await findExt(extractDir, ".otf"));
    if (!ttf) throw new Error("no ttf/otf");

    const destDir = path.join(OUT, slug);
    mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, path.basename(ttf));
    copyFileSync(ttf, dest);
    console.log(`✓ ${f.name}  ->  ${path.basename(ttf)}  (${(statSync(dest).size / 1024).toFixed(0)} KB)`);
    done++;
  } catch (e) {
    console.log(`[skip] ${f.name}: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 120));
}

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

const total = readdirSync(OUT).length;
console.log(`\n完成，共 ${total} 个字体目录，输出: ${OUT}`);
