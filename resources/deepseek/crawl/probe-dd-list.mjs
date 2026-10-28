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

const captured = {};
page.on("response", async (res) => {
  const u = res.url();
  if (!u.includes("d.design/api")) return;
  if (u.includes("getPlazaList")) {
    try { captured.plaza = await res.text(); } catch (e) {}
  }
  if (u.includes("getDetailByShareId")) {
    try { captured.detail = await res.text(); } catch (e) {}
  }
});

await page.goto("https://d.design/", { waitUntil: "domcontentloaded", timeout: 60000 });
await new Promise((r) => setTimeout(r, 6000));
await page.evaluate(() => {
  const el = [...document.querySelectorAll("*")].find((e) => e.childElementCount === 0 && (e.textContent || "").trim() === "Agent玩法");
  el?.click();
});
await new Promise((r) => setTimeout(r, 6000));

if (captured.plaza) {
  writeFileSync("/tmp/dd-plaza.json", captured.plaza);
  const j = JSON.parse(captured.plaza);
  const d = j.data || {};
  console.log("成功！total:", d.total, "list:", d.list && d.list.length, "hasMore:", d.hasMore);
  console.log("首条字段:", Object.keys(d.list?.[0] || {}).join(", "));
  console.log("首条:", JSON.stringify(d.list?.[0]).slice(0, 900));
} else {
  console.log("未捕获到 getPlazaList");
}
await browser.close();
