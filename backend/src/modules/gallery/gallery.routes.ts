import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";

// 动图（gif）先隐藏，资源保留；只列静态图
const IMAGE_RE = /\.(webp|png|jpg|jpeg)$/i;

/** 灵感库的「确切分类」字典；uploads 只是容器，不算分类。 */
const DICTIONARY_CATEGORIES = new Set([
  "3d",
  "creative",
  "ecommerce",
  "landingpage",
  "magazine",
  "technology",
  "travel"
]);

function autoCategoryOf(meta: Record<string, unknown>): string | null {
  const candidates: unknown[] = [meta.category];
  if (Array.isArray(meta.tags)) candidates.push(...meta.tags);
  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const normalized = value.trim().toLowerCase();
    if (DICTIONARY_CATEGORIES.has(normalized)) return normalized;
  }
  return null;
}

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

export interface DesignVocabulary {
  semanticSummary: string | null;
  embeddingText: string | null;
  geometry: {
    subjects: Array<Record<string, unknown>>;
    texts: Array<Record<string, unknown>>;
    relations: Array<Record<string, unknown>>;
  } | null;
  style: Record<string, unknown> | null;
  scene: Record<string, unknown> | null;
  grid: { cols: number; rows: number } | null;
  composition: Record<string, unknown> | null;
  texts: Array<Record<string, unknown>> | null;
  subjects: Array<Record<string, unknown>> | null;
  meta: Record<string, unknown> | null;
  designGuidance: Record<string, unknown> | null;
}

export interface GalleryItem {
  title: string;
  category: string;
  free: boolean;
  hasPrompt: boolean;
  promptLen: number;
  image: string;
  imageUrl: string;
  promptUrl: string | null;
  hasAnalysis: boolean;
  batchId: string | null;
  /** 用户收藏 = 优质素材，沉淀知识库时映射为「是否优质素材」。 */
  favorite: boolean;
  /** 06 语汇分析给出的字典分类；未识别为 null（前端显示「未归类」）。 */
  autoCategory: string | null;
  tags: string[];
  vocabulary: DesignVocabulary | null;
  detection: {
    subjectCount: number;
    heatGrid: number[];
    cols: number;
    rows: number;
    colorGrid: Array<{ region: number; color: string; layer: string }> | null;
    textGrid: number[] | null;
    width: number;
    height: number;
  } | null;
}

/**
 * 用检测框算 10×10 热区：每格分数 = 主体框与该格的重合面积 / 格面积（0-100）。
 * 框只是「压到」这一格不代表 100 分，要看重合度。
 */
function computeHeatGrid(
  objects: Array<{ bbox?: number[] }>,
  width: number,
  height: number,
  cols = 10,
  rows = 10
): number[] {
  const cells = new Array<number>(cols * rows).fill(0);
  if (!width || !height) return cells;
  const cw = width / cols;
  const ch = height / rows;
  const cellArea = cw * ch;
  for (const o of objects) {
    const b = o.bbox;
    if (!Array.isArray(b) || b.length !== 4) continue;
    const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = b as number[];
    const c0 = Math.max(0, Math.floor(x1 / cw));
    const c1 = Math.min(cols - 1, Math.floor((x2 - 0.001) / cw));
    const r0 = Math.max(0, Math.floor(y1 / ch));
    const r1 = Math.min(rows - 1, Math.floor((y2 - 0.001) / ch));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const ix1 = Math.max(x1, c * cw);
        const ix2 = Math.min(x2, (c + 1) * cw);
        const iy1 = Math.max(y1, r * ch);
        const iy2 = Math.min(y2, (r + 1) * ch);
        const iw = Math.max(0, ix2 - ix1);
        const ih = Math.max(0, iy2 - iy1);
        const pct = Math.round(((iw * ih) / cellArea) * 100);
        const idx = r * cols + c;
        if (pct > (cells[idx] ?? 0)) cells[idx] = pct;
      }
    }
  }
  return cells;
}

