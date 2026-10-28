/**
 * 字体知识库元数据（v2）
 * 结构：字体名（用 name/family 识别）+ 四类标签 + 中英文 + 字体描述
 *
 * 修正点：
 * - 中国风 / 国际风 互斥：只有书法（毛笔）字体算中国风，其他一律国际风。
 * - 用户向不按性别，按年龄/人群/气质：年轻人 / 中年人以上 / 商务 / 文艺 / 潮流 / 亲子 / 通用。
 */
export interface FontTags {
  scenes: string[];
  audience: string[];
  complexity: "简洁" | "复杂";
  styles: string[];
}

export interface FontKBEntry {
  name: string;
  family: string;
  lang: "en" | "zh";
  tags: FontTags;
  description: string;
}

export const FONT_KB: Record<string, FontKBEntry> = {
  // ── 英文 · Google Fonts ──
  "Bebas Neue": {
    family: "Bebas Neue", lang: "en",
    tags: { scenes: ["海报", "商品广告", "品牌"], audience: ["年轻人", "潮流"], complexity: "简洁", styles: ["国际风", "时尚风", "先锋性"] },
    description: "英文无衬线展示字体，笔画粗壮、字形紧凑，适合海报、商品广告与品牌标题，年轻潮流用户更适配。"
  },
  "Abril Fatface": {
    family: "Abril Fatface", lang: "en",
    tags: { scenes: ["杂志", "海报", "活动促销"], audience: ["文艺", "通用"], complexity: "复杂", styles: ["国际风", "复古", "奢华"] },
    description: "英文粗衬线展示字体，笔画厚重、装饰感强，适合杂志封面、海报与促销视觉，文艺用户更适配。"
  },
  "Playfair Display": {
    family: "Playfair Display", lang: "en",
    tags: { scenes: ["杂志", "文化宣传", "品牌"], audience: ["文艺", "商务"], complexity: "复杂", styles: ["国际风", "时尚风", "奢华"] },
    description: "英文高对比度衬线字体，优雅精致，适合杂志、文化宣传与高端品牌，商务与文艺用户更适配。"
  },
  "Lobster": {
    family: "Lobster", lang: "en",
    tags: { scenes: ["海报", "个人Vlog", "活动促销"], audience: ["年轻人", "文艺"], complexity: "复杂", styles: ["国际风", "复古"] },
    description: "英文手写连笔字体，圆润复古，适合海报、个人Vlog与促销场景，年轻文艺用户更适配。"
  },
  "Pacifico": {
    family: "Pacifico", lang: "en",
    tags: { scenes: ["个人Vlog", "生活方式", "旅行"], audience: ["年轻人", "文艺"], complexity: "复杂", styles: ["国际风", "手写", "温柔"] },
    description: "英文手写马克笔字体，轻松随性，适合生活方式、旅行与个人Vlog，年轻文艺用户更适配。"
  },
  "Caveat": {
    family: "Caveat", lang: "en",
    tags: { scenes: ["个人Vlog", "生活方式", "旅行"], audience: ["年轻人", "文艺"], complexity: "简洁", styles: ["国际风", "手写"] },
    description: "英文手写笔记字体，笔画自然、易读性高，适合个人Vlog、生活方式与旅行记录，年轻用户更适配。"
  },
  "Dancing Script": {
    family: "Dancing Script", lang: "en",
    tags: { scenes: ["个人Vlog", "活动促销", "生活方式"], audience: ["文艺", "年轻人"], complexity: "复杂", styles: ["国际风", "手写", "文艺"] },
    description: "英文手写连笔字体，曲线流畅、浪漫感强，适合活动促销与生活记录，文艺用户更适配。"
  },
  "Permanent Marker": {
    family: "Permanent Marker", lang: "en",
    tags: { scenes: ["海报", "个人Vlog", "活动促销"], audience: ["年轻人", "潮流"], complexity: "简洁", styles: ["国际风", "手写", "先锋性"] },
    description: "英文马克笔涂鸦体，粗黑随意，适合海报、街头活动与个人Vlog，年轻潮流用户更适配。"
  },
  "Anton": {
    family: "Anton", lang: "en",
    tags: { scenes: ["海报", "商品广告", "品牌"], audience: ["年轻人", "潮流"], complexity: "简洁", styles: ["国际风", "时尚风", "先锋性"] },
    description: "英文窄体粗黑展示字体，视觉冲击强，适合海报、促销与品牌标题，年轻潮流用户更适配。"
  },
  "Oswald": {
    family: "Oswald", lang: "en",
    tags: { scenes: ["海报", "商品广告", "科技数码"], audience: ["年轻人", "商务"], complexity: "简洁", styles: ["国际风", "现代"] },
    description: "英文窄体无衬线字体，端正现代，适合海报、商品信息与科技内容，商务用户更适配。"
  },
  "Montserrat": {
    family: "Montserrat", lang: "en",
    tags: { scenes: ["商品广告", "品牌", "科技数码"], audience: ["商务", "通用"], complexity: "简洁", styles: ["国际风", "现代", "极简"] },
    description: "英文几何无衬线字体，中性干净，适合品牌、商品广告与科技页面，商务用户更适配。"
  },
  "Poppins": {
    family: "Poppins", lang: "en",
    tags: { scenes: ["商品广告", "品牌", "个人Vlog"], audience: ["年轻人", "通用"], complexity: "简洁", styles: ["国际风", "现代"] },
    description: "英文几何无衬线字体，圆润友好，适合商品广告、品牌与个人Vlog，年轻通用用户更适配。"
  },
  "Lora": {
    family: "Lora", lang: "en",
    tags: { scenes: ["杂志", "文化宣传", "生活方式"], audience: ["文艺", "通用"], complexity: "简洁", styles: ["国际风", "文艺"] },
    description: "英文现代衬线字体，可读性好，适合杂志正文、文化内容与生活方式，文艺用户更适配。"
  },
  "Merriweather": {
    family: "Merriweather", lang: "en",
    tags: { scenes: ["杂志", "文化宣传", "品牌"], audience: ["商务", "通用"], complexity: "简洁", styles: ["国际风", "现代"] },
    description: "英文高可读衬线字体，稳重端庄，适合杂志、文化宣传与品牌，商务用户更适配。"
  },
  "Raleway": {
    family: "Raleway", lang: "en",
    tags: { scenes: ["品牌", "文化宣传", "科技数码"], audience: ["商务", "通用"], complexity: "简洁", styles: ["国际风", "极简"] },
    description: "英文优雅无衬线字体，笔画纤细，适合品牌、文化宣传与科技页面，商务用户更适配。"
  },
  "Josefin Sans": {
    family: "Josefin Sans", lang: "en",
    tags: { scenes: ["穿搭时尚", "品牌"], audience: ["年轻人", "文艺"], complexity: "简洁", styles: ["国际风", "时尚风", "复古"] },
    description: "英文装饰无衬线字体，几何复古，适合穿搭时尚与品牌，年轻文艺用户更适配。"
  },
  "Comfortaa": {
    family: "Comfortaa", lang: "en",
    tags: { scenes: ["个人Vlog", "生活方式", "旅行"], audience: ["年轻人", "亲子"], complexity: "简洁", styles: ["国际风", "温柔"] },
    description: "英文圆体字体，柔软可爱，适合生活方式、旅行与个人Vlog，年轻亲子用户更适配。"
  },
  "Quicksand": {
    family: "Quicksand", lang: "en",
    tags: { scenes: ["个人Vlog", "生活方式", "商品广告"], audience: ["年轻人", "通用"], complexity: "简洁", styles: ["国际风", "现代"] },
    description: "英文圆角无衬线字体，轻盈现代，适合个人Vlog、生活方式与商品广告，年轻用户更适配。"
  },
  "Shadows Into Light": {
    family: "Shadows Into Light", lang: "en",
    tags: { scenes: ["个人Vlog", "生活方式", "旅行"], audience: ["年轻人", "文艺"], complexity: "简洁", styles: ["国际风", "手写"] },
    description: "英文手写字体，纤细随性，适合个人Vlog、生活记录与旅行，年轻文艺用户更适配。"
  },
  "Satisfy": {
    family: "Satisfy", lang: "en",
    tags: { scenes: ["个人Vlog", "生活方式", "活动促销"], audience: ["文艺", "年轻人"], complexity: "复杂", styles: ["国际风", "手写", "文艺"] },
    description: "英文手写连笔字体，柔美流畅，适合活动促销与生活记录，文艺用户更适配。"
  },
  "Great Vibes": {
    family: "Great Vibes", lang: "en",
    tags: { scenes: ["个人Vlog", "活动促销", "杂志"], audience: ["文艺", "通用"], complexity: "复杂", styles: ["国际风", "手写", "奢华"] },
    description: "英文花体手写字体，华丽优雅，适合婚礼、活动与杂志，文艺用户更适配。"
  },
  "Righteous": {
    family: "Righteous", lang: "en",
    tags: { scenes: ["海报", "品牌", "活动促销"], audience: ["年轻人", "潮流"], complexity: "简洁", styles: ["国际风", "复古", "时尚风"] },
    description: "英文复古展示字体，圆润硬朗，适合海报、品牌与活动，年轻潮流用户更适配。"
  },
  "Bungee": {
    family: "Bungee", lang: "en",
    tags: { scenes: ["海报", "商品广告", "活动促销"], audience: ["年轻人", "潮流"], complexity: "复杂", styles: ["国际风", "先锋性"] },
    description: "英文块面展示字体，几何感强，适合海报、促销与潮流视觉，年轻潮流用户更适配。"
  },
  "Fredoka": {
    family: "Fredoka", lang: "en",
    tags: { scenes: ["个人Vlog", "商品广告", "亲子"], audience: ["年轻人", "亲子"], complexity: "简洁", styles: ["国际风", "现代"] },
    description: "英文圆润无衬线字体，活泼友好，适合亲子、商品与个人Vlog，年轻亲子用户更适配。"
  },
  "Lilita One": {
    family: "Lilita One", lang: "en",
    tags: { scenes: ["海报", "商品广告", "活动促销"], audience: ["年轻人", "亲子"], complexity: "简洁", styles: ["国际风", "时尚风"] },
    description: "英文圆胖展示字体，亲切活泼，适合促销海报与商品广告，年轻用户更适配。"
  },
  "Passion One": {
    family: "Passion One", lang: "en",
    tags: { scenes: ["海报", "商品广告", "活动促销"], audience: ["年轻人", "潮流"], complexity: "简洁", styles: ["国际风", "现代"] },
    description: "英文窄体展示字体，能量感强，适合海报、促销与商品广告，年轻用户更适配。"
  },
  "Archivo Black": {
    family: "Archivo Black", lang: "en",
    tags: { scenes: ["海报", "商品广告", "品牌"], audience: ["年轻人", "潮流"], complexity: "简洁", styles: ["国际风", "时尚风", "先锋性"] },
    description: "英文超粗无衬线字体，压迫感强，适合海报、品牌与促销标题，年轻潮流用户更适配。"
  },
  "Space Grotesk": {
    family: "Space Grotesk", lang: "en",
    tags: { scenes: ["科技数码", "品牌", "海报"], audience: ["年轻人", "商务"], complexity: "简洁", styles: ["国际风", "科技", "先锋性"] },
    description: "英文几何无衬线字体，科技感强，适合科技产品、品牌与海报，年轻商务用户更适配。"
  },
  "DM Serif Display": {
    family: "DM Serif Display", lang: "en",
    tags: { scenes: ["杂志", "文化宣传", "品牌"], audience: ["文艺", "通用"], complexity: "复杂", styles: ["国际风", "奢华", "时尚风"] },
    description: "英文高对比衬线字体，优雅有气场，适合杂志、品牌与文化宣传，文艺用户更适配。"
  },
  "Special Elite": {
    family: "Special Elite", lang: "en",
    tags: { scenes: ["海报", "文化宣传", "个人Vlog"], audience: ["文艺", "年轻人"], complexity: "简洁", styles: ["国际风", "复古"] },
    description: "英文打字机字体，斑驳做旧，适合复古海报、文化内容与个人Vlog，文艺用户更适配。"
  },

  // ── 英文 · 从 MotionSites 提示词提取 ──
  "Inter": {
    family: "Inter", lang: "en",
    tags: { scenes: ["商品广告", "品牌", "科技数码"], audience: ["商务", "通用"], complexity: "简洁", styles: ["国际风", "现代", "极简"] },
    description: "英文现代无衬线字体，中性易读，适合品牌、商品广告与科技页面，商务用户更适配。"
  },
  "Inter Tight": {
    family: "Inter Tight", lang: "en",
    tags: { scenes: ["品牌", "科技数码", "海报"], audience: ["商务", "通用"], complexity: "简洁", styles: ["国际风", "现代", "极简"] },
    description: "英文紧凑无衬线字体，字距紧、标题感强，适合品牌标题与科技页面，商务用户更适配。"
  },
  "Geist": {
    family: "Geist", lang: "en",
    tags: { scenes: ["科技数码", "品牌", "商品广告"], audience: ["年轻人", "商务"], complexity: "简洁", styles: ["国际风", "科技", "现代"] },
    description: "英文现代无衬线字体，几何感强，适合科技产品与开发者品牌，年轻商务用户更适配。"
  },
  "Figtree": {
    family: "Figtree", lang: "en",
    tags: { scenes: ["品牌", "商品广告", "个人Vlog"], audience: ["年轻人", "通用"], complexity: "简洁", styles: ["国际风", "现代"] },
    description: "英文几何无衬线字体，友好干净，适合品牌、商品与个人Vlog，年轻用户更适配。"
  },
  "Instrument Serif": {
    family: "Instrument Serif", lang: "en",
    tags: { scenes: ["杂志", "文化宣传", "品牌"], audience: ["文艺", "通用"], complexity: "复杂", styles: ["国际风", "文艺", "复古"] },
    description: "英文衬线字体，文艺优雅、带书写感，适合杂志与文化内容，文艺用户更适配。"
  },
  "Barlow": {
    family: "Barlow", lang: "en",
    tags: { scenes: ["海报", "科技数码", "商品广告"], audience: ["商务", "通用"], complexity: "简洁", styles: ["国际风", "现代"] },
    description: "英文窄体无衬线字体，工业感强，适合海报、科技与商品信息，商务用户更适配。"
  },
  "Sora": {
    family: "Sora", lang: "en",
    tags: { scenes: ["科技数码", "海报", "品牌"], audience: ["年轻人", "潮流"], complexity: "简洁", styles: ["国际风", "科技", "先锋性"] },
    description: "英文几何无衬线字体，未来感强，适合科技产品、海报与品牌，年轻潮流用户更适配。"
  },
  "JetBrains Mono": {
    family: "JetBrains Mono", lang: "en",
    tags: { scenes: ["科技数码", "品牌"], audience: ["商务", "通用"], complexity: "简洁", styles: ["国际风", "科技", "极简"] },
    description: "英文等宽字体，代码感强，适合科技与开发者内容，商务用户更适配。"
  },
  "Questrial": {
    family: "Questrial", lang: "en",
    tags: { scenes: ["品牌", "商品广告", "文化宣传"], audience: ["通用", "商务"], complexity: "简洁", styles: ["国际风", "现代", "极简"] },
    description: "英文几何无衬线字体，简洁中性，适合品牌与商品广告，通用用户更适配。"
  },
  "Urbanist": {
    family: "Urbanist", lang: "en",
    tags: { scenes: ["品牌", "科技数码", "个人Vlog"], audience: ["年轻人", "通用"], complexity: "简洁", styles: ["国际风", "现代"] },
    description: "英文几何无衬线字体，现代利落，适合品牌与科技页面，年轻用户更适配。"
  },
  "Newsreader": {
    family: "Newsreader", lang: "en",
    tags: { scenes: ["杂志", "文化宣传", "品牌"], audience: ["文艺", "通用"], complexity: "复杂", styles: ["国际风", "文艺", "复古"] },
    description: "英文衬线字体，报刊感强，适合杂志与文化内容，文艺用户更适配。"
  },
  "Nunito": {
    family: "Nunito", lang: "en",
    tags: { scenes: ["个人Vlog", "生活方式", "亲子"], audience: ["年轻人", "亲子"], complexity: "简洁", styles: ["国际风", "温柔", "现代"] },
    description: "英文圆润无衬线字体，亲切友好，适合个人Vlog与亲子内容，年轻亲子用户更适配。"
  },
  "Prata": {
    family: "Prata", lang: "en",
    tags: { scenes: ["杂志", "穿搭时尚", "品牌"], audience: ["文艺", "通用"], complexity: "复杂", styles: ["国际风", "奢华", "复古"] },
    description: "英文衬线字体，优雅复古，适合杂志与时尚内容，文艺用户更适配。"
  },
  "Hanken Grotesk": {
    family: "Hanken Grotesk", lang: "en",
    tags: { scenes: ["品牌", "商品广告", "科技数码"], audience: ["商务", "通用"], complexity: "简洁", styles: ["国际风", "现代", "极简"] },
    description: "英文grotesque无衬线字体，中性现代，适合品牌与商品广告，商务用户更适配。"
  },
  "Manrope": {
    family: "Manrope", lang: "en",
    tags: { scenes: ["品牌", "科技数码", "商品广告"], audience: ["商务", "通用"], complexity: "简洁", styles: ["国际风", "现代", "科技"] },
    description: "英文几何无衬线字体，现代中性，适合品牌与科技页面，商务用户更适配。"
  },
  "Orbitron": {
    family: "Orbitron", lang: "en",
    tags: { scenes: ["科技数码", "海报", "活动促销"], audience: ["年轻人", "潮流"], complexity: "复杂", styles: ["国际风", "科技", "先锋性"] },
    description: "英文未来科技字体，几何感强，适合科技海报与游戏视觉，年轻潮流用户更适配。"
  },
  "Open Sans": {
    family: "Open Sans", lang: "en",
    tags: { scenes: ["品牌", "商品广告", "文化宣传"], audience: ["通用", "商务"], complexity: "简洁", styles: ["国际风", "现代"] },
    description: "英文无衬线字体，中性易读，适合品牌与正文，通用用户更适配。"
  },

  // ── 英文 · Fontshare ──
  "Satoshi": {
    family: "Satoshi", lang: "en",
    tags: { scenes: ["商品广告", "品牌", "科技数码"], audience: ["商务", "通用"], complexity: "简洁", styles: ["国际风", "现代", "极简"] },
    description: "英文现代无衬线字体，中性精致，适合品牌、商品广告与科技页面，商务用户更适配。"
  },
  "General Sans": {
    family: "General Sans", lang: "en",
    tags: { scenes: ["品牌", "商品广告", "科技数码"], audience: ["商务", "通用"], complexity: "简洁", styles: ["国际风", "现代"] },
    description: "英文中性无衬线字体，干净易读，适合品牌、商品与科技内容，商务用户更适配。"
  },
  "Cabinet Grotesk": {
    family: "Cabinet Grotesk", lang: "en",
    tags: { scenes: ["品牌", "杂志", "穿搭时尚"], audience: ["年轻人", "潮流"], complexity: "简洁", styles: ["国际风", "时尚风", "复古"] },
    description: "英文grotesque无衬线字体，个性鲜明，适合品牌、杂志与穿搭时尚，年轻潮流用户更适配。"
  },
  "Clash Display": {
    family: "Clash Display", lang: "en",
    tags: { scenes: ["海报", "穿搭时尚", "品牌"], audience: ["年轻人", "潮流"], complexity: "复杂", styles: ["国际风", "时尚风", "先锋性"] },
    description: "英文展示字体，字形张扬、有冲击力，适合海报、时尚品牌与潮流视觉，年轻潮流用户更适配。"
  },
  "Chillax": {
    family: "Chillax", lang: "en",
    tags: { scenes: ["品牌", "个人Vlog", "生活方式"], audience: ["年轻人", "通用"], complexity: "简洁", styles: ["国际风", "温柔"] },
    description: "英文圆润无衬线字体，轻松舒展，适合品牌、生活方式与个人Vlog，年轻用户更适配。"
  },
  "Switzer": {
    family: "Switzer", lang: "en",
    tags: { scenes: ["品牌", "商品广告", "科技数码"], audience: ["商务", "通用"], complexity: "简洁", styles: ["国际风", "极简"] },
    description: "英文极简无衬线字体，中性克制，适合品牌、商品与科技内容，商务用户更适配。"
  },
  "Expose": {
    family: "Expose", lang: "en",
    tags: { scenes: ["杂志", "品牌", "穿搭时尚"], audience: ["文艺", "商务"], complexity: "简洁", styles: ["国际风", "时尚风"] },
    description: "英文优雅无衬线字体，气质利落，适合杂志、品牌与穿搭时尚，文艺用户更适配。"
  },
  "Ranade": {
    family: "Ranade", lang: "en",
    tags: { scenes: ["杂志", "文化宣传", "品牌"], audience: ["文艺", "通用"], complexity: "简洁", styles: ["国际风", "文艺"] },
    description: "英文人文无衬线字体，温和耐读，适合杂志、文化宣传与品牌，文艺用户更适配。"
  },
  "Synonym": {
    family: "Synonym", lang: "en",
    tags: { scenes: ["海报", "文化宣传", "活动促销"], audience: ["文艺", "年轻人"], complexity: "简洁", styles: ["国际风", "复古"] },
    description: "英文复古无衬线字体，文雅有力，适合海报、文化内容与活动，文艺用户更适配。"
  },
  "Tabular": {
    family: "Tabular", lang: "en",
    tags: { scenes: ["科技数码", "品牌", "商品广告"], audience: ["商务", "通用"], complexity: "简洁", styles: ["国际风", "科技", "极简"] },
    description: "英文等宽无衬线字体，理性克制，适合科技、数据与品牌，商务用户更适配。"
  },
  "Tanker": {
    family: "Tanker", lang: "en",
    tags: { scenes: ["海报", "商品广告", "活动促销"], audience: ["年轻人", "潮流"], complexity: "简洁", styles: ["国际风", "现代"] },
    description: "英文粗壮展示字体，力量感强，适合海报、促销与商品标题，年轻潮流用户更适配。"
  },
  "Technor": {
    family: "Technor", lang: "en",
    tags: { scenes: ["海报", "科技数码", "活动促销"], audience: ["年轻人", "潮流"], complexity: "简洁", styles: ["国际风", "科技", "先锋性"] },
    description: "英文科技展示字体，硬朗锐利，适合科技海报、活动与潮流视觉，年轻潮流用户更适配。"
  },
  "Gambetta": {
    family: "Gambetta", lang: "en",
    tags: { scenes: ["杂志", "文化宣传", "品牌"], audience: ["文艺", "商务"], complexity: "复杂", styles: ["国际风", "奢华", "复古"] },
    description: "英文古典衬线字体，典雅厚重，适合杂志、文化内容与高端品牌，文艺用户更适配。"
  },
  "Rowan": {
    family: "Rowan", lang: "en",
    tags: { scenes: ["杂志", "文化宣传", "生活方式"], audience: ["文艺", "通用"], complexity: "简洁", styles: ["国际风", "文艺"] },
    description: "英文现代衬线字体，温润耐读，适合杂志、文化宣传与生活内容，文艺用户更适配。"
  },
  "Sentient": {
    family: "Sentient", lang: "en",
    tags: { scenes: ["杂志", "文化宣传", "品牌"], audience: ["文艺", "商务"], complexity: "复杂", styles: ["国际风", "奢华"] },
    description: "英文衬线字体，柔和高级，适合杂志、品牌与文化宣传，文艺用户更适配。"
  },
  "Gambarino": {
    family: "Gambarino", lang: "en",
    tags: { scenes: ["杂志", "穿搭时尚", "品牌"], audience: ["文艺", "年轻人"], complexity: "复杂", styles: ["国际风", "时尚风", "奢华"] },
    description: "英文高对比衬线字体，时髦精致，适合杂志、时尚与品牌，文艺用户更适配。"
  },
  "Boska": {
    family: "Boska", lang: "en",
    tags: { scenes: ["杂志", "穿搭时尚", "品牌"], audience: ["文艺", "年轻人"], complexity: "复杂", styles: ["国际风", "时尚风", "奢华"] },
    description: "英文衬线展示字体，装饰性强、时尚感足，适合杂志、时尚与品牌，文艺用户更适配。"
  },
  "Kihim": {
    family: "Kihim", lang: "en",
    tags: { scenes: ["海报", "文化宣传", "活动促销"], audience: ["年轻人", "文艺"], complexity: "复杂", styles: ["国际风", "先锋性", "复古"] },
    description: "英文展示字体，结构多变、实验感强，适合海报、文化内容与活动，年轻文艺用户更适配。"
  },
  "Striper": {
    family: "Striper", lang: "en",
    tags: { scenes: ["海报", "个人Vlog", "活动促销"], audience: ["年轻人", "潮流"], complexity: "复杂", styles: ["国际风", "先锋性", "复古"] },
    description: "英文条纹装饰字体，样式华丽，具有先锋性，适合时尚博客、杂志与潮流活动，年轻用户更适配。"
  },
  "Comico": {
    family: "Comico", lang: "en",
    tags: { scenes: ["个人Vlog", "生活方式", "亲子"], audience: ["年轻人", "亲子"], complexity: "复杂", styles: ["国际风", "手写", "文艺"] },
    description: "英文手写卡通字体，俏皮随性，适合亲子、个人Vlog与生活内容，年轻亲子用户更适配。"
  },

  // ── 英文 · 无中文字形（归入英文）──
  "M PLUS Code Latin": {
    family: "M PLUS Code Latin", lang: "en",
    tags: { scenes: ["科技数码", "品牌"], audience: ["商务", "通用"], complexity: "简洁", styles: ["国际风", "科技", "极简"] },
    description: "英文等宽无衬线字体，理性清晰，适合科技、代码与数据内容，商务用户更适配。"
  },
  "Zen Dots": {
    family: "Zen Dots", lang: "en",
    tags: { scenes: ["海报", "科技数码"], audience: ["年轻人", "潮流"], complexity: "简洁", styles: ["国际风", "科技", "先锋性"] },
    description: "英文点阵展示字体，科技复古，适合海报与科技视觉，年轻潮流用户更适配。"
  },
  "Zen Loop": {
    family: "Zen Loop", lang: "en",
    tags: { scenes: ["海报", "活动促销"], audience: ["年轻人", "潮流"], complexity: "简洁", styles: ["国际风", "现代", "先锋性"] },
    description: "英文几何展示字体，现代利落，适合海报与活动，年轻潮流用户更适配。"
  },
  "Zen Tokyo Zoo": {
    family: "Zen Tokyo Zoo", lang: "en",
    tags: { scenes: ["海报", "活动促销"], audience: ["年轻人", "潮流"], complexity: "复杂", styles: ["国际风", "先锋性", "复古"] },
    description: "英文创意展示字体，字形夸张，适合海报与潮流活动，年轻用户更适配。"
  },

  // ── 中文 · 书法（中国风）──
  "Ma Shan Zheng": {
    family: "Ma Shan Zheng", lang: "zh",
    tags: { scenes: ["文化宣传", "海报", "活动促销"], audience: ["中年人以上", "文艺"], complexity: "复杂", styles: ["中国风", "毛笔"] },
    description: "中文毛笔楷书书法字体，笔锋厚重、字形端正，适合文化宣传、海报与活动场景，中年以上用户更适配。"
  },
  "Zhi Mang Xing": {
    family: "Zhi Mang Xing", lang: "zh",
    tags: { scenes: ["文化宣传", "海报", "个人Vlog"], audience: ["中年人以上", "文艺"], complexity: "复杂", styles: ["中国风", "毛笔", "先锋性"] },
    description: "中文行书书法字体，笔势连绵、气韵生动，适合文化宣传与海报，中年以上用户更适配。"
  },
  "Long Cang": {
    family: "Long Cang", lang: "zh",
    tags: { scenes: ["文化宣传", "海报", "个人Vlog"], audience: ["中年人以上", "文艺"], complexity: "复杂", styles: ["中国风", "毛笔"] },
    description: "中文手写书法字体，笔画舒展、带行草味，适合文化内容与海报，中年以上用户更适配。"
  },
  "Liu Jian Mao Cao": {
    family: "Liu Jian Mao Cao", lang: "zh",
    tags: { scenes: ["文化宣传", "海报", "活动促销"], audience: ["中年人以上", "文艺"], complexity: "复杂", styles: ["中国风", "毛笔", "先锋性"] },
    description: "中文毛草书法字体，笔意狂放、辨识度独特，适合文化海报与活动，中年以上用户更适配。"
  },
  "Alimama DongFangDaKai": {
    family: "Alimama DongFangDaKai", lang: "zh",
    tags: { scenes: ["文化宣传", "海报", "品牌"], audience: ["中年人以上", "商务"], complexity: "复杂", styles: ["中国风", "毛笔", "奢华"] },
    description: "中文毛笔大楷书法字体，字架恢弘、气势足，适合文化宣传、品牌与海报，中年以上用户更适配。"
  },
  "Alimama DaoLiTi": {
    family: "Alimama DaoLiTi", lang: "zh",
    tags: { scenes: ["文化宣传", "海报", "活动促销"], audience: ["中年人以上", "文艺"], complexity: "复杂", styles: ["中国风", "毛笔", "复古"] },
    description: "中国隶书书法字体，文字规整、古意明显，适合中国文化宣传与海报，中年人以上用户更适配。"
  },
  "Yozai": {
    family: "Yozai", lang: "zh",
    tags: { scenes: ["个人Vlog", "文化宣传", "生活方式"], audience: ["文艺", "年轻人"], complexity: "复杂", styles: ["中国风", "毛笔", "文艺"] },
    description: "中文毛笔手写字体，笔触松弛、带涂鸦感，适合个人Vlog与文化内容，文艺用户更适配。"
  },

  // ── 中文 · 现代字体（国际风）──
  "Noto Sans SC": {
    family: "Noto Sans SC", lang: "zh",
    tags: { scenes: ["商品广告", "品牌", "科技数码"], audience: ["商务", "通用"], complexity: "简洁", styles: ["国际风", "现代", "极简"] },
    description: "中文现代黑体，字形规整、可读性高，适合商品广告、品牌与科技页面，商务用户更适配。"
  },
  "Noto Serif SC": {
    family: "Noto Serif SC", lang: "zh",
    tags: { scenes: ["杂志", "文化宣传", "品牌"], audience: ["商务", "通用"], complexity: "复杂", styles: ["国际风", "奢华", "现代"] },
    description: "中文现代宋体，端庄典雅，适合杂志、文化内容与高端品牌，商务用户更适配。"
  },
  "ZCOOL KuaiLe": {
    family: "ZCOOL KuaiLe", lang: "zh",
    tags: { scenes: ["个人Vlog", "活动促销", "亲子"], audience: ["年轻人", "亲子"], complexity: "简洁", styles: ["国际风", "手写", "文艺"] },
    description: "中文活泼手写体，圆润可爱，适合亲子、活动促销与个人Vlog，年轻亲子用户更适配。"
  },
  "ZCOOL XiaoWei": {
    family: "ZCOOL XiaoWei", lang: "zh",
    tags: { scenes: ["文化宣传", "个人Vlog", "品牌"], audience: ["文艺", "通用"], complexity: "复杂", styles: ["国际风", "手写", "文艺"] },
    description: "中文手写文艺体，清秀有书卷气，适合文化宣传与生活内容，文艺用户更适配。"
  },
  "ZCOOL QingKe HuangYou": {
    family: "ZCOOL QingKe HuangYou", lang: "zh",
    tags: { scenes: ["海报", "商品广告", "活动促销"], audience: ["年轻人", "亲子"], complexity: "简洁", styles: ["国际风", "现代"] },
    description: "中文粗圆展示体，亲切饱满，适合促销海报与商品广告，年轻用户更适配。"
  },
  "LXGW WenKai": {
    family: "LXGW WenKai", lang: "zh",
    tags: { scenes: ["文化宣传", "个人Vlog", "生活方式"], audience: ["文艺", "通用"], complexity: "简洁", styles: ["国际风", "手写", "文艺"] },
    description: "中文手写楷体，温润易读、带书写感，适合文化内容与生活记录，文艺用户更适配。"
  },
  "LXGW WenKai TC": {
    family: "LXGW WenKai TC", lang: "zh",
    tags: { scenes: ["文化宣传", "个人Vlog", "生活方式"], audience: ["文艺", "通用"], complexity: "简洁", styles: ["国际风", "手写", "文艺"] },
    description: "中文繁体手写楷体，温润易读，适合文化内容与生活记录，文艺用户更适配。"
  },
  "Smiley Sans": {
    family: "Smiley Sans", lang: "zh",
    tags: { scenes: ["海报", "穿搭时尚", "品牌"], audience: ["年轻人", "潮流"], complexity: "简洁", styles: ["国际风", "时尚风", "先锋性"] },
    description: "中文倾斜黑体，字面窄长、动感强，适合时尚海报、品牌与潮流视觉，年轻潮流用户更适配。"
  },
  "NaikaiFont": {
    family: "NaikaiFont", lang: "zh",
    tags: { scenes: ["个人Vlog", "生活方式", "文化宣传"], audience: ["文艺", "年轻人"], complexity: "复杂", styles: ["国际风", "手写", "文艺"] },
    description: "中文涂鸦手写体，笔触随性、趣味感强，适合个人Vlog与生活内容，年轻文艺用户更适配。"
  },
  "HarmonyOS Sans SC": {
    family: "HarmonyOS Sans SC", lang: "zh",
    tags: { scenes: ["商品广告", "品牌", "科技数码"], audience: ["商务", "通用"], complexity: "简洁", styles: ["国际风", "科技", "现代"] },
    description: "中文现代黑体，简洁均衡、屏幕友好，适合商品广告、品牌与科技产品，商务用户更适配。"
  },
  "MiSans": {
    family: "MiSans", lang: "zh",
    tags: { scenes: ["商品广告", "品牌", "科技数码"], audience: ["商务", "通用"], complexity: "简洁", styles: ["国际风", "科技", "现代"] },
    description: "中文现代黑体，清秀中性、数字友好，适合品牌、商品与科技内容，商务用户更适配。"
  },
  "DingTalk JinBuTi": {
    family: "DingTalk JinBuTi", lang: "zh",
    tags: { scenes: ["商品广告", "品牌", "活动促销"], audience: ["商务", "通用"], complexity: "简洁", styles: ["国际风", "现代"] },
    description: "中文现代黑体，结构方正、效率感强，适合商品广告与品牌信息，商务用户更适配。"
  },
  "TaoBao MaiCaiTi": {
    family: "TaoBao MaiCaiTi", lang: "zh",
    tags: { scenes: ["商品广告", "活动促销", "生活方式"], audience: ["年轻人", "通用"], complexity: "简洁", styles: ["国际风", "手写", "文艺"] },
    description: "中文手写体，生活化、带市集气息，适合商品广告与促销，年轻用户更适配。"
  },
  "Alimama ShuHeiTi": {
    family: "Alimama ShuHeiTi", lang: "zh",
    tags: { scenes: ["海报", "商品广告", "科技数码"], audience: ["年轻人", "潮流"], complexity: "简洁", styles: ["国际风", "科技", "先锋性"] },
    description: "中文数字科技黑体，几何感强、现代利落，适合海报、科技产品与商品广告，年轻用户更适配。"
  },
  "Alimama FangYuanTi": {
    family: "Alimama FangYuanTi", lang: "zh",
    tags: { scenes: ["商品广告", "个人Vlog", "生活方式"], audience: ["年轻人", "亲子"], complexity: "简洁", styles: ["国际风", "现代", "温柔"] },
    description: "中文方圆体，圆角柔和、亲和力强，适合商品广告、生活内容与亲子场景，年轻用户更适配。"
  }
};

export function kbOf(name: string): FontKBEntry | undefined {
  return FONT_KB[name];
}
