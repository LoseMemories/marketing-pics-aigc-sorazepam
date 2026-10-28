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

  const apis = [];
  page.on("response", async (res) => {
    const url = res.url();
    const ct = res.headers()["content-type"] || "";
    if (!/json|javascript/.test(ct)) return;
    if (!/api|mtop|session|share|feed|list|recommend|play/i.test(url)) return;
    try {
      const body = await res.text();
      apis.push({ url: url.slice(0, 160), status: res.status(), body: body.slice(0, 600) });
    } catch {}
  });

  await page.goto("https://d.design/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 6000));
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find((e) => e.childElementCount === 0 && (e.textContent || "").trim() === "Agent玩法");
    el?.click();
  });
  await new Promise((r) => setTimeout(r, 6000));

  console.log(`捕获 ${apis.length} 个候选 API：\n`);
  for (const a of apis.slice(0, 25)) {
    console.log(`--- ${a.status} ${a.url}`);
    console.log(a.body.replace(/\s+/g, " ").slice(0, 350));
    console.log();
  }
} finally {
  await browser.close();
}
