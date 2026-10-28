import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const FONTSHARE = "/Users/sunsizhe/Documents/deepseek-harness/handoff/fonts";
const GF = "/Users/sunsizhe/Documents/deepseek-harness/handoff/fonts-gf";
const PROJ = "/Users/sunsizhe/Documents/Codex/2026-10-25/ni/marketing-photo-aigc";
const FRONT_FONTS = path.join(PROJ, "frontend/public/fonts");
const BACK_FONTS = path.join(PROJ, "backend/assets/fonts");
const CATALOG = path.join(PROJ, "frontend/src/shared/fonts/font-catalog.ts");
const FONTS_CSS = path.join(PROJ, "frontend/public/fonts.css");

mkdirSync(FRONT_FONTS, { recursive: true });
mkdirSync(BACK_FONTS, { recursive: true });

// 英文分类（粗略）
const EN_CAT = {
  "Bebas Neue": "Display", "Abril Fatface": "Serif Display", "Playfair Display": "Serif", "Lobster": "Script", "Pacifico": "Script",
  "Caveat": "Handwriting", "Dancing Script": "Script", "Permanent Marker": "Handwriting", "Anton": "Display", "Oswald": "Sans",
  "Montserrat": "Sans", "Poppins": "Sans", "Lora": "Serif", "Merriweather": "Serif", "Raleway": "Sans",
  "Josefin Sans": "Sans", "Comfortaa": "Display", "Quicksand": "Sans", "Shadows Into Light": "Handwriting", "Satisfy": "Script",
  "Great Vibes": "Script", "Righteous": "Display", "Bungee": "Display", "Fredoka": "Display", "Lilita One": "Display",
  "Passion One": "Display", "Archivo Black": "Display", "Space Grotesk": "Sans", "DM Serif Display": "Serif", "Special Elite": "Typewriter",
  "Inter": "Sans", "Inter Tight": "Sans", "Geist": "Sans", "Figtree": "Sans", "Instrument Serif": "Serif",
  "Barlow": "Sans", "Sora": "Sans", "JetBrains Mono": "Mono", "Questrial": "Sans", "Urbanist": "Sans",
  "Newsreader": "Serif", "Nunito": "Sans", "Prata": "Serif", "Hanken Grotesk": "Sans", "Manrope": "Sans",
  "Orbitron": "Display", "Open Sans": "Sans"
};
const ZH_CAT = {
  "Noto Sans SC": "黑体", "Noto Serif SC": "宋体", "Ma Shan Zheng": "楷书", "Zhi Mang Xing": "草书", "Long Cang": "手写",
  "Liu Jian Mao Cao": "草书", "ZCOOL KuaiLe": "手写", "ZCOOL XiaoWei": "手写", "ZCOOL QingKe HuangYou": "圆体", "LXGW WenKai TC": "楷书",
  "Zen Kaku Gothic New": "黑体", "Zen Maru Gothic": "圆体", "Zen Old Mincho": "宋体", "Zen Antique": "宋体", "Zen Dots": "展示",
  "M PLUS Rounded 1c": "圆体", "Kosugi Maru": "圆体", "Shippori Mincho": "宋体", "Yusei Magic": "手写", "Kaisei Decol": "展示",
  "Reggae One": "涂鸦", "DotGothic16": "点阵", "RocknRoll One": "涂鸦", "Klee One": "楷书", "Hachi Maru Pop": "涂鸦圆体",
  "Yuji Syuku": "手写", "Yuji Mai": "手写", "New Tegomin": "手写", "Zen Tokyo Zoo": "涂鸦", "Stick": "手写",
  "Kosugi": "黑体", "M PLUS 1p": "黑体", "M PLUS Code Latin": "等宽", "Zen Kurenaido": "圆体", "Kaisei HarunoUmi": "手写",
  "Yomogi": "手写", "Shippori Antique": "宋体", "Zen Loop": "圆体", "Kiwi Maru": "圆体", "Shippori Mincho B1": "宋体",
  "LXGW WenKai": "楷书", "Yozai": "毛笔", "Smiley Sans": "歪扭", "NaikaiFont": "涂鸦手写",
  "HarmonyOS Sans SC": "科技黑体", "MiSans": "科技黑体",
  "DingTalk JinBuTi": "黑体", "Alibaba PuHuiTi TC": "黑体(繁)", "Alimama DaoLiTi": "隶书",
  "Alibaba PuHuiTi HK": "黑体(繁)", "TaoBao MaiCaiTi": "手写", "Alimama ShuHeiTi": "科技黑体",
  "Alimama DongFangDaKai": "毛笔", "Alimama FangYuanTi": "圆体"
};
const FONTSHARE_CAT = {
  "Satoshi": "Sans", "General Sans": "Sans", "Cabinet Grotesk": "Sans", "Clash Display": "Display", "Chillax": "Sans",
  "Switzer": "Sans", "Expose": "Sans", "Ranade": "Sans", "Synonym": "Sans", "Tabular": "Mono",
  "Tanker": "Sans", "Technor": "Sans", "Gambetta": "Serif", "Rowan": "Serif", "Sentient": "Serif",
  "Gambarino": "Serif", "Boska": "Serif", "Kihim": "Display", "Striper": "Display", "Comico": "Handwritten"
};

