import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0 Safari/537.36";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--user-data-dir=/tmp/chrome-ms2"]
});
try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);

  page.on("request", (req) => {
    if (/get-prompt/.test(req.url())) {
      console.log("=== get-prompt REQUEST ===");
      console.log("method:", req.method());
      console.log("url:", req.url());
      console.log("postData:", req.postData()?.slice(0, 300));
      console.log("headers:", JSON.stringify(req.headers()).slice(0, 400));
    }
  });

  await page.goto("https://motionsites.ai/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 8000));

  // 卡片的数据属性（找 slug / prompt_id）
  const cardMeta = await page.evaluate(() =>
    [...document.querySelectorAll('[class*="prompt-card"]')].slice(0, 5).map((c) => {
      const attrs = {};
      for (const a of c.attributes) attrs[a.name] = a.value.slice(0, 60);
      const img = c.querySelector("img");
      return { alt: img?.alt, attrs };
    })
  );
  console.log("\n=== 卡片前5个的 data 属性 ===");
  console.log(JSON.stringify(cardMeta, null, 2));

  await page.evaluate(() => [...document.querySelectorAll('[class*="prompt-card"]')][0]?.click());
  await new Promise((r) => setTimeout(r, 5000));
} finally {
  await browser.close();
}
