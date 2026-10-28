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
await page.setViewport({ width: 1440, height: 1000 });
await page.goto("https://d.design/", { waitUntil: "domcontentloaded", timeout: 60000 });
await new Promise((r) => setTimeout(r, 6000));

const plaza = await page.evaluate(async function () {
  const res = await fetch("/api/agent/share/getPlazaList?pageSize=200&pageNum=1");
  const json = await res.json();
  return { status: res.status, total: json.data && json.data.total, len: json.data && json.data.list && json.data.list.length, first: json.data && json.data.list && json.data.list[0], msg: json.message };
});
console.log("=== getPlazaList ===");
console.log(JSON.stringify(plaza).slice(0, 1500));

const apis = [];
page.on("response", async (res) => {
  const u = res.url();
  if (!/api.*(session|share|conversation|message|history|detail)/i.test(u)) return;
  try {
    const body = await res.text();
    apis.push([u.slice(0, 140), body.slice(0, 400)]);
  } catch (e) {}
});
await page.goto("https://d.design/agent/share/session/NKSr8ByMh6", { waitUntil: "domcontentloaded", timeout: 60000 });
await new Promise((r) => setTimeout(r, 8000));

console.log("=== 会话页 API: " + apis.length + " ===");
for (let i = 0; i < Math.min(apis.length, 8); i++) {
  console.log("--- " + apis[i][0]);
  console.log(apis[i][1].replace(/\s+/g, " ").slice(0, 280));
}

await browser.close();
