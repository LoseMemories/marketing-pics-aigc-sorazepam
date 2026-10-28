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

  const info = await page.evaluate(() => {
    const title = document.title;
    const bodyText = (document.body.innerText || "").slice(0, 1200);
    const links = [...document.querySelectorAll("a")].map((a) => ({ text: (a.textContent || "").trim().slice(0, 30), href: a.getAttribute("href") || "" })).filter((x) => x.text && x.text.length < 30).slice(0, 40);
    const imgs = [...document.querySelectorAll("img")].map((i) => ({ alt: (i.alt || "").slice(0, 40), src: (i.src || "").slice(0, 100) })).slice(0, 15);
    return { title, bodyText, links, imgs };
  });
  console.log(JSON.stringify(info, null, 2).slice(0, 4000));
} finally {
  await browser.close();
}
