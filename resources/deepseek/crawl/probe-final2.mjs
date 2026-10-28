import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox","--disable-gpu","--user-data-dir=/tmp/chrome-dd4"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle2", timeout: 60000 });
await new Promise(r => setTimeout(r, 2500));
await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(x=>(x.textContent||"").trim()==="灵感"); b?.click(); });
await new Promise(r => setTimeout(r, 3000));
await page.evaluate(() => { const b=[...document.querySelectorAll(".cat-tabs button")].find(x=>(x.textContent||"").includes("3d")); b?.click(); });
await new Promise(r => setTimeout(r, 1200));
// 找「主体：3」的卡片
const target = await page.evaluate(() => {
  const cards = [...document.querySelectorAll(".grid .card")];
  const idx = cards.findIndex(c => (c.querySelector(".subj-badge")?.textContent || "").includes("主体：3"));
  return idx;
});
console.log("target card index:", target);
const cards = await page.$$(".grid .card");
if (target >= 0 && cards[target]) { await cards[target].hover(); await new Promise(r => setTimeout(r, 900)); }
await page.screenshot({ path: "/tmp/gallery-final2.png" });
await browser.close();
