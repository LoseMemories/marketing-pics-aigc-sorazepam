import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0 Safari/537.36";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--user-data-dir=/tmp/chrome-dd"]
});
const page = await browser.newPage();
await page.setUserAgent(UA);
await page.goto("https://d.design/", { waitUntil: "domcontentloaded", timeout: 60000 });
await new Promise((r) => setTimeout(r, 5000));

const out = await page.evaluate(async function () {
  const res = await fetch("/api/agent/v1/share/public/NKSr8ByMh6/content?displayAgentId=a5AWsyjnry");
  const j = await res.json();
  return j;
});
writeFileSync("/tmp/dd-content.json", JSON.stringify(out, null, 2));
const d = out.data || {};
console.log("data keys:", Object.keys(d).join(", "));
console.log("session.title:", d.session && d.session.title);
const msgs = d.messages || d.messageList || d.conversation || [];
console.log("messages 字段:", Object.keys(d).filter((k) => Array.isArray(d[k])).join(", "));
console.log("JSON 大小:", JSON.stringify(out).length);
