import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0 Safari/537.36";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--user-data-dir=/tmp/chrome-dd"]
});
try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto("https://d.design/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 8000));

  // 找「Agent玩法」元素
  const found = await page.evaluate(() => {
    const els = [...document.querySelectorAll("*")].filter((e) => e.childElementCount === 0 && (e.textContent || "").trim() === "Agent玩法");
    const el = els[0];
    if (!el) return { found: false };
    return { found: true, tag: el.tagName, cls: (el.className || "").toString().slice(0, 80), parentCls: (el.parentElement?.className || "").toString().slice(0, 80) };
  });
  console.log("Agent玩法元素:", JSON.stringify(found));

  // 点击它
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find((e) => e.childElementCount === 0 && (e.textContent || "").trim() === "Agent玩法");
    el?.click();
  });
  await new Promise((r) => setTimeout(r, 4000));

  // 提取点击后的卡片
  const cards = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll("img")].filter((i) => {
      const s = i.src || "";
      return /static\.d\.design|alicdn/.test(s) && !/banner|logo|icon|\.svg/.test(s);
    }).map((i) => ({ alt: (i.alt || "").slice(0, 40), src: (i.src || "").slice(0, 110) }));
    return imgs.slice(0, 20);
  });
  console.log("\n点击后图片卡片:");
  console.log(JSON.stringify(cards, null, 2).slice(0, 2500));
} finally {
  await browser.close();
}
