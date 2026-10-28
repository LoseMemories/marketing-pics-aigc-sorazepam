import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox","--disable-gpu","--user-data-dir=/tmp/chrome-dd26"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle2", timeout: 60000 });
await new Promise(r => setTimeout(r, 2500));
await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(x=>(x.textContent||"").trim()==="灵感"); b?.click(); });
await new Promise(r => setTimeout(r, 3500));
await page.evaluate(() => { const b=[...document.querySelectorAll(".cat-tabs button")].find(x=>(x.textContent||"").includes("creative")); b?.click(); });
await new Promise(r => setTimeout(r, 1500));
// Hover Ink (有主体)
let idx = await page.evaluate(() => [...document.querySelectorAll(".grid .card")].findIndex(c => (c.textContent||"").includes("Hover Ink")));
let cards = await page.$$(".grid .card");
if (idx >= 0) { await cards[idx].hover(); await new Promise(r => setTimeout(r, 1200)); await page.screenshot({ path: "/tmp/text-hoverink.png" }); }
// Petalyx (主体0)
idx = await page.evaluate(() => [...document.querySelectorAll(".grid .card")].findIndex(c => (c.textContent||"").includes("Petalyx")));
cards = await page.$$(".grid .card");
if (idx >= 0) { await cards[idx].hover(); await new Promise(r => setTimeout(r, 1200)); await page.screenshot({ path: "/tmp/text-nosubject.png" }); }
console.log("done");
await browser.close();
