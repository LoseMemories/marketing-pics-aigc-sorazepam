import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox","--disable-gpu","--user-data-dir=/tmp/chrome-dd31"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle2", timeout: 60000 });
await new Promise(r => setTimeout(r, 2500));
await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(x=>(x.textContent||"").trim()==="灵感"); b?.click(); });
await new Promise(r => setTimeout(r, 3500));
async function stats(cat) {
  await page.evaluate((c) => { const b=[...document.querySelectorAll(".cat-tabs button")].find(x=>(x.textContent||"").includes(c)); b?.click(); }, cat);
  await new Promise(r => setTimeout(r, 2000));
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll(".grid .card")];
    const grid = document.querySelector(".grid").getBoundingClientRect();
    const rows = {};
    cards.forEach(c => { const r = c.getBoundingClientRect(); const k = Math.round(r.top); (rows[k] = rows[k] || []).push({ h: Math.round(r.height), right: Math.round(r.right) }); });
    return Object.values(rows).slice(0, 3).map(row => ({ n: row.length, h: row[0].h, gap: Math.round(grid.right - Math.max(...row.map(x => x.right))) }));
  });
}
console.log("magazine:", JSON.stringify(await stats("magazine")));
await page.screenshot({ path: "/tmp/layout-magazine.png" });
console.log("uploads:", JSON.stringify(await stats("uploads")));
await page.screenshot({ path: "/tmp/layout-uploads.png" });
await browser.close();
