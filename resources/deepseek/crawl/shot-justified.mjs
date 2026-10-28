import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox","--disable-gpu","--user-data-dir=/tmp/chrome-dd29"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle2", timeout: 60000 });
await new Promise(r => setTimeout(r, 2500));
await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(x=>(x.textContent||"").trim()==="灵感"); b?.click(); });
await new Promise(r => setTimeout(r, 3500));
await page.evaluate(() => { const b=[...document.querySelectorAll(".cat-tabs button")].find(x=>(x.textContent||"").includes("magazine")); b?.click(); });
await new Promise(r => setTimeout(r, 3000));
const info = await page.evaluate(() => {
  const cards = [...document.querySelectorAll(".grid .card")];
  const grid = document.querySelector(".grid");
  const gw = grid.getBoundingClientRect().width;
  const rows = {};
  cards.forEach(c => {
    const r = c.getBoundingClientRect();
    const key = Math.round(r.top);
    (rows[key] = rows[key] || []).push({ w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) });
  });
  const rowList = Object.values(rows).slice(0, 4).map(row => ({
    count: row.length, height: row[0]?.h, rightGap: Math.round(gw + grid.getBoundingClientRect().left - Math.max(...row.map(x => x.right)))
  }));
  return { gridWidth: Math.round(gw), rows: rowList };
});
console.log(JSON.stringify(info));
await page.screenshot({ path: "/tmp/justified.png" });
await browser.close();