/**
 * 素材查看器：
 * - GET /api/v1/gallery/motionsites  按文件夹扫描，返回分类与文件信息（含设计语汇）
 * - GET /gallery/motionsites/:category/:file  服务图片 / 提示词 / 分析 JSON
 */

/**
 * 用文案 bbox（归一化 x,y,w,h）算 10×10 文案覆盖率：
 * 每格 = 文案框与该格的重合面积 / 格面积（0-100）
 */
function computeTextGrid(
  texts: Array<{ bbox?: { x?: number; y?: number; w?: number; h?: number } }>,
  cols = 10,
  rows = 10
): number[] {
  const cells = new Array<number>(cols * rows).fill(0);
  for (const t of texts) {
    const b = t?.bbox;
    if (!b) continue;
    const x1 = Number(b.x) || 0;
    const y1 = Number(b.y) || 0;
    const x2 = x1 + (Number(b.w) || 0);
    const y2 = y1 + (Number(b.h) || 0);
    if (x2 <= x1 || y2 <= y1) continue;
    const cw = 1 / cols;
    const ch = 1 / rows;
    const c0 = Math.max(0, Math.floor(x1 / cw));
    const c1 = Math.min(cols - 1, Math.floor((x2 - 1e-6) / cw));
    const r0 = Math.max(0, Math.floor(y1 / ch));
    const r1 = Math.min(rows - 1, Math.floor((y2 - 1e-6) / ch));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const ix = Math.max(0, Math.min(x2, (c + 1) * cw) - Math.max(x1, c * cw));
        const iy = Math.max(0, Math.min(y2, (r + 1) * ch) - Math.max(y1, r * ch));
        const pct = Math.round(((ix * iy) / (cw * ch)) * 100);
        const idx = r * cols + c;
        if (pct > (cells[idx] ?? 0)) cells[idx] = pct;
      }
    }
  }
  return cells;
}


/** 用 OCR 的像素 bbox 算 10×10 文案覆盖率（比 LLM 的 6×6 粗区域精确） */
function computeTextGridPx(
  texts: Array<{ bbox?: number[] }>,
  width: number,
  height: number,
  cols = 10,
  rows = 10
): number[] {
  const cells = new Array<number>(cols * rows).fill(0);
  if (!width || !height) return cells;
  const cw = width / cols;
  const ch = height / rows;
  for (const t of texts) {
    const b = t?.bbox;
    if (!Array.isArray(b) || b.length !== 4) continue;
    const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = b;
    if (x2 <= x1 || y2 <= y1) continue;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ix = Math.max(0, Math.min(x2, (c + 1) * cw) - Math.max(x1, c * cw));
        const iy = Math.max(0, Math.min(y2, (r + 1) * ch) - Math.max(y1, r * ch));
        const pct = Math.round(((ix * iy) / (cw * ch)) * 100);
        const idx = r * cols + c;
        if (pct > (cells[idx] ?? 0)) cells[idx] = pct;
      }
    }
  }
  return cells;
}

