import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox","--disable-gpu","--user-data-dir=/tmp/chrome-dd18"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle2", timeout: 60000 });
await new Promise(r => setTimeout(r, 2500));
await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(x=>(x.textContent||"").trim()==="灵感"); b?.click(); });
await new Promise(r => setTimeout(r, 2500));
await page.evaluate(() => document.querySelector(".wf-entry")?.click());
await new Promise(r => setTimeout(r, 1500));
const input = await page.$('input[type="file"]');
await input.uploadFile("/Users/sunsizhe/Documents/deepseek-harness/handoff/crawl-raw/inspiration/creative/Creative_Orange_Horse.webp");
await new Promise(r => setTimeout(r, 800));
await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(x=>(x.textContent||"").includes("开始分析")); b?.click(); });
// 等待结果
for (let i = 0; i < 40; i++) {
  await new Promise(r => setTimeout(r, 3000));
  const done = await page.evaluate(() => !!document.querySelector(".result-head") || !!document.querySelector(".err"));
  if (done) break;
}
await page.screenshot({ path: "/tmp/wf-result.png" });
const info = await page.evaluate(() => ({
  head: document.querySelector(".result-head")?.textContent?.trim(),
  subjects: document.querySelectorAll(".subject-row").length,
  heatCells: document.querySelectorAll(".block .cell").length,
  err: document.querySelector(".err")?.textContent
}));
console.log(JSON.stringify(info));
await browser.close();
