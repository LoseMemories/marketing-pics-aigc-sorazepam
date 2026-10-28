import puppeteer from "puppeteer-core";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox","--disable-gpu","--user-data-dir=/tmp/chrome-dd25"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle2", timeout: 60000 });
await new Promise(r => setTimeout(r, 2500));
await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(x=>(x.textContent||"").trim()==="灵感"); b?.click(); });
await new Promise(r => setTimeout(r, 3500));
await page.evaluate(() => { const b=[...document.querySelectorAll(".cat-tabs button")].find(x=>(x.textContent||"").includes("landingpage")); b?.click(); });
await new Promise(r => setTimeout(r, 1500));
const idx = await page.evaluate(() => [...document.querySelectorAll(".grid .card")].findIndex(c => (c.textContent||"").includes("Gateway")));
const cards = await page.$$(".grid .card");
if (idx >= 0) { await cards[idx].hover(); await new Promise(r => setTimeout(r, 1500)); }
const info = await page.evaluate(() => {
  const pops = [...document.querySelectorAll(".vocab-pop")];
  const pop = pops.find(p => (p.querySelector(".vp-title")?.textContent||"").includes("Gateway")) || pops[0];
  const cells = pop ? [...pop.querySelectorAll(".heat-cell")] : [];
  return { title: pop?.querySelector(".vp-title")?.textContent,
           colors: cells.slice(0,12).map(c => getComputedStyle(c).backgroundColor),
           textMarks: pop?.querySelectorAll(".hc-text-mark").length };
});
console.log(JSON.stringify(info));
await page.screenshot({ path: "/tmp/textgrid.png" });
await browser.close();
