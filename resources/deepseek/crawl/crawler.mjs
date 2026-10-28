import { writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileP = promisify(execFile);
const BASE = "https://motionsites.org";
const OUT_ROOT = "/Users/sunsizhe/Documents/deepseek-harness/handoff/crawl-raw";
const CASES = path.join(OUT_ROOT, "cases");
const LIMIT = 100;
const UA = {
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml"
};

// 页面 → 站点分类（MotionSites 的分类由所在页面决定）
const PAGES = [
  { url: "/", category: "Hero" },
  { url: "/prompts", category: "Hero" },
  { url: "/sections", category: "Sections" },
  { url: "/backgrounds", category: "Backgrounds" },
  { url: "/gradients", category: "Gradients" },
  { url: "/templates", category: "Templates" },
  { url: "/featured", category: "Hero" },
  { url: "/popular", category: "Hero" },
  { url: "/new", category: "Hero" },
  { url: "/free", category: "Hero" }
];

async function fetchText(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function extractItems(html, pageCategory) {
  const items = [];
  const parts = html.split("<article");
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const href = chunk.match(/href="(\/prompts\/[a-z0-9-]+)"/);
    if (!href) continue;
    const slug = href[1].replace("/prompts/", "");
    const title =
      chunk.match(/aria-label="View ([^"]+)"/)?.[1]?.trim() ||
      chunk.match(/<h3[^>]*>([^<]+)<\/h3>/)?.[1]?.trim() ||
      "";
    const asset = chunk.match(/url=%2Fassets%2F([^"&]+)/)?.[1];
    const assetPath = asset ? decodeURIComponent(`%2Fassets%2F${asset}`) : null;
    if (slug && title && assetPath) items.push({ slug, title, category: pageCategory, assetPath });
  }
  return items;
}

function dedupe(items) {
  const map = new Map();
  for (const it of items) {
    if (!map.has(it.slug)) map.set(it.slug, it);
  }
  return [...map.values()];
}

async function imageSize(file) {
  try {
    const { stdout } = await execFileP("/usr/bin/sips", ["-g", "pixelWidth", "-g", "pixelHeight", file]);
    const w = stdout.match(/pixelWidth:\s*(\d+)/)?.[1];
    const h = stdout.match(/pixelHeight:\s*(\d+)/)?.[1];
    return { width: w ? Number(w) : null, height: h ? Number(h) : null };
  } catch {
    return { width: null, height: null };
  }
}

async function download(url, dest) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  await mkdir(CASES, { recursive: true });
  const all = [];
  for (const p of PAGES) {
    try {
      const html = await fetchText(BASE + p.url);
      const items = extractItems(html, p.category);
      all.push(...items);
      console.log(`[page] ${p.url}: ${items.length} cards`);
    } catch (e) {
      console.log(`[skip] ${p.url}: ${e.message}`);
    }
  }
  const uniqueAll = dedupe(all);
  const unique = uniqueAll.slice(0, LIMIT);
  const byCat = uniqueAll.reduce((a, x) => ((a[x.category] = (a[x.category] || 0) + 1), a), {});
  console.log(`\ntotal cards ${all.length}, unique ${uniqueAll.length}, capping to ${unique.length}`);
  console.log("byCategory:", JSON.stringify(byCat));
  if (unique.length === 0) {
    console.log("nothing to download, abort.");
    return;
  }

  const records = [];
  for (let i = 0; i < unique.length; i++) {
    const it = unique[i];
    const seq = String(i + 1).padStart(4, "0");
    const dir = path.join(CASES, `motionsites_${seq}`);
    await mkdir(dir, { recursive: true });
    const ext = it.assetPath.match(/\.(\w+)$/)?.[1] || "webp";
    const imgPath = path.join(dir, `image.${ext}`);
    let width = null, height = null;
    try {
      await download(BASE + it.assetPath, imgPath);
      const sz = await imageSize(imgPath);
      width = sz.width;
      height = sz.height;
    } catch (e) {
      console.log(`[skip img] ${it.slug}: ${e.message}`);
    }
    const raw = {
      site: "motionsites",
      sourceQuery: it.category,
      category: it.category,
      topic: "网页设计",
      url: `${BASE}/prompts/${it.slug}`,
      title: it.title,
      description: "",
      author: "MotionSites",
      siteTags: [],
      isDesigned: true,
      popularity: { award: "curated", note: null },
      width,
      height,
      license: "reference-only",
      capturedAt: new Date().toISOString()
    };
    await writeFile(path.join(dir, "raw.json"), JSON.stringify(raw, null, 2) + "\n", "utf8");
    records.push(raw);
  }

  const manifest = {
    crawlerVersion: 2,
    createdAt: new Date().toISOString(),
    total: records.length,
    bySite: { motionsites: records.length },
    byTopic: { "网页设计": records.length },
    byCategory: records.reduce((a, r) => ((a[r.category] = (a[r.category] || 0) + 1), a), {}),
    notes: "motionsites.org 设计主图（Hero/Sections/Backgrounds/Gradients/Templates）"
  };
  await writeFile(path.join(OUT_ROOT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log(`\ndone. wrote ${records.length} records to ${OUT_ROOT}`);
  console.log("\nsample (first 15):");
  for (const r of records.slice(0, 15)) {
    console.log(`- [${r.category}] ${r.title}  ${r.width}x${r.height}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
