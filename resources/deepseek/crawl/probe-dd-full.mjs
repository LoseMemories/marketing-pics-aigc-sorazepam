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
await page.goto("https://d.design/", { waitUntil: "domcontentloaded", timeout: 60000 });
await new Promise((r) => setTimeout(r, 6000));

const result = await page.evaluate(async function () {
  const res = await fetch("/api/agent/share/getPlazaList", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pageNo: 1, pageSize: 200 })
  });
  const j = await res.json();
  return { status: res.status, total: j.data && j.data.total, len: j.data && j.data.list && j.data.list.length, list: j.data && j.data.list };
});

console.log("status:", result.status, "total:", result.total, "len:", result.len);
if (result.list) {
  // tags 分布
  const tagCount = {};
  for (const it of result.list) {
    const tags = it.tags || [];
    for (const t of tags) tagCount[t] = (tagCount[t] || 0) + 1;
  }
  console.log("tags 分布:", JSON.stringify(tagCount).slice(0, 800));
  console.log("首条 tags:", JSON.stringify(result.list[0].tags));
  console.log("标题列表(前20):", result.list.slice(0, 20).map((x) => x.title).join(" | "));
}
await browser.close();
