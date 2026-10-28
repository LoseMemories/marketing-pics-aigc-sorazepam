import { readdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { currentCatalogVersion } from "./gallery-cache.js";

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
  /** 存在 `<base>.rerun.analysis.json` 重分析候选，等待对比采纳。 */
  pendingRerun: boolean;
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

/** 批量任务文件夹元信息（灵感库「批次」卡片）。 */
export interface GalleryFolderMeta {
  id: string;
  title: string;
  total: number;
  done: number;
  failed: number;
  status: string;
  createdAt: number;
  cover: string | null;
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
          // 全量判据：同目录存在候选重分析结果即算「需更新」（与 /reanalyze/compare 一致）
          pendingRerun: files.includes(`${base}.rerun.analysis.json`),
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

  /* ───────────────── 懒加载 feed ───────────────── */
  /**
   * 分页会话：每个分类维护一条已乱序队列 + 前进式游标。
   * 游标只增不减 → 同一次浏览不可能重复拿到同一张图。
   */
  interface FeedSession {
    id: string;
    categories: string[];
    queues: Map<string, GalleryItem[]>;
    offsets: Map<string, number>;
    lastAccess: number;
  }

  const FEED_TTL_MS = 10 * 60 * 1000;
  const SCAN_TTL_MS = 30 * 1000;
  const feedSessions = new Map<string, FeedSession>();
  let scanCache:
    | {
        at: number;
        version: number;
        items: GalleryItem[];
        folders: GalleryFolderMeta[];
        categories: string[];
      }
    | null = null;

  /** 复用既有扫描路由，避免把扫描逻辑写两份（同一响应格式）。 */
  async function loadCatalog(): Promise<{
    items: GalleryItem[];
    folders: GalleryFolderMeta[];
    categories: string[];
  }> {
    const version = currentCatalogVersion();
    // 上传写入会 bump 版本号 → 缓存立即失效，不用等 TTL
    if (scanCache && scanCache.version === version && Date.now() - scanCache.at < SCAN_TTL_MS) {
      return scanCache;
    }
    const response = await app.inject({ method: "GET", url: "/api/v1/gallery/motionsites" });
    const payload = response.json() as {
      items: GalleryItem[];
      folders: GalleryFolderMeta[];
      categories: string[];
    };
    scanCache = {
      at: Date.now(),
      version,
      items: payload.items,
      folders: payload.folders,
      categories: payload.categories
    };
    return scanCache;
  }

  function parseCategories(raw: unknown): string[] {
    if (typeof raw !== "string") return [];
    return raw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0);
  }

  function shuffle<T>(input: T[]): T[] {
    const list = [...input];
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j] as T, list[i] as T];
    }
    return list;
  }

  function pruneSessions(): void {
    const deadline = Date.now() - FEED_TTL_MS;
    for (const [id, session] of feedSessions) {
      if (session.lastAccess < deadline) feedSessions.delete(id);
    }
  }

  /** 轻量：只取批次文件夹，供进度轮询用（不会重建分页会话）。 */
  app.get("/api/v1/gallery/folders", async () => {
    const catalog = await loadCatalog();
    return { folders: catalog.folders };
  });

  /**
   * 筛选区统计：一次性返回全量计数，与懒加载完全解耦。
   * 前端只拉一次（以及收藏/删除后刷新），不随分页变化。
   */
  app.get("/api/v1/gallery/stats", async () => {
    const catalog = await loadCatalog();
    const folderIds = new Set(catalog.folders.map((folder) => folder.id));
    const categories = catalog.categories.map((name) => ({
      name,
      total: catalog.items.filter((item) => item.category === name).length
    }));
    const uploadsSingles = catalog.items.filter(
      (item) => item.category === "uploads" && !(item.batchId && folderIds.has(item.batchId))
    ).length;
    const folderItems = catalog.folders.reduce((sum, folder) => sum + (folder.total || 0), 0);

    return {
      total: catalog.items.length,
      categories,
      favorite: catalog.items.filter((item) => item.favorite).length,
      analyzed: catalog.items.filter((item) => item.hasAnalysis).length,
      needsUpdate: catalog.items.filter((item) => item.pendingRerun).length,
      uploads: {
        folders: catalog.folders.length,
        folderItems,
        singles: uploadsSingles
      }
    };
  });

  /**
   * 第一步：拿总数与每个分类的可用量，并开启一个分页会话。
   * categories 为空 → 后端兜底成「全部」分类。
   */
  app.get<{ Querystring: { categories?: string } }>(
    "/api/v1/gallery/feed/meta",
    async (request) => {
      pruneSessions();
      const catalog = await loadCatalog();
      // 目录即分类（含 uploads）；空参数时默认全部
      const available = catalog.categories;
      const requested = parseCategories(request.query.categories).filter((name) =>
        available.includes(name)
      );
      // 兜底：没传、传了不存在的、或全部过滤后为空 → 全部字典分类
      const effective = requested.length > 0 ? requested : available;

      const queues = new Map<string, GalleryItem[]>();
      const offsets = new Map<string, number>();
      const breakdown: Array<{ name: string; total: number }> = [];
      for (const name of effective) {
        const bucket = shuffle(catalog.items.filter((item) => item.category === name));
        queues.set(name, bucket);
        offsets.set(name, 0);
        breakdown.push({ name, total: bucket.length });
      }

      const sessionId = randomUUID();
      feedSessions.set(sessionId, {
        id: sessionId,
        categories: effective,
        queues,
        offsets,
        lastAccess: Date.now()
      });

      // 全量分类计数：即使只查一个分类，前端 tabs 也能显示全局数量
      const allCounts = available.map((name) => ({
        name,
        total: catalog.items.filter((item) => item.category === name).length
      }));

      return {
        sessionId,
        categories: breakdown,
        allCounts,
        total: breakdown.reduce((sum, entry) => sum + entry.total, 0),
        allCategories: available,
        folders: catalog.folders
      };
    }
  );

  /**
   * 按可见窗口估算一批数量：列数由容器宽度决定，行数由视口高度决定，取 1.5 倍。
   * 与前端行排布的常量保持一致（卡片最小宽 190、间距 16）。
   */
  function estimateBatchSize(viewportWidth?: number, viewportHeight?: number): number {
    const CARD_MIN = 190;
    const GAP = 16;
    const width = Number.isFinite(viewportWidth) && (viewportWidth ?? 0) > 0 ? (viewportWidth as number) : 1440;
    const height = Number.isFinite(viewportHeight) && (viewportHeight ?? 0) > 0 ? (viewportHeight as number) : 900;
    const perRow = Math.max(2, Math.floor(width / (CARD_MIN + GAP)));
    const rows = Math.max(2, Math.ceil(height / (CARD_MIN + GAP)));
    return Math.min(120, Math.max(6, Math.ceil(perRow * rows * 1.5)));
  }

  /**
   * 第二步：按配额取下一页。
   * 配额按各分类「剩余量」等比分配（最大余额法补足），游标前进后不会重复。
   * 批量大小：显式 limit 优先，否则用 vw/vh 推算 1.5 倍窗口量。
   */
  app.get<{ Querystring: { session?: string; limit?: string; vw?: string; vh?: string } }>(
    "/api/v1/gallery/feed",
    async (request, reply) => {
      pruneSessions();
      const session = feedSessions.get(String(request.query.session ?? ""));
      if (!session) {
        return reply.code(410).send({
          error: {
            code: "FEED_EXPIRED",
            message: "分页会话已过期，请重新加载图库。",
            details: {}
          }
        });
      }
      session.lastAccess = Date.now();

      const explicitLimit = Number(request.query.limit);
      const limit = Number.isFinite(explicitLimit) && explicitLimit > 0
        ? Math.min(Math.max(Math.trunc(explicitLimit), 1), 120)
        : estimateBatchSize(Number(request.query.vw), Number(request.query.vh));

      const remaining = new Map<string, number>();
      let totalRemaining = 0;
      for (const [name, queue] of session.queues) {
        const left = Math.max(0, queue.length - (session.offsets.get(name) ?? 0));
        remaining.set(name, left);
        totalRemaining += left;
      }

      const target = Math.min(limit, totalRemaining);
      const quotas = new Map<string, number>();
      const fractions: Array<{ name: string; fraction: number }> = [];
      let assigned = 0;
      if (target > 0) {
        for (const [name, left] of remaining) {
          if (left <= 0) continue;
          const exact = (target * left) / totalRemaining;
          const base = Math.floor(exact);
          quotas.set(name, base);
          assigned += base;
          fractions.push({ name, fraction: exact - base });
        }
        // 至少让还有余量的分类各出 1 张，保证随机排布有分类多样性
        if (target >= fractions.length) {
          for (const { name } of fractions) {
            if ((quotas.get(name) ?? 0) > 0) continue;
            if (assigned >= target) break;
            quotas.set(name, 1);
            assigned += 1;
          }
        }
        fractions.sort((a, b) => b.fraction - a.fraction);
        let index = 0;
        while (assigned < target && fractions.length > 0) {
          const entry = fractions[index % fractions.length];
          if (!entry) break;
          const name = entry.name;
          const left = remaining.get(name) ?? 0;
          if ((quotas.get(name) ?? 0) < left) {
            quotas.set(name, (quotas.get(name) ?? 0) + 1);
            assigned += 1;
          }
          index += 1;
          if (index > target + fractions.length * 2) break;
        }
      }

      const items: GalleryItem[] = [];
      const picked: Array<{ name: string; returned: number; total: number; taken: number }> = [];
      for (const name of session.categories) {
        const queue = session.queues.get(name) ?? [];
        const offset = session.offsets.get(name) ?? 0;
        const quota = quotas.get(name) ?? 0;
        const slice = quota > 0 ? queue.slice(offset, offset + quota) : [];
        session.offsets.set(name, offset + slice.length);
        items.push(...slice);
        picked.push({
          name,
          returned: slice.length,
          total: queue.length,
          taken: offset + slice.length
        });
      }

      const exhausted = picked.every((entry) => entry.taken >= entry.total);
      return {
        session: session.id,
        items,
        counts: picked,
        returned: items.length,
        exhausted
      };
    }
  );

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
