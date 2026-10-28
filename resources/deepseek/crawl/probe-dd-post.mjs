import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0 Safari/537.36";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--user-data-dir=/tmp/chrome-dd"]
});
const page = await browser.newPage();
await page.setUserAgent(UA);

let reqInfo = null;
page.on("request", (req) => {
  if (req.url().includes("d.design/api/agent/share/getPlazaList")) {
    reqInfo = { url: req.url(), method: req.method(), headers: req.headers(), postData: req.postData() };
  }
});

await page.goto("https://d.design/", { waitUntil: "domcontentloaded", timeout: 60000 });
await new Promise((r) => setTimeout(r, 6000));
await page.evaluate(() => {
  const el = [...document.querySelectorAll("*")].find((e) => e.childElementCount === 0 && (e.textContent || "").trim() === "Agent玩法");
  el?.click();
});
await new Promise((r) => setTimeout(r, 6000));

console.log("=== getPlazaList 请求 ===");
console.log("method:", reqInfo?.method);
console.log("headers:", JSON.stringify(reqInfo?.headers));
console.log("postData:", reqInfo?.postData);

await browser.close();