export async function registerGalleryRoutes(
  app: FastifyInstance,
  opts: { root: string; retryEnabled?: boolean }
): Promise<void> {
  const root = opts.root;
  const retryEnabled = opts.retryEnabled !== false;

  app.get("/api/v1/gallery/config", async () => ({ retryEnabled }));

  app.get("/api/v1/gallery/motionsites", async () => {
    const categories = new Set<string>();
    const items: GalleryItem[] = [];

    /* 批量任务 → 灵感库文件夹（首图为封面，带进度） */
    const folders: Array<{
      id: string; title: string; total: number; done: number; failed: number;
      status: string; createdAt: number; cover: string | null;
    }> = [];
    try {
      const bdir = path.join(root, "uploads", ".batches");
      for (const f of await readdir(bdir)) {
        if (!f.endsWith(".json")) continue;
        try {
          const m = JSON.parse(await readFile(path.join(bdir, f), "utf8")) as {
            id: string; title: string; total: number; done: number; failed: number;
            status: string; createdAt: number; items: Array<{ name: string; status: string }>;
          };
          const firstDone = m.items?.find((x) => x.status === "done");
          folders.push({
            id: m.id, title: m.title, total: m.total, done: m.done ?? 0,
            failed: m.failed ?? 0, status: m.status, createdAt: m.createdAt,
            cover: firstDone ? `/gallery/motionsites/uploads/${encodeURIComponent(firstDone.name)}` : null
          });
        } catch { /* 跳过损坏清单 */ }
      }
    } catch { /* 无批次目录 */ }

    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const category = entry.name;
      categories.add(category);

      const catDir = path.join(root, category);
      const files = await readdir(catDir);
      for (const file of files) {
        if (!IMAGE_RE.test(file)) continue;
        const base = file.replace(IMAGE_RE, "");

        let meta: Record<string, unknown> = {};
        try {
          meta = JSON.parse(await readFile(path.join(catDir, `${base}.json`), "utf8"));
        } catch {
          /* 无 json 时用文件名兜底 */
        }

        const promptName = `${base}-prompt.md`;
        let promptLen = 0;
        try {
          promptLen = (await readFile(path.join(catDir, promptName), "utf8")).length;
        } catch {
          /* 无提示词 */
        }

        // 设计语汇：来自 <base>.analysis.json（三层结构）
        let vocabulary: DesignVocabulary | null = null;
        try {
          const analysis = JSON.parse(await readFile(path.join(catDir, `${base}.analysis.json`), "utf8"));
          vocabulary = {
            semanticSummary: (analysis.semanticSummary as string) ?? null,
            embeddingText: (analysis.embeddingText as string) ?? null,
            geometry: (analysis.geometry as DesignVocabulary["geometry"]) ?? null,
            style: (analysis.style as Record<string, unknown>) ?? null,
            scene: (analysis.scene as Record<string, unknown>) ?? null,
            grid: (analysis.grid as { cols: number; rows: number }) ?? null,
            composition: (analysis.composition as Record<string, unknown>) ?? null,
            texts: (analysis.texts as Array<Record<string, unknown>>) ?? null,
            subjects: (analysis.subjects as Array<Record<string, unknown>>) ?? null,
            meta: (analysis.meta as Record<string, unknown>) ?? null,
            designGuidance: (analysis.designGuidance as Record<string, unknown>) ?? null
          };
        } catch {
          /* 无分析结果 */
        }

        // 检测结果：优先 Florence-2（.florence.json），其次 YOLO（.detect.json）
        let detection: GalleryItem["detection"] = null;
        let det: Record<string, unknown> | null = null;
        // OCR 文本（detect.json），用于更精确的文案格子
        let ocrTexts: Array<{ bbox?: number[] }> = [];
        let ocrW = 0;
        let ocrH = 0;
        try {
          const detFile = JSON.parse(await readFile(path.join(catDir, `${base}.detect.json`), "utf8"));
          ocrTexts = Array.isArray(detFile.texts) ? detFile.texts : [];
          ocrW = Number(detFile.width) || 0;
          ocrH = Number(detFile.height) || 0;
        } catch {
          /* 无 detect.json */
        }
        for (const name of [`${base}.deepseek.json`, `${base}.florence.json`, `${base}.detect.json`]) {
          try {
            det = JSON.parse(await readFile(path.join(catDir, name), "utf8"));
            break;
          } catch {
            /* 试下一个 */
          }
        }
        // OCR 文本现在随物理层一起存在 .deepseek.json（旧 .detect.json 已清退）
        if (det && Array.isArray((det as Record<string, unknown>).texts) && ((det as Record<string, unknown>).texts as unknown[]).length) {
          ocrTexts = (det as Record<string, unknown>).texts as Array<{ bbox?: number[] }>;
          ocrW = Number((det as Record<string, unknown>).width) || ocrW;
          ocrH = Number((det as Record<string, unknown>).height) || ocrH;
        }

        if (det) {
          const objects = Array.isArray(det.objects) ? det.objects : [];
          const w = Number(det.width) || 0;
          const h = Number(det.height) || 0;
          // 有 SAM 分割热区就优先用（精确形状），否则退回 bbox 重合度
          const heatGrid = Array.isArray(det.maskHeatGrid)
            ? (det.maskHeatGrid as number[])
            : computeHeatGrid(objects, w, h, 10, 10);
          const subjectCount =
            typeof det.subjectCount === "number" ? (det.subjectCount as number) : objects.length;
          detection = {
            subjectCount,
            heatGrid,
            cols: 10,
            rows: 10,
            colorGrid: Array.isArray(det.colorGrid)
              ? (det.colorGrid as Array<{ region: number; color: string; layer: string }>)
              : null,
            textGrid:
              ocrTexts.length && ocrW && ocrH
                ? computeTextGridPx(ocrTexts, ocrW, ocrH)
                : vocabulary?.geometry?.texts && vocabulary.geometry.texts.length
                  ? computeTextGrid(vocabulary.geometry.texts)
                  : null,
            width: ocrW || Number(det.width) || 0,
            height: ocrH || Number(det.height) || 0
          };
        }

        const enc = encodeURIComponent(file);
        items.push({
          title: (meta.title as string) || (vocabulary ? base : base),
          batchId: (meta.batchId as string) ?? null,
          favorite: Boolean(meta.favorite),
          autoCategory: autoCategoryOf(meta),
          tags: Array.isArray(meta.tags) ? (meta.tags as string[]) : [],
          category,
          free: meta.access === "free",
          hasPrompt: promptLen > 0,
          promptLen,
          image: file,
          imageUrl: `/gallery/motionsites/${category}/${enc}`,
          promptUrl: promptLen > 0 ? `/gallery/motionsites/${category}/${encodeURIComponent(promptName)}` : null,
          hasAnalysis: vocabulary !== null,
          vocabulary,
          detection
        });
      }
    }

    items.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));

    return {
      categories: [...categories].sort(),
      folders: folders.sort((a, b) => b.createdAt - a.createdAt),
      items,
      total: items.length,
      freeCount: items.filter((i) => i.free).length,
      paidCount: items.filter((i) => !i.free).length,
      analysisCount: items.filter((i) => i.hasAnalysis).length
    };
  });

  /** 收藏 = 优质素材达标；写回同名 meta.json，供后续知识库打「是否优质素材」标签。 */
  app.post("/api/v1/gallery/motionsites/:category/:file/favorite", async (request, reply) => {
    const { category, file } = request.params as { category: string; file: string };
    const safeCategory = category.replace(/[^a-zA-Z0-9-]/g, "");
    const safeFile = path.basename(file);
    const base = safeFile.replace(IMAGE_RE, "");
    if (!safeCategory || !safeFile || !base) {
      return reply.code(400).send({ error: "bad path" });
    }
    const body = (request.body ?? {}) as { favorite?: unknown };
    const favorite = Boolean(body.favorite);
    const metaPath = path.join(root, safeCategory, `${base}.json`);
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(await readFile(metaPath, "utf8")) as Record<string, unknown>;
    } catch {
      /* 无 meta 时新建 */
    }
    meta.title = (meta.title as string) || base;
    meta.favorite = favorite;
    if (favorite) meta.favoritedAt = new Date().toISOString();
    else delete meta.favoritedAt;
    try {
      await writeFile(metaPath, JSON.stringify(meta, null, 2));
    } catch {
      return reply.code(500).send({ error: "write failed" });
    }
    return { ok: true, favorite };
  });

  app.get("/gallery/motionsites/:category/:file", async (request, reply) => {
    const { category, file } = request.params as { category: string; file: string };
    const safeCategory = category.replace(/[^a-zA-Z0-9-]/g, "");
    const safeFile = path.basename(file); // 去掉任何路径穿越成分
    const fullPath = path.join(root, safeCategory, safeFile);

    if (!fullPath.startsWith(path.join(root, safeCategory) + path.sep)) {
      return reply.code(400).send({ error: "bad path" });
    }

    try {
      const data = await readFile(fullPath);
      const contentType = CONTENT_TYPES[path.extname(safeFile).toLowerCase()] ?? "application/octet-stream";
      return reply.type(contentType).send(data);
    } catch {
      return reply.code(404).send({ error: "not found" });
    }
  });
}
