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
  await page.goto("https://d.design/agent/share/session/NKSr8ByMh6", { waitUntil: "domcontentloaded", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 8000));

  const data = await page.evaluate(() => {
    const text = document.body.innerText || "";
    const imgs = [...document.querySelectorAll("img")].filter((i) => /static\.d\.design|alicdn/.test(i.src)).map((i) => ({ alt: (i.alt || "").slice(0, 60), src: (i.src || "").slice(0, 110) }));
    return { title: document.title, text: text.slice(0, 3500), imgs: imgs.slice(0, 20) };
  });
  console.log("=== 标题 ===", data.title);
  console.log("=== 正文（前 3000 字）===");
  console.log(data.text);
  console.log("\n=== 图片 ===");
  console.log(JSON.stringify(data.imgs, null, 2).slice(0, 1500));
} finally {
  await browser.close();
}
