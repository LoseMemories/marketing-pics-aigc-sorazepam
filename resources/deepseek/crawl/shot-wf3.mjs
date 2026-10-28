import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox","--disable-gpu","--user-data-dir=/tmp/chrome-dd19"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle2", timeout: 60000 });
await new Promise(r => setTimeout(r, 2500));
await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(x=>(x.textContent||"").trim()==="灵感"); b?.click(); });
await new Promise(r => setTimeout(r, 2500));
await page.evaluate(() => document.querySelector(".wf-entry")?.click());
await new Promise(r => setTimeout(r, 1200));
const input = await page.$('input[type="file"]');
await input.uploadFile("/Users/sunsizhe/Documents/deepseek-harness/handoff/crawl-raw/inspiration/creative/Creative_Honey_Bee.webp");
await new Promise(r => setTimeout(r, 600));
await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(x=>(x.textContent||"").includes("开始分析")); b?.click(); });
// 中途截图（进度）
await new Promise(r => setTimeout(r, 12000));
await page.screenshot({ path: "/tmp/wf-progress.png" });
// 等完成
for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 3000));
  const done = await page.evaluate(() => !!document.querySelector(".saved"));
  if (done) break;
}
await page.screenshot({ path: "/tmp/wf-done.png" });
console.log(JSON.stringify(await page.evaluate(() => ({
  saved: document.querySelector(".saved")?.textContent,
  steps: [...document.querySelectorAll(".wf-step .dot-state")].map(x => x.textContent.trim())
}))));
await browser.close();
