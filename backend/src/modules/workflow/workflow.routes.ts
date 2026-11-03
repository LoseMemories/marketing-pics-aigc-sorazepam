import { spawn } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { invalidateGalleryCatalog } from "../gallery/gallery-cache.js";
import {
  notifyRetryStateChange,
  setFailedKeyProvider,
  setRetryKeyProvider
} from "../../shared/events/retry-events.js";

interface JobStep { step: string; status: string; detail: string }
interface Job {
  id: string;
  status: "queued" | "running" | "done" | "error";
  steps: JobStep[];
  result?: Record<string, unknown>;
  error?: string;
  pendingName?: string;
  startedAt: number;
}

interface RetryTask {
  key: string;
  category: string;
  base: string;
  file: string;
  title: string;
  imgPath: string;
  candidateDeepseek: string;
  candidateAnalysis: string;
  oldAnalysis: Record<string, unknown> | null;
  oldDetection: Record<string, unknown> | null;
  job: Job;
}

/** 批量任务清单：持久化到 uploads/.batches/<id>.json，重启后仍可读 */
interface BatchItem { name: string; base: string; status: "pending" | "running" | "done" | "failed"; error?: string }
export interface BatchManifest {
  id: string;
  title: string;
  createdAt: number;
  status: "analyzing" | "done";
  total: number;
  done: number;
  failed: number;
  items: BatchItem[];
}

/** 灵感库字典分类；06 未给出确切值时一律不归类。 */
const CATEGORY_SET = new Set([
  "3d",
  "carton",
  "creative",
  "ecommerce",
  "landingpage",
  "magazine",
  "technology",
  "travel"
]);
const CATEGORY_ALIASES: Record<string, string> = {
  "3D": "3d",
  "动漫": "carton",
  "二次元": "carton",
  "anime": "carton",
  "创意": "creative",
  "电商": "ecommerce",
  "hero主页": "landingpage",
  "落地页": "landingpage",
  "杂志": "magazine",
  "科技": "technology",
  "旅行": "travel"
};

function normalizeCategory(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  const lowered = value.toLowerCase();
  if (CATEGORY_SET.has(lowered)) return lowered;
  return CATEGORY_ALIASES[value] ?? null;
}

const jobs = new Map<string, Job>();

/**
 * 工作流：
 *  POST   /api/v1/workflow/analyze         单张上传 → 后台分析（.pending，不落库）→ { jobId }
 *  GET    /api/v1/workflow/jobs/:id        轮询单张进度
 *  POST   /api/v1/workflow/batch           多张上传 → 建批次，后台串行分析并自动落库 → { batchId }
 *  GET    /api/v1/workflow/batches         批次列表（灵感库文件夹用）
 *  GET    /api/v1/workflow/batches/:id     单个批次进度
 *  POST   /api/v1/workflow/save            { pendingId, category } → 落库
 *  DELETE /api/v1/workflow/uploads/:base   删除已落库素材
 */
