import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox","--disable-gpu","--user-data-dir=/tmp/chrome-dd30"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle2", timeout: 60000 });
await new Promise(r => setTimeout(r, 2500));
await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(x=>(x.textContent||"").trim()==="灵感"); b?.click(); });
await new Promise(r => setTimeout(r, 3500));
// uploads 分类
await page.evaluate(() => { const b=[...document.querySelectorAll(".cat-tabs button")].find(x=>(x.textContent||"").includes("uploads")); b?.click(); });
await new Promise(r => setTimeout(r, 1500));
const upInfo = await page.evaluate(() => {
  const cards = [...document.querySelectorAll(".grid .card")];
  return cards.slice(0,4).map(c => { const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
});
console.log("uploads cards:", JSON.stringify(upInfo));
await page.screenshot({ path: "/tmp/fix-uploads.png" });
// magazine 看 stretch
await page.evaluate(() => { const b=[...document.querySelectorAll(".cat-tabs button")].find(x=>(x.textContent||"").includes("magazine")); b?.click(); });
await new Promise(r => setTimeout(r, 2500));
const magInfo = await page.evaluate(() => {
  const cards = [...document.querySelectorAll(".grid .card")];
  const gw = document.querySelector(".grid").getBoundingClientRect().width;
  const rows = {};
  cards.forEach(c => { const r = c.getBoundingClientRect(); const k = Math.round(r.top); (rows[k] = rows[k] || []).push({ w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) }); });
  return Object.values(rows).slice(0,3).map(row => ({ count: row.length, h: row[0]?.h, w: row[0]?.w, rightGap: Math.round(gw + document.querySelector(".grid").getBoundingClientRect().left - Math.max(...row.map(x => x.right))) }));
});
console.log("magazine rows:", JSON.stringify(magInfo));
await page.screenshot({ path: "/tmp/fix-magazine.png" });
await browser.close();
