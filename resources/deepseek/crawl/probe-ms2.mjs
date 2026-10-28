import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0 Safari/537.36";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--user-data-dir=/tmp/chrome-ms3"]
});
try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.goto("https://motionsites.ai/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 9000));

  const info = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).filter((t) => t && t.length < 20);
    // 卡片上的所有 badge 文本
    const badges = [...document.querySelectorAll('[class*="prompt-card"]')].map((c) => {
      const texts = [...c.querySelectorAll("span,div,p")].map((e) => e.textContent.trim()).filter((t) => t && t.length < 24);
      return texts;
    }).flat();
    return {
      buttons: [...new Set(buttons)],
      hasFashionButton: buttons.some((b) => /fashion/i.test(b)),
      hasSaasButton: buttons.some((b) => /saas/i.test(b)),
      hasFreeFilter: buttons.some((b) => /free/i.test(b)),
      fashionBadges: badges.filter((b) => /fashion/i.test(b)).slice(0, 20),
      freeBadges: badges.filter((b) => /free/i.test(b)).slice(0, 10)
    };
  });
  console.log(JSON.stringify(info, null, 2));
} finally {
  await browser.close();
}
