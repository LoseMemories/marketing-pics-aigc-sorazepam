import { readFileSync } from "node:fs";
import path from "node:path";

// 读取后端 .env.local 的 DeepSeek 配置
const env = readFileSync("/Users/sunsizhe/Documents/Codex/2026-10-25/ni/marketing-photo-aigc/backend/.env.local", "utf8");
const get = (k) => env.split("\n").find((l) => l.startsWith(k + "="))?.split("=").slice(1).join("=").trim();
const KEY = get("DEEPSEEK_API_KEY");
const BASE = get("DEEPSEEK_BASE_URL") || "https://api.deepseek.com";
const MODEL = get("DEEPSEEK_MODEL") || "deepseek-flash";

// 用一张已有封面图
const img = "/Users/sunsizhe/Documents/deepseek-harness/handoff/crawl-raw/motionsites/3d/3D_Facet_Glass_Hero.webp";
const b64 = readFileSync(img).toString("base64");

const prompt = `你是视觉设计语言提取器。只看这张封面图的「设计层」，不要描述图片内容（不要写"一个女人""一只猫"这类）。
请提取以下设计语汇，返回 JSON：
- layout.subjectPosition: 主体在画面的位置（九宫格：左上/中上/右上/左中/中心/右中/左下/中下/右下/无主体）
- layout.subjectAreaRatio: 主体面积占画面的百分比（0-100）
- layout.textPosition: 文字所在位置（顶部/底部/居中/左侧/右侧/覆盖主体/无文字）
- typography.fontFamily: 字体族（衬线/无衬线/手写/装饰/等宽，可多个）
- typography.weights: 字重（300-900）
- typography.style: 文字风格（一句话）
- palette.background / palette.text / palette.accent: 十六进制色
- effects: 视觉元素（描边/光效/渐变/贴纸/边框/3D，可空数组）
- mood: 调性标签（1-3 个中文词）
- designStyle: 一句话设计风格描述（只说版式/字体/配色/效果，不描述内容）

严格要求：不要输出任何对图片内容的描述，只输出设计语汇。`;

const res = await fetch(`${BASE}/chat/completions`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
  body: JSON.stringify({
    model: MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "你是视觉设计语言提取器。只返回 JSON。" },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:image/webp;base64,${b64}` } }
        ]
      }
    ]
  })
});

console.log("HTTP:", res.status);
const text = await res.text();
console.log(text.slice(0, 1500));
