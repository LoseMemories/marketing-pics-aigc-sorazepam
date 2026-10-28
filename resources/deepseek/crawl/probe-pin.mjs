import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0 Safari/537.36";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--user-data-dir=/tmp/chrome-pin"]
});
try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 900 });

  const resp = await page.goto("https://www.pinterest.com/search/pins/?q=ootd%20fashion", {
    waitUntil: "domcontentloaded", timeout: 45000
  });
  console.log("status:", resp?.status());
  await new Promise((r) => setTimeout(r, 8000));

  const info = await page.evaluate(() => {
    const title = document.title;
    const imgs = [...document.querySelectorAll("img")].map((i) => ({ alt: (i.alt || "").slice(0, 60), src: (i.src || "").slice(0, 80) })).slice(0, 10);
    const bodyText = (document.body.innerText || "").slice(0, 400);
    const hasLogin = /log in|login/i.test(bodyText);
    return { title, hasLogin, imgs, bodyText };
  });
  console.log(JSON.stringify(info, null, 2));
} catch (e) {
  console.log("ERROR:", e.message);
} finally {
  await browser.close();
}