const catalog = [];
const faceLines = ["/* 自动生成字体声明 */"];

function addFont(name, family, lang, category, srcFront, srcBack) {
  const safe = name.replace(/ /g, "_");
  const ext = path.extname(srcFront);
  const fFront = `${safe}${ext}`;
  const bBack = `${safe}${ext}`;
  if (existsSync(srcFront)) copyFileSync(srcFront, path.join(FRONT_FONTS, fFront));
  if (existsSync(srcBack)) copyFileSync(srcBack, path.join(BACK_FONTS, bBack));
  faceLines.push(`@font-face {\n  font-family: "${family}";\n  src: url("/fonts/${fFront}") format("${ext === ".woff2" ? "woff2" : "truetype"}");\n  font-display: swap;\n}`);
  catalog.push({ name, family, lang, category });
}

// Fontshare 20（英文）
for (const slug of readdirSync(FONTSHARE)) {
  const p = path.join(FONTSHARE, slug);
  if (!existsSync(path.join(p, `${slug}.woff2`))) continue;
  const name = familyName(slug);
  addFont(name, name, "en", FONTSHARE_CAT[name] || "Sans", path.join(p, `${slug}.woff2`), path.join(p, `${slug}.ttf`));
}
// Google 英文 30
for (const f of readdirSync(path.join(GF, "english"))) {
  const name = f.replace(/\.(woff2|ttf)$/, "").replace(/_/g, " ");
  addFont(name, name, "en", EN_CAT[name] || "Sans", path.join(GF, "english", f), path.join(GF, "english", f));
}
// Google 中文（部分标为英文：无中文字形，但支持英文）
const MOVE_TO_EN = new Set(["M PLUS Code Latin", "Zen Dots", "Zen Loop", "Zen Tokyo Zoo"]);
for (const f of readdirSync(path.join(GF, "chinese"))) {
  const name = f.replace(/\.(woff2|ttf)$/, "").replace(/_/g, " ");
  const lang = MOVE_TO_EN.has(name) ? "en" : "zh";
  addFont(name, name, lang, ZH_CAT[name] || "中文", path.join(GF, "chinese", f), path.join(GF, "chinese", f));
}

function familyName(slug) {
  return slug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

writeFileSync(FONTS_CSS, faceLines.join("\n") + "\n", "utf8");

const ts = `export interface FontInfo {\n  name: string;\n  family: string;\n  lang: "en" | "zh";\n  category: string;\n}\n\nexport const FONT_CATALOG: FontInfo[] = ${JSON.stringify(catalog, null, 2)};\n`;
writeFileSync(CATALOG, ts, "utf8");

const en = catalog.filter((c) => c.lang === "en").length;
const zh = catalog.filter((c) => c.lang === "zh").length;
console.log(`✅ 字体库整合完成：共 ${catalog.length} 款（英文 ${en} / 中文 ${zh}）`);
console.log("  @font-face →", FONTS_CSS);
console.log("  catalog    →", CATALOG);
