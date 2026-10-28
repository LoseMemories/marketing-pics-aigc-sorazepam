import puppeteer from "puppeteer-core";
import { writeFileSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0 Safari/537.36";
const OUT = "/Users/sunsizhe/Documents/Codex/2026-10-25/ni/marketing-photo-aigc/backend/data/alibaba";
const AGENT_ID = "a5AWsyjnry";

function clean(s) {
  return (s || "").replace(/<!--[\s\S]*?-->/g, "").replace(/@[\w-]+/g, "").replace(/\s+/g, " ").trim();
}

function categorize(title, prompt) {
  const t = (title || "") + " " + (prompt || "");
  if (/海报/.test(t)) return "海报";
  if (/详情页|详情长图/.test(t)) return "详情页";
  if (/品牌|VI|规范/.test(t)) return "品牌";
  if (/IP|角色|形象/.test(t)) return "IP设计";
  if (/文旅|文化|旅行|建筑|艺术展|展览|非遗/.test(t)) return "文旅";
  if (/美妆|护肤|精华|口红|香水|面膜/.test(t)) return "美妆";
  if (/电商|商品|带货|优惠|促销|秒杀|上新/.test(t)) return "电商";
  if (/封面|主图|视觉封面/.test(t)) return "封面";
  return "其他";
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--user-data-dir=/tmp/chrome-dd"]
});
const page = await browser.newPage();
await page.setUserAgent(UA);
await page.setViewport({ width: 1440, height: 1000 });
await page.goto("https://d.design/", { waitUntil: "domcontentloaded", timeout: 60000 });
await new Promise((r) => setTimeout(r, 5000));

// 1. 全量列表
const plaza = await page.evaluate(async function () {
  const res = await fetch("/api/agent/share/getPlazaList", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pageNo: 1, pageSize: 300 })
  });
  return await res.json();
});
const list = (plaza.data && plaza.data.list) || [];
console.log(`全量列表 ${list.length} 条`);

mkdirSync(OUT, { recursive: true });

// 2. 逐条抓取
const stats = {};
let saved = 0, skippedVideo = 0, failed = 0;

for (let i = 0; i < list.length; i++) {
  const it = list[i];
  const content = await page.evaluate(async function (id, agentId) {
    try {
      const res = await fetch(`/api/agent/v1/share/public/${id}/content?displayAgentId=${agentId}`);
      return await res.json();
    } catch (e) { return null; }
  }, it.shareId, AGENT_ID).catch(() => null);

  const d = content && content.data;
  if (!d) { failed++; continue; }

  const artifacts = d.artifacts || [];
  const isVideo = artifacts.length > 0 && artifacts.every((a) => a.type === "VIDEO");
  if (isVideo) { skippedVideo++; continue; }

  const messages = d.messages || [];
  const userMsg = messages.find((m) => m.role === "user");
  const asstMsg = messages.find((m) => m.role === "assistant");
  const title = d.title || it.title || "未命名";
  const prompt = clean(userMsg && userMsg.content);
  const designNote = clean(asstMsg && asstMsg.content);
  const category = categorize(title, prompt);

  const versions = artifacts.map((a, idx) => ({
    index: idx + 1,
    title: a.title,
    type: a.type,
    version: a.version,
    images: (a.metadata && a.metadata.images) || [],
    note: a.summary || ""
  }));

  const rec = {
    source: "d.design/agent/share/session",
    shareId: it.shareId,
    sessionId: it.sessionId,
    publicId: it.publicId,
    title,
    promptSummary: it.promptSummary || "",
    category,
    prompt,
    designNote,
    tags: it.tags || [],
    referPicUrls: it.referPicUrls || [],
    coverUrls: it.coverUrls || [],
    versions
  };

  const dir = path.join(OUT, category);
  mkdirSync(dir, { recursive: true });
  const safe = it.shareId.replace(/[^\w-]/g, "");
  const jsonPath = path.join(dir, `${safe}.json`);
  writeFileSync(jsonPath, JSON.stringify(rec, null, 2));

  // 下载封面图（第一条）
  const imgUrl = (it.coverUrls && it.coverUrls[0]) || (versions[0]?.images?.[0]);
  if (imgUrl) {
    try {
      const imgRes = await fetch(imgUrl, { headers: { "user-agent": UA, referer: "https://d.design/" } });
      if (imgRes.ok) {
        const buf = Buffer.from(await imgRes.arrayBuffer());
        const ext = (imgUrl.match(/\.(jpg|png|webp|jpeg)/i) || [".jpg"])[0];
        await writeFile(path.join(dir, `${safe}-cover${ext}`), buf);
      }
    } catch (e) {}
  }

  stats[category] = (stats[category] || 0) + 1;
  saved++;
  console.log(`[${i + 1}/${list.length}] ${category} | ${title.slice(0, 28)} | 版本${versions.length} | note${designNote.length}`);
}

writeFileSync(path.join(OUT, "_index.json"), JSON.stringify({ total: list.length, saved, skippedVideo, failed, categories: stats }, null, 2));
console.log(`\n=== 完成：保存 ${saved}，跳过视频 ${skippedVideo}，失败 ${failed} ===`);
console.log("分类分布:", JSON.stringify(stats));
await browser.close();
