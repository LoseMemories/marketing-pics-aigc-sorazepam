import puppeteer from "puppeteer-core";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0 Safari/537.36";
const OUT = "/Users/sunsizhe/Documents/Codex/2026-10-25/ni/marketing-photo-aigc/backend/data/alibaba";
const AGENT_ID = "a5AWsyjnry";
const LIMIT = Number(process.env.LIMIT || 5);

mkdirSync(OUT, { recursive: true });

function clean(s) {
  return (s || "").replace(/<!--[\s\S]*?-->/g, "").replace(/@[\w-]+/g, "").replace(/\s+/g, " ").trim();
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--user-data-dir=/tmp/chrome-dd"]
});
const page = await browser.newPage();
await page.setUserAgent(UA);
await page.goto("https://d.design/", { waitUntil: "domcontentloaded", timeout: 60000 });
await new Promise((r) => setTimeout(r, 5000));

// 1. 拉全量列表
const plaza = await page.evaluate(async function () {
  const res = await fetch("/api/agent/share/getPlazaList", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pageNo: 1, pageSize: 300 })
  });
  return await res.json();
});
const list = (plaza.data && plaza.data.list) || [];
console.log(`列表共 ${list.length} 条，取前 ${LIMIT} 条测试`);

// 2. 逐条取对话
const results = [];
for (let i = 0; i < Math.min(list.length, LIMIT); i++) {
  const it = list[i];
  const shareId = it.shareId;
  const content = await page.evaluate(async function (id, agentId) {
    const res = await fetch(`/api/agent/v1/share/public/${id}/content?displayAgentId=${agentId}`);
    return await res.json();
  }, shareId, AGENT_ID).catch(() => null);

  const d = content && content.data;
  if (!d) { console.log(`[${i}] ${it.title} -> 无对话内容`); continue; }

  const messages = d.messages || [];
  const userMsg = messages.find((m) => m.role === "user");
  const asstMsg = messages.find((m) => m.role === "assistant");
  const artifacts = d.artifacts || [];
  const isVideo = artifacts.length > 0 && artifacts.every((a) => a.type === "VIDEO");
  const versions = artifacts.map((a, idx) => ({
    index: idx + 1,
    title: a.title,
    type: a.type,
    images: (a.metadata && a.metadata.images) || [],
    note: a.summary
  }));

  const rec = {
    source: "d.design/agent/share",
    shareId,
    sessionId: it.sessionId,
    publicId: it.publicId,
    title: d.title || it.title,
    promptSummary: it.promptSummary,
    coverUrls: it.coverUrls || [],
    referPicUrls: it.referPicUrls || [],
    prompt: clean(userMsg && userMsg.content),
    designNote: clean(asstMsg && asstMsg.content),
    isVideo,
    versions
  };
  results.push(rec);
  console.log(`[${i}] ${rec.title} | type=${isVideo ? "VIDEO" : "IMAGE"} | 版本=${versions.length} | note=${rec.designNote.length}字`);
}

writeFileSync("/tmp/dd-sample.json", JSON.stringify(results, null, 2));
console.log(`\n测试结果写入 /tmp/dd-sample.json（${results.length} 条）`);
console.log("首条 JSON:", JSON.stringify(results[0], null, 2).slice(0, 1200));
await browser.close();
