import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox","--disable-gpu","--user-data-dir=/tmp/chrome-dd7"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle2", timeout: 60000 });
await new Promise(r => setTimeout(r, 3000));
await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(x=>(x.textContent||"").trim()==="灵感"); b?.click(); });
await new Promise(r => setTimeout(r, 4000));
await page.evaluate(() => { const b=[...document.querySelectorAll(".cat-tabs button")].find(x=>(x.textContent||"").includes("3d")); b?.click(); });
await new Promise(r => setTimeout(r, 2000));
const idx = await page.evaluate(() => [...document.querySelectorAll(".grid .card")].findIndex(c => (c.querySelector(".subj-badge")?.textContent||"").includes("主体：3")));
const cards = await page.$$(".grid .card");
if (idx >= 0) { await cards[idx].hover(); await new Promise(r => setTimeout(r, 1200)); }
const data = await page.evaluate(() => {
  const pop = document.querySelector(".vocab-pop");
  const cs = [...(pop?.querySelectorAll(".heat-cell") || [])];
  return { title: pop?.querySelector(".vp-title")?.textContent, n: cs.length, first: cs.slice(0,6).map(c => c.textContent.trim()), last: cs.slice(-6).map(c => c.textContent.trim()) };
});
console.log(JSON.stringify(data));
await page.screenshot({ path: "/tmp/shot-both.png" });
await browser.close();