export async function registerWorkflowRoutes(
  app: FastifyInstance,
  opts: {
    uploadDir: string;
    galleryRoot: string;
    scriptPath: string;
    python: string;
    pythonPath: string;
    /** live-assets 根目录：工作台对图库素材复用同一条分析管线 */
    liveAssetsRoot: string;
  }
): Promise<void> {
  const pendingDir = path.join(opts.uploadDir, ".pending");
  const batchDir = path.join(opts.uploadDir, ".batches");
  const retryQueue: RetryTask[] = [];
  const retryJobs = new Map<string, RetryTask>();
  let retryRunning = 0;
  const MAX_RETRY_CONCURRENCY = 2;

  const safeBase = (raw: string): string =>
    (raw || "upload").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "upload";

  /** 起一个 python 分析进程，把 PROGRESS 行回调出去 */
  function spawnAnalyze(
    imgPath: string,
    jsonPath: string,
    onStep: (s: JobStep) => void
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let stdout = "";
      const child = spawn(opts.python, [opts.scriptPath, imgPath, jsonPath], {
        env: { ...process.env, PYTHONPATH: opts.pythonPath }
      });
      // spawn 失败（解释器路径不存在等）会抛 error 事件，未处理会直接终止 Node 进程
      child.on("error", (error) => {
        reject(new Error(`无法启动分析进程 ${opts.python}: ${error.message}`));
      });
      let buf = "";
      child.stderr.on("data", (chunk) => {
        buf += String(chunk);
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const m = line.match(/^PROGRESS\|(.+?)\|(.+?)\|(.*)$/);
          if (m) onStep({ step: m[1] ?? "", status: m[2] ?? "", detail: m[3] ?? "" });
        }
      });
      child.stdout.on("data", (d) => (stdout += String(d)));
      child.on("close", (code) => {
        const start = stdout.indexOf("{");
        const end = stdout.lastIndexOf("}");
        if (code !== 0 || start === -1 || end === -1) {
          reject(new Error(`分析失败 (exit ${code})`));
          return;
        }
        try {
          resolve(JSON.parse(stdout.slice(start, end + 1)) as Record<string, unknown>);
        } catch {
          reject(new Error("结果解析失败"));
        }
      });
    });
  }

  /** 把 .pending 里的产物落库，并写 meta（含二元标签） */
  async function commitPending(name: string, category: string | null, batchId?: string): Promise<string> {
    const src = path.join(pendingDir, name);
    const dst = path.join(opts.uploadDir, name);
    await copyFile(src, dst);
    for (const suffix of [".deepseek.json", ".analysis.json"]) {
      await copyFile(src.replace(/\.[^.]+$/, suffix), dst.replace(/\.[^.]+$/, suffix)).catch(() => {});
    }
    const base = name.replace(/\.[^.]+$/, "");
    const safeCategory = normalizeCategory(category);
    const tags = ["uploads"];
    if (safeCategory) tags.push(safeCategory);
    const meta: Record<string, unknown> = {
      title: base,
      tags,
      category: safeCategory,
      batchId: batchId ?? null
    };
    await writeFile(path.join(opts.uploadDir, `${base}.json`), JSON.stringify(meta, null, 2));
    // 新图落盘 → 让图库的扫描缓存立即失效，前端刷新就能看到新批次
    invalidateGalleryCatalog();
    return name;
  }

  async function readManifest(id: string): Promise<BatchManifest | null> {
    try {
      return JSON.parse(await readFile(path.join(batchDir, `${id}.json`), "utf8")) as BatchManifest;
    } catch {
      return null;
    }
  }

  async function writeManifest(m: BatchManifest): Promise<void> {
    await mkdir(batchDir, { recursive: true });
    await writeFile(path.join(batchDir, `${m.id}.json`), JSON.stringify(m, null, 2));
  }

  async function readJson<T = Record<string, unknown>>(filePath: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(filePath, "utf8")) as T;
    } catch {
      return null;
    }
  }

  /** 与图库 detection 字段同形，供对比面板复用 VocabPanel 的热区/色块图。 */
  /** 文案框 → 10×10 热区（与图库列表同一算法，保证对比面板有文案热区） */
  function textGridOf(
    texts: Array<{ bbox?: number[] }>,
    width: number,
    height: number,
    cols = 10,
    rows = 10
  ): number[] | null {
    if (!texts.length || !width || !height) return null;
    const cells = new Array<number>(cols * rows).fill(0);
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
    return cells.some((v) => v > 0) ? cells : null;
  }

  function detectionFromRec(rec: Record<string, unknown> | null): Record<string, unknown> | null {
    if (!rec) return null;
    const width = Number(rec.width) || 0;
    const height = Number(rec.height) || 0;
    const heatGrid = Array.isArray(rec.maskHeatGrid) ? (rec.maskHeatGrid as number[]) : null;
    const colorGrid = Array.isArray(rec.colorGrid)
      ? (rec.colorGrid as Array<{ region: number; color: string; layer: string }>)
      : null;
    const subjects = Array.isArray(rec.subjects) ? (rec.subjects as unknown[]) : [];
    const texts = Array.isArray(rec.texts) ? (rec.texts as Array<{ bbox?: number[] }>) : [];
    const subjectCount =
      typeof rec.subjectCount === "number" ? (rec.subjectCount as number) : subjects.length;
    if (!heatGrid && !colorGrid) return null;
    return {
      subjectCount,
      heatGrid: heatGrid ?? [],
      cols: 10,
      rows: 10,
      colorGrid,
      textGrid: textGridOf(texts, width, height),
      width,
      height
    };
  }

  /** 重分析队列状态变化 → 推给 WebSocket 订阅方（只影响标签计数，不重查列表）。 */
  function emitRetryState(): void {
    let retrying = 0;
    for (const task of retryJobs.values()) {
      if (task.job.status === "queued" || task.job.status === "running") retrying += 1;
    }
    // 文件夹卡片的「有 x 条在重试」来自扫描结果，队列变化需让缓存失效
    invalidateGalleryCatalog();
    notifyRetryStateChange({ retrying });
  }

  // 图库侧按「重试中」筛选时，需要知道哪些素材正在队列里
  setRetryKeyProvider(() =>
    [...retryJobs.values()]
      .filter((task) => task.job.status === "queued" || task.job.status === "running")
      .map((task) => `${task.category}/${task.base}`)
  );

  // 「失败」筛选：执行出错、但仍保留在队列里的任务
  setFailedKeyProvider(() =>
    [...retryJobs.values()]
      .filter((task) => task.job.status === "error")
      .map((task) => `${task.category}/${task.base}`)
  );

  /** 重分析队列：最多 2 个并行，其余保持 queued。 */
  function pumpRetryQueue(): void {
    while (retryRunning < MAX_RETRY_CONCURRENCY && retryQueue.length) {
      const task = retryQueue.shift();
      if (!task) break;
      retryRunning += 1;
      task.job.status = "running";
      emitRetryState();
      spawnAnalyze(task.imgPath, task.candidateDeepseek, (s) => {
        const existing = task.job.steps.find((x) => x.step === s.step);
        if (existing) {
          existing.status = s.status;
          if (s.detail) existing.detail = s.detail;
        } else {
          task.job.steps.push(s);
        }
      })
        .then(async (parsed) => {
          const next =
            (parsed.analysis as Record<string, unknown> | undefined) ??
            (await readJson<Record<string, unknown>>(task.candidateAnalysis));
          if (!next) throw new Error("分析结果缺失");
          task.job.result = {
            mode: "reanalyze",
            category: task.category,
            base: task.base,
            title: task.title,
            old: task.oldAnalysis,
            next,
            oldDetection: task.oldDetection,
            nextDetection: detectionFromRec(parsed)
          };
          task.job.status = "done";
          // 候选文件已落盘 → 图库扫描缓存必须失效，否则「需更新」会停在旧数量
          invalidateGalleryCatalog();
          emitRetryState();
        })
        .catch(async (err: Error) => {
          await unlink(task.candidateDeepseek).catch(() => {});
          await unlink(task.candidateAnalysis).catch(() => {});
          // 失败不删任务：保留在队列里供「失败」筛选与重试，否则状态既不在重试也不在可更新
          task.job.status = "error";
          task.job.error = err.message;
          emitRetryState();
        })
        .finally(() => {
          retryRunning -= 1;
          pumpRetryQueue();
        });
    }
  }

  // ---------- 单张 ----------
  app.post("/api/v1/workflow/analyze", async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: "no file" });

    const buf = await data.toBuffer();
    const ext = (path.extname(data.filename) || ".jpg").toLowerCase();
    const name = `${safeBase(path.basename(data.filename, ext))}_${Date.now()}${ext}`;

    await mkdir(pendingDir, { recursive: true });
    const imgPath = path.join(pendingDir, name);
    await writeFile(imgPath, buf);
    const jsonPath = imgPath.replace(/\.[^.]+$/, ".deepseek.json");

    const id = randomUUID();
    const job: Job = { id, status: "running", steps: [], pendingName: name, startedAt: Date.now() };
    jobs.set(id, job);

    spawnAnalyze(imgPath, jsonPath, (s) => {
      const existing = job.steps.find((x) => x.step === s.step);
      if (existing) {
        existing.status = s.status;
        if (s.detail) existing.detail = s.detail;
      } else {
        job.steps.push(s);
      }
    })
      .then((parsed) => {
        parsed.pendingId = name;
        parsed.imageUrl = `/gallery/motionsites/uploads/.pending/${encodeURIComponent(name)}`;
        job.result = parsed;
        job.status = "done";
      })
      .catch((err: Error) => {
        job.status = "error";
        job.error = err.message;
      });

    return { jobId: id };
  });

  // ---------- 工作台：对图库素材复用同一条分析管线 ----------
  app.post("/api/v1/workflow/analyze-live-asset", async (request, reply) => {
    const body = (request.body ?? {}) as { assetId?: string };
    const assetId = body.assetId;
    if (!assetId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId)) {
      return reply.code(400).send({ error: "bad assetId" });
    }
    const imgPath = path.join(opts.liveAssetsRoot, assetId, "preview", "poster.jpg");
    try {
      if (!(await stat(imgPath)).isFile()) return reply.code(404).send({ error: "asset poster not found" });
    } catch {
      return reply.code(404).send({ error: "asset poster not found" });
    }

    const id = randomUUID();
    const job: Job = { id, status: "running", steps: [], startedAt: Date.now() };
    jobs.set(id, job);
    // 结果只落盘到临时目录，不动 live-assets 本体；前端展示用 stdout 回传
    const jsonPath = path.join(opts.uploadDir, ".workbench", `${id}.deepseek.json`);

    spawnAnalyze(imgPath, jsonPath, (s) => {
      const existing = job.steps.find((x) => x.step === s.step);
      if (existing) {
        existing.status = s.status;
        if (s.detail) existing.detail = s.detail;
      } else {
        job.steps.push(s);
      }
    })
      .then((parsed) => {
        job.result = parsed;
        job.status = "done";
      })
      .catch((err: Error) => {
        job.status = "error";
        job.error = err.message;
      });

    return { jobId: id };
  });

  app.get("/api/v1/workflow/jobs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = jobs.get(id);
    if (!job) return reply.code(404).send({ error: "job not found" });
    return {
      id: job.id,
      status: job.status,
      steps: job.steps,
      pendingId: job.pendingName ?? null,
      result: job.result ?? null,
      error: job.error ?? null
    };
  });

  // ---------- 批量 ----------
  app.post("/api/v1/workflow/batch", async (request, reply) => {
    const parts = request.files();
    const id = randomUUID();
    const manifest: BatchManifest = {
      id,
      title: `批量 ${new Date().toLocaleString("zh-CN", { hour12: false }).slice(5, 16)}`,
      createdAt: Date.now(),
      status: "analyzing",
      total: 0,
      done: 0,
      failed: 0,
      items: []
    };

    await mkdir(pendingDir, { recursive: true });
    const stamp = Date.now();
    let idx = 0;
    for await (const part of parts) {
      const ext = (path.extname(part.filename) || ".jpg").toLowerCase();
      const name = `${safeBase(path.basename(part.filename, ext))}_${stamp}_${idx}${ext}`;
      const imgPath = path.join(pendingDir, name);
      await writeFile(imgPath, await part.toBuffer());
      manifest.items.push({ name, base: name.replace(/\.[^.]+$/, ""), status: "pending" });
      idx += 1;
    }
    manifest.total = manifest.items.length;
    if (!manifest.total) return reply.code(400).send({ error: "no files" });
    // 只有一张不走文件夹：直接当单张上传处理，避免出现「1 张的文件夹」
    const asBatch = manifest.total > 1;
    if (asBatch) await writeManifest(manifest);
    reply.code(202).send({ batchId: asBatch ? id : null, total: manifest.total });

    // 后台串行分析（不阻塞响应）
    void (async () => {
      for (const item of manifest.items) {
        item.status = "running";
        if (asBatch) await writeManifest(manifest);
        const imgPath = path.join(pendingDir, item.name);
        const jsonPath = imgPath.replace(/\.[^.]+$/, ".deepseek.json");
        try {
          const parsed = await spawnAnalyze(imgPath, jsonPath, () => {});
          const analysis = (parsed.analysis ?? {}) as Record<string, unknown>;
          // 06 语汇分析会给出 category；缺失或不在字典内 → 未归类
          const category = normalizeCategory(analysis.category);
          await commitPending(item.name, category, asBatch ? id : undefined);
          item.status = "done";
          manifest.done += 1;
        } catch (err) {
          item.status = "failed";
          item.error = (err as Error).message;
          manifest.failed += 1;
        }
        if (asBatch) await writeManifest(manifest);
      }
      if (asBatch) {
        manifest.status = "done";
        await writeManifest(manifest);
      }
    })();
  });

  app.get("/api/v1/workflow/batches", async () => {
    await mkdir(batchDir, { recursive: true });
    const files = await readdir(batchDir);
    const out: BatchManifest[] = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        out.push(JSON.parse(await readFile(path.join(batchDir, f), "utf8")) as BatchManifest);
      } catch {
        /* 跳过损坏清单 */
      }
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    return { batches: out };
  });

  app.get("/api/v1/workflow/batches/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const m = await readManifest(id);
    if (!m) return reply.code(404).send({ error: "batch not found" });
    return m;
  });

  // ---------- 落库 ----------
  app.post("/api/v1/workflow/save", async (request, reply) => {
    const body = request.body as { pendingId?: string; category?: string };
    const pendingId = body?.pendingId;
    if (!pendingId || pendingId.includes("/") || pendingId.includes("..")) {
      return reply.code(400).send({ error: "bad pendingId" });
    }
    try {
      await commitPending(pendingId, normalizeCategory(body?.category));
      return { ok: true, imageUrl: `/gallery/motionsites/uploads/${encodeURIComponent(pendingId)}` };
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  app.post("/api/v1/workflow/reanalyze", async (request, reply) => {
    const body = request.body as { category?: string; file?: string };
    const category = (body?.category ?? "").replace(/[^a-zA-Z0-9-]/g, "");
    const file = path.basename(body?.file ?? "");
    const base = file.replace(/\.[^.]+$/, "");
    if (!category || !file || !base) return reply.code(400).send({ error: "bad request" });

    const key = `${category}/${base}`;
    const existing = retryJobs.get(key);
    if (existing && (existing.job.status === "queued" || existing.job.status === "running")) {
      return { jobId: existing.job.id, status: existing.job.status };
    }
    // 失败的任务直接重新入队（复用原记录前先清掉）
    if (existing) retryJobs.delete(key);

    const dir = path.join(opts.galleryRoot, category);
    const imgPath = path.join(dir, file);
    const candidateDeepseek = path.join(dir, `${base}.rerun.deepseek.json`);
    const candidateAnalysis = path.join(dir, `${base}.rerun.analysis.json`);
    await unlink(candidateDeepseek).catch(() => {});
    await unlink(candidateAnalysis).catch(() => {});
    // 候选文件被清掉 → 「需更新」计数需要重算
    invalidateGalleryCatalog();

    const oldAnalysis = await readJson<Record<string, unknown>>(path.join(dir, `${base}.analysis.json`));
    const oldRec = await readJson<Record<string, unknown>>(path.join(dir, `${base}.deepseek.json`));
    const oldDetection = detectionFromRec(oldRec);
    const meta = await readJson<{ title?: string }>(path.join(dir, `${base}.json`));
    const id = randomUUID();
    const job: Job = { id, status: "queued", steps: [], startedAt: Date.now() };
    jobs.set(id, job);

    const task: RetryTask = {
      key,
      category,
      base,
      file,
      title: meta?.title || base,
      imgPath,
      candidateDeepseek,
      candidateAnalysis,
      oldAnalysis,
      oldDetection,
      job
    };
    retryJobs.set(key, task);
    retryQueue.push(task);
    emitRetryState();
    pumpRetryQueue();
    return { jobId: id, status: job.status };
  });

  app.get("/api/v1/workflow/reanalyze/status", async () => ({
    tasks: [...retryJobs.values()].map((task) => ({
      category: task.category,
      base: task.base,
      file: task.file,
      title: task.title,
      status: task.job.status,
      error: task.job.error ?? null
    }))
  }));

  /** 放弃：把失败任务从队列里剔除（不碰原有识别结果）。 */
  app.post("/api/v1/workflow/reanalyze/discard", async (request, reply) => {
    const body = request.body as { category?: string; base?: string; file?: string };
    const category = (body?.category ?? "").replace(/[^a-zA-Z0-9-]/g, "");
    const base = path
      .basename(body?.base ?? body?.file ?? "")
      .replace(/\.[^.]+$/, "");
    if (!category || !base) return reply.code(400).send({ error: "bad request" });
    const dir = path.join(opts.galleryRoot, category);
    await unlink(path.join(dir, `${base}.rerun.analysis.json`)).catch(() => {});
    await unlink(path.join(dir, `${base}.rerun.deepseek.json`)).catch(() => {});
    retryJobs.delete(`${category}/${base}`);
    invalidateGalleryCatalog();
    emitRetryState();
    return { ok: true };
  });

  app.get("/api/v1/workflow/reanalyze/compare", async (request, reply) => {
    const { category, base } = request.query as { category?: string; base?: string };
    const safeCategory = (category ?? "").replace(/[^a-zA-Z0-9-]/g, "");
    const safeBase = path.basename(base ?? "").replace(/\.[^.]+$/, "");
    if (!safeCategory || !safeBase) return reply.code(400).send({ error: "bad request" });
    const dir = path.join(opts.galleryRoot, safeCategory);
    const oldAnalysis = await readJson<Record<string, unknown>>(path.join(dir, `${safeBase}.analysis.json`));
    const next = await readJson<Record<string, unknown>>(path.join(dir, `${safeBase}.rerun.analysis.json`));
    if (!next) return reply.code(404).send({ error: "no candidate" });
    const oldRec = await readJson<Record<string, unknown>>(path.join(dir, `${safeBase}.deepseek.json`));
    const nextRec = await readJson<Record<string, unknown>>(path.join(dir, `${safeBase}.rerun.deepseek.json`));
    const task = retryJobs.get(`${safeCategory}/${safeBase}`);
    return {
      category: safeCategory,
      base: safeBase,
      title: task?.title || safeBase,
      old: oldAnalysis,
      next,
      oldDetection: detectionFromRec(oldRec),
      nextDetection: detectionFromRec(nextRec)
    };
  });

  app.post("/api/v1/workflow/reanalyze/apply", async (request, reply) => {
    const body = request.body as { category?: string; base?: string; choice?: string };
    const category = (body?.category ?? "").replace(/[^a-zA-Z0-9-]/g, "");
    const base = path.basename(body?.base ?? "").replace(/\.[^.]+$/, "");
    const choice = body?.choice === "new" ? "new" : "old";
    if (!category || !base) return reply.code(400).send({ error: "bad request" });

    const dir = path.join(opts.galleryRoot, category);
    const candAnalysis = path.join(dir, `${base}.rerun.analysis.json`);
    const candDeepseek = path.join(dir, `${base}.rerun.deepseek.json`);
    try {
      if (choice === "new") {
        await copyFile(candAnalysis, path.join(dir, `${base}.analysis.json`));
        await copyFile(candDeepseek, path.join(dir, `${base}.deepseek.json`)).catch(() => {});
      }
      await unlink(candAnalysis).catch(() => {});
      await unlink(candDeepseek).catch(() => {});
      retryJobs.delete(`${category}/${base}`);
      // 采纳后语汇层与候选文件都变了 → 统计与缩略图需重扫
      invalidateGalleryCatalog();
      emitRetryState();
      return { ok: true, choice };
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  app.delete("/api/v1/workflow/uploads/:base", async (request, reply) => {
    const { base } = request.params as { base: string };
    const safe = path.basename(base);
    if (!safe || safe.includes("..")) return reply.code(400).send({ error: "bad name" });
    try {
      const files = await readdir(opts.uploadDir);
      const targets = files.filter((f) => f === safe || f.startsWith(`${safe}.`));
      for (const f of targets) {
        await unlink(path.join(opts.uploadDir, f)).catch(() => {});
      }

      /* 批次联动：从清单里移除；只剩 1 张时拆掉文件夹，最后一张退化为单图 */
      let dissolved = false;
      let remaining = 0;
      await mkdir(batchDir, { recursive: true });
      for (const mf of await readdir(batchDir)) {
        if (!mf.endsWith(".json")) continue;
        const m = await readManifest(mf.replace(/\.json$/, ""));
        if (!m) continue;
        const idx = m.items.findIndex((it) => it.base === safe || it.name === safe);
        if (idx === -1) continue;
        m.items.splice(idx, 1);
        m.total = m.items.length;
        m.done = m.items.filter((x) => x.status === "done").length;
        m.failed = m.items.filter((x) => x.status === "failed").length;
        remaining = m.total;

        if (m.total <= 1) {
          const last = m.items[0];
          if (last) {
            const metaPath = path.join(opts.uploadDir, `${last.base}.json`);
            try {
              const meta = JSON.parse(await readFile(metaPath, "utf8")) as Record<string, unknown>;
              meta.batchId = null;
              await writeFile(metaPath, JSON.stringify(meta, null, 2));
            } catch { /* 最后一张可能还没落库 */ }
          }
          await unlink(path.join(batchDir, `${m.id}.json`)).catch(() => {});
          dissolved = true;
        } else {
          await writeManifest(m);
        }
        break;
      }
      // 删除会改变目录结构 → 图库缓存同样要失效
      invalidateGalleryCatalog();
      return { ok: true, deleted: targets.length, dissolved, remaining };
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });
}
