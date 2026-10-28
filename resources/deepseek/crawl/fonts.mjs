import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const HTML = "/tmp/aww_fonts.html";
const OUT = "/Users/sunsizhe/Documents/deepseek-harness/handoff/fonts";
const TMP = "/tmp/ms-fonts";
const LIMIT = 20;

const html = readFileSync(HTML, "utf8");
const slugs = [...new Set([...html.matchAll(/fontshare\.com\/fonts\/([a-z0-9-]+)/g)].map((m) => m[1]))];
console.log("Awwwards 页里的 Fontshare 字体数:", slugs.length);

const target = slugs.slice(0, LIMIT);
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const downloaded = [];
for (const slug of target) {
  const zipPath = path.join(TMP, `${slug}.zip`);
  try {
    const res = await fetch(`https://api.fontshare.com/v2/fonts/download/${slug}`, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(zipPath, buf);

    const extractDir = path.join(TMP, slug);
    mkdirSync(extractDir, { recursive: true });
    execFileSync("unzip", ["-o", "-q", zipPath, "-d", extractDir]);

    // 找 .ttf（优先）或 .otf
    const ttf = (await findExt(extractDir, ".ttf")) || (await findExt(extractDir, ".otf"));
    if (!ttf) throw new Error("no ttf/otf");

    const destDir = path.join(OUT, slug);
    mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, path.basename(ttf));
    copyFileSync(ttf, dest);
    downloaded.push({ slug, file: path.basename(ttf), size: statSync(dest).size });
  } catch (e) {
    console.log(`[skip] ${slug}: ${e.message}`);
  }
}

async function findExt(dir, ext) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const r = await findExt(p, ext);
      if (r) return r;
    } else if (e.name.toLowerCase().endsWith(ext)) {
      return p;
    }
  }
  return null;
}

console.log("\n=== 下载完成 ===");
console.log("成功:", downloaded.length, "/", target.length);
for (const d of downloaded) console.log(`- ${d.slug}  ->  ${d.file}  (${(d.size / 1024).toFixed(0)} KB)`);
console.log("\n输出目录:", OUT);
