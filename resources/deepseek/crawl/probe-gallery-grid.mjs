import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--user-data-dir=/tmp/chrome-dd2"]
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));

// 点「灵感」
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "灵感");
  btn?.click();
});
await new Promise((r) => setTimeout(r, 3000));

// 点 landingpage
await page.evaluate(() => {
  const btn = [...document.querySelectorAll(".cat-tabs button")].find((b) => (b.textContent || "").includes("landingpage"));
  btn?.click();
});
await new Promise((r) => setTimeout(r, 1500));

// hover 第一张卡
const card = await page.$(".grid .card");
if (card) {
  await card.hover();
  await new Promise((r) => setTimeout(r, 800));
}

const info = await page.evaluate(() => {
  const pop = document.querySelector(".vocab-pop");
  if (!pop) return { pop: false };
  const grid = pop.querySelector(".heat-grid");
  const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0;
  const cells = pop.querySelectorAll(".heat-cell").length;
  return { pop: true, cols, cells, popW: pop.getBoundingClientRect().width };
});
console.log("浮层:", JSON.stringify(info));
await page.screenshot({ path: "/tmp/gallery-6x6.png" });
await browser.close();
