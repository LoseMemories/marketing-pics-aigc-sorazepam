import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox","--disable-gpu","--user-data-dir=/tmp/chrome-dd8"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle2", timeout: 60000 });
await new Promise(r => setTimeout(r, 3000));
await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(x=>(x.textContent||"").trim()==="灵感"); b?.click(); });
await new Promise(r => setTimeout(r, 4000));
await page.evaluate(() => { const b=[...document.querySelectorAll(".cat-tabs button")].find(x=>(x.textContent||"").includes("ecommerce")); b?.click(); });
await new Promise(r => setTimeout(r, 1500));
const cards = await page.$$(".grid .card");
// 找 Halo Sound
const idx = await page.evaluate(() => [...document.querySelectorAll(".grid .card")].findIndex(c => (c.textContent||"").includes("Halo Sound")));
if (idx >= 0 && cards[idx]) { await cards[idx].hover(); await new Promise(r => setTimeout(r, 1200)); }
await page.screenshot({ path: "/tmp/halo-final.png" });
await browser.close();
