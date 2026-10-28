import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";

const OUT = "/Users/sunsizhe/Documents/deepseek-harness/handoff/crawl-raw/motionsites";
const API = "https://xgdzyqfalbibzelpdpvr.supabase.co/functions/v1/get-prompt";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnZHp5cWZhbGJpYnplbHBkcHZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MzUwMDYsImV4cCI6MjA4NzQxMTAwNn0.u8lH5Y14xx2WxrNEBp8ngkJlijIYHJASq_gOzTaINZY";

function slugify(title) {
  return (title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function fetchPrompt(promptId) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: ANON,
      authorization: `Bearer ${ANON}`
    },
    body: JSON.stringify({ prompt_id: promptId })
  });
  if (!res.ok) return { ok: false, status: res.status };
  const j = await res.json().catch(() => ({}));
  return { ok: true, prompt: j.prompt_text || j.prompt || null, raw: j };
}

async function collectJson(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...(await collectJson(p)));
    else if (e.name.endsWith(".json")) files.push(p);
  }
  return files;
}

const files = await collectJson(OUT);
console.log("json files:", files.length);

let gotPrompt = 0, noPrompt = 0, failed = 0;
const samples = [];
for (let i = 0; i < files.length; i++) {
  const f = files[i];
  const data = JSON.parse(await readFile(f, "utf8"));
  const slug = slugify(data.title);
  const r = await fetchPrompt(slug);
  if (r.ok && r.prompt) {
    data.prompt = r.prompt;
    data.promptLen = r.prompt.length;
    gotPrompt++;
    if (samples.length < 5) samples.push({ title: data.title, slug, len: r.prompt.length, head: r.prompt.slice(0, 90) });
  } else if (r.ok && !r.prompt) {
    data.prompt = null;
    data.paid = true;
    noPrompt++;
  } else {
    data.prompt = null;
    data.promptError = r.status || "error";
    failed++;
  }
  await writeFile(f, JSON.stringify(data, null, 2) + "\n", "utf8");
  await new Promise((r) => setTimeout(r, 150)); // 限速
}

console.log("\n=== 结果 ===");
console.log("拿到提示词(free):", gotPrompt, "| 无提示词(paid/空):", noPrompt, "| 失败:", failed);
console.log("\n样本:");
for (const s of samples) console.log(`- [${s.title}] slug=${s.slug} len=${s.len}\n    ${s.head}...`);
