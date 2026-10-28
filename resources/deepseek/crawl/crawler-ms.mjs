import puppeteer from "puppeteer-core";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = "/Users/sunsizhe/Documents/deepseek-harness/handoff/crawl-raw/motionsites";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0 Safari/537.36";
const LIMIT = 100;

const CAT_KEYS = ["landing page", "creative", "travel", "technology", "tech", "3d", "3d website", "ecommerce", "e-commerce"];
function normalizeCategory(t) {
  t = (t || "").trim().toLowerCase();
  if (t === "landing page" || t === "landing") return "LandingPage";
  if (t === "creative") return "Creative";
  if (t === "travel") return "Travel";
  if (t === "technology" || t === "tech") return "Technology";
  if (t === "3d" || t === "3d website") return "3D";
  if (t === "ecommerce" || t === "e-commerce") return "Ecommerce";
  return "";
}
function sanitize(s) {
  return (s || "").replace(/[^\w\u4e00-\u9fff-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "untitled";
}
function extFromUrl(src) {
  const u = (src || "").toLowerCase();
  if (u.includes(".gif")) return "gif";
  if (u.includes("output=webp") || u.includes(".webp")) return "webp";
  if (u.includes(".png")) return "png";
  if (u.includes(".jpg") || u.includes(".jpeg")) return "jpg";
  return "img";
}
function absUrl(src) {
  return src.startsWith("http") ? src : `https://motionsites.ai${src}`;
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--user-data-dir=/tmp/chrome-ms2"]
});
try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.goto("https://motionsites.ai/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 8000));

  for (let i = 0; i < 30; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise((r) => setTimeout(r, 700));
  }

  const cards = await page.evaluate((CAT_KEYS) => {
    const out = [];
    const seen = new Set();
    for (const img of document.querySelectorAll("img")) {
      const alt = (img.getAttribute("alt") || "").trim();
      if (!alt || /logo|icon|favicon|preview-mark|arrow|check/i.test(alt)) continue;
      if (seen.has(alt)) continue;
      const container = img.closest('[class*="prompt-card"]') || img.parentElement?.parentElement;
      if (!container) continue;
      let category = "";
      for (const el of container.querySelectorAll("span,div,p")) {
        const t = (el.textContent || "").trim().toLowerCase();
        if (t && CAT_KEYS.includes(t) && t !== alt.toLowerCase()) {
          category = t;
          break;
        }
      }
      const src = img.getAttribute("src") || "";
      seen.add(alt);
      out.push({ title: alt, category, src });
    }
    return out;
  }, CAT_KEYS);

  const kept = cards.filter((c) => normalizeCategory(c.category)).slice(0, LIMIT);
  console.log("total:", cards.length, "kept:", kept.length);

  await mkdir(OUT, { recursive: true });
  const records = [];
  for (const c of kept) {
    const cat = normalizeCategory(c.category);
    const ext = extFromUrl(c.src);
    const base = `${cat}_${sanitize(c.title)}`;
    const imgName = `${base}.${ext}`;
    let ok = false;
    try {
      const res = await fetch(absUrl(c.src), { headers: { "user-agent": UA } });
      if (res.ok) {
        await writeFile(path.join(OUT, imgName), Buffer.from(await res.arrayBuffer()));
        ok = true;
      }
    } catch (e) {
      console.log(`[dl fail] ${base}: ${e.message}`);
    }
    const rec = {
      site: "motionsites",
      sourceQuery: cat,
      category: cat,
      topic: "网页设计",
      title: c.title,
      url: "https://motionsites.ai/",
      description: "",
      author: "MotionSites",
      siteTags: [],
      isDesigned: true,
      popularity: { award: "curated", note: null },
      isGif: ext === "gif",
      imageFile: ok ? imgName : null,
      src: c.src,
      license: "reference-only",
      capturedAt: new Date().toISOString()
    };
    await writeFile(path.join(OUT, `${base}.json`), JSON.stringify(rec, null, 2) + "\n", "utf8");
    records.push(rec);
  }

  const byCat = records.reduce((a, x) => ((a[x.category] = (a[x.category] || 0) + 1), a), {});
  console.log("\ndone. records:", records.length, "downloaded:", records.filter((r) => r.imageFile).length);
  console.log("byCategory:", JSON.stringify(byCat));
  console.log("gif:", records.filter((r) => r.isGif).length);
  console.log("\nfiles sample:");
  for (const r of records.slice(0, 12)) console.log(" -", r.imageFile || "(fail)");
} finally {
  await browser.close();
}
