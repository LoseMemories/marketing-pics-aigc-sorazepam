import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox","--disable-gpu","--user-data-dir=/tmp/chrome-dd3"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle2", timeout: 60000 });
await new Promise(r => setTimeout(r, 2500));
await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(x=>(x.textContent||"").trim()==="灵感"); b?.click(); });
await new Promise(r => setTimeout(r, 3000));
await page.evaluate(() => { const b=[...document.querySelectorAll(".cat-tabs button")].find(x=>(x.textContent||"").includes("3d")); b?.click(); });
await new Promise(r => setTimeout(r, 1200));
const card = await page.$(".grid .card");
if (card) { await card.hover(); await new Promise(r => setTimeout(r, 900)); }
const info = await page.evaluate(() => {
  const pop = document.querySelector(".vocab-pop");
  const grid = pop?.querySelector(".heat-grid");
  return {
    badge: document.querySelector(".subj-badge")?.textContent,
    cols: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0,
    cells: pop?.querySelectorAll(".heat-cell").length,
  };
});
console.log(JSON.stringify(info));
await page.screenshot({ path: "/tmp/gallery-final.png" });
await browser.close();
