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

  await page.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find((e) => e.childElementCount === 0 && (e.textContent || "").trim() === "Agent玩法");
    el?.click();
  });
  await new Promise((r) => setTimeout(r, 4000));

  // 找案例卡片容器（含 static.d.design/2026 图片 + 标题）
  const cardInfo = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll("img")].filter((i) => /static\.d\.design\/2026/.test(i.src));
    const cards = [];
    for (const img of imgs.slice(0, 8)) {
      let node = img, container = null, href = null;
      for (let i = 0; i < 8 && node; i++) {
        node = node.parentElement;
        if (!node) break;
        const a = node.closest?.("a");
        const t = (node.textContent || "").trim();
        if (a?.href) href = a.href;
        if (t && t.length < 60) { container = node; }
        if (a) { container = node; break; }
      }
      const text = (container?.textContent || "").trim().slice(0, 60);
      cards.push({ alt: img.alt, src: img.src.slice(0, 90), href, text });
    }
    return cards;
  });
  console.log("卡片:", JSON.stringify(cardInfo, null, 2).slice(0, 3000));

  // 点第一个案例
  await page.evaluate(() => {
    const img = [...document.querySelectorAll("img")].find((i) => /static\.d\.design\/2026/.test(i.src));
    let node = img;
    for (let i = 0; i < 8 && node; i++) { node = node.parentElement; if (node?.tagName === "A") { node.click(); return; } }
    img?.parentElement?.parentElement?.click();
  });
  await new Promise((r) => setTimeout(r, 5000));
  console.log("\n=== 详情页 URL ===", page.url());
  const detail = await page.evaluate(() => ({
    title: document.title,
    text: (document.body.innerText || "").slice(0, 2000)
  }));
  console.log(detail.text.slice(0, 1800));
} finally {
  await browser.close();
}
