<script setup lang="ts">
const emit = defineEmits<{ (e: "back"): void }>();
import { computed, ref } from "vue";
import VocabPanel from "@/shared/VocabPanel.vue";

interface Step { step: string; ok: boolean; count: number; detail: string }
interface JobStep { step: string; status: string; detail: string }
interface Subject {
  subject: string; category: string; role: string; depth: string;
  occlusionPreference: string; bbox: number[];
}
interface ColorCell { region: number; color: string; layer: string }
interface Result {
  image_id: string; width: number; height: number;
  subjectCount: number; subjects: Subject[];
  maskHeatGrid?: number[]; maskCoverage?: number;
  colorGrid?: ColorCell[]; colorGridCols?: number; colorGridRows?: number;
  texts?: Array<{ content: string; conf: number; bbox: number[] }>;
  analysis?: Record<string, any>;
  steps: Step[];
  imageUrl?: string;
}

const fileInput = ref<HTMLInputElement | null>(null);
const previewUrl = ref<string>("");
const busy = ref(false);
const result = ref<Result | null>(null);
const errorMsg = ref<string>("");
const currentFile = ref<File | null>(null);
const jobSteps = ref<JobStep[]>([]);
const saved = ref(false);
const savedToLib = ref(false);
const pendingId = ref<string>("");
const picked = ref<File[]>([]);
/** 空串 = 未归类（06 没给出确切类别） */
const category = ref<string>("");
const CATEGORY_VALUES = new Set([
  "3d", "creative", "ecommerce", "landingpage", "magazine", "technology", "travel"
]);
const CATEGORIES = [
  { v: "", label: "未归类" },
  { v: "3d", label: "3D" }, { v: "creative", label: "创意" },
  { v: "ecommerce", label: "电商" }, { v: "landingpage", label: "hero主页" },
  { v: "magazine", label: "杂志" }, { v: "technology", label: "科技" },
  { v: "travel", label: "旅行" }
];
const batch = ref<null | { id: string; title: string; total: number; done: number; failed: number; status: string }>(null);
let batchTimer = 0;
const elapsed = ref(0);

const wfDetection = computed(() => {
  const r = result.value;
  if (!r) return null;
  if (!r.maskHeatGrid && !r.colorGrid) return null;
  return {
    subjectCount: r.subjectCount ?? 0,
    heatGrid: r.maskHeatGrid ?? [],
    cols: 10,
    rows: 10,
    colorGrid: r.colorGrid ?? null,
    textGrid: null
  };
});

const steps = [
  { n: "01", title: "主体探查", desc: "DeepSeek 视觉 · 语义定位 + bbox" },
  { n: "02", title: "SAM 分割", desc: "bbox 提示 · 精确像素 mask" },
  { n: "03", title: "热区计算", desc: "10×10 覆盖率 · 0-100" },
  { n: "04", title: "色块探查", desc: "主体=0 时 · 逐格中位色 + HSV" },
  { n: "05", title: "文字探查", desc: "EasyOCR · 内容 + 位置" },
  { n: "06", title: "语汇分析", desc: "DeepSeek · 构图/色调/风格/场景" },
  { n: "07", title: "写入结果", desc: "deepseek.json + analysis.json" }
];

function statusOf(name: string): "idle" | "running" | "done" {
  const s = jobSteps.value.find((x) => x.step === name);
  if (!s) return "idle";
  return s.status === "running" ? "running" : "done";
}

function pickFile() { fileInput.value?.click(); }

async function runBatch() {
  if (!picked.value.length) return;
  busy.value = true; errorMsg.value = ""; result.value = null; batch.value = null; saved.value = false;
  try {
    const fd = new FormData();
    for (const f of picked.value) fd.append("files", f, f.name);
    const res = await fetch("/api/v1/workflow/batch", { method: "POST", body: fd });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { batchId } = (await res.json()) as { batchId: string };
    await pollBatch(batchId);
  } catch (err) {
    errorMsg.value = (err as Error).message; busy.value = false;
  }
}

async function pollBatch(id: string) {
  window.clearTimeout(batchTimer);
  const res = await fetch(`/api/v1/workflow/batches/${id}`);
  if (!res.ok) { busy.value = false; return; }
  const m = (await res.json()) as { id: string; title: string; total: number; done: number; failed: number; status: string };
  batch.value = m;
  if (m.status !== "done") batchTimer = window.setTimeout(() => { void pollBatch(id); }, 2000);
  else busy.value = false;
}

function runAnalyze() {
  if (picked.value.length > 1) void runBatch();
  else void analyze();
}

function onFile(e: Event) {
  const list = Array.from((e.target as HTMLInputElement).files ?? []);
  const f = list[0];
  if (!f) return;
  picked.value = list;
  currentFile.value = f;
  previewUrl.value = URL.createObjectURL(f);
  result.value = null;
  errorMsg.value = "";
  jobSteps.value = [];
  saved.value = false;
  savedToLib.value = false;
  category.value = "";
  elapsed.value = 0;
}

async function saveToLib() {
  if (!pendingId.value) return;
  try {
    const res = await fetch("/api/v1/workflow/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingId: pendingId.value, category: category.value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    savedToLib.value = true;
  } catch (err) {
    errorMsg.value = (err as Error).message;
  }
}

function retry() {
  if (currentFile.value) analyze();
}

async function analyze() {
  if (!currentFile.value) return;
  busy.value = true;
  errorMsg.value = "";
  result.value = null;
  jobSteps.value = [];
  saved.value = false;
  savedToLib.value = false;
  pendingId.value = "";
  elapsed.value = 0;
  const t0 = Date.now();
  const timer = setInterval(() => { elapsed.value = Math.round((Date.now() - t0) / 1000); }, 500);

  try {
    const fd = new FormData();
    fd.append("file", currentFile.value);
    const res = await fetch("/api/v1/workflow/analyze", { method: "POST", body: fd });
    const start = await res.json();
    if (!res.ok) throw new Error(start.error || `HTTP ${res.status}`);
    const jobId = start.jobId as string;

    for (;;) {
      await new Promise((r) => setTimeout(r, 1200));
      const poll = await fetch(`/api/v1/workflow/jobs/${jobId}`);
      const job = await poll.json();
      jobSteps.value = job.steps || [];
      if (job.status === "done") {
        result.value = job.result as Result;
        const auto = (job.result as any)?.analysis?.category;
        // 06 没给出确切分类时保持「未归类」，不强行猜
        if (typeof auto === "string" && CATEGORY_VALUES.has(auto)) category.value = auto;
        pendingId.value = (job.result as Result & { pendingId?: string }).pendingId || "";
        saved.value = true;
        break;
      }
      if (job.status === "error") throw new Error(job.error || "分析失败");
    }
  } catch (err) {
    errorMsg.value = (err as Error).message;
  } finally {
    clearInterval(timer);
    busy.value = false;
  }
}
</script>

<template>
  <section class="wf">
    <header class="wf-head">
      <button class="crumb" @click="emit('back')">灵感 &lt;</button>
      <p class="eyebrow">WORKFLOW · 画面分析</p>
      <h1>上传图片，自动分析落库</h1>
      <p class="sub">主体探查 → SAM 分割 → 热区 / 色块 → 文字 → 语汇分析 → 落库</p>
    </header>

    <div class="wf-steps">
      <div
        v-for="(s, i) in steps"
        :key="s.n"
        class="wf-step"
        :class="{
          'is-running': busy && statusOf(s.title) === 'running',
          'is-done': statusOf(s.title) === 'done',
          'is-idle': !busy && !saved && statusOf(s.title) === 'idle'
        }"
      >
        <span class="num">{{ s.n }}</span>
        <b>{{ s.title }}</b>
        <small>{{ s.desc }}</small>
        <span class="dot-state">
          {{ statusOf(s.title) === "done"
            ? "✓ 完成"
            : busy && statusOf(s.title) === "running"
              ? "运行中…"
              : saved
                ? "跳过"
                : "待执行" }}
        </span>
      </div>
    </div>

    <div class="wf-body">
      <div class="panel upload-panel">
        <div class="drop" @click="pickFile">
          <img v-if="previewUrl" :src="previewUrl" alt="preview" />
          <div v-else class="placeholder">
            <span class="plus">+</span>
            <p>点击选择图片</p>
            <small>JPG / PNG / WEBP</small>
          </div>
        </div>
        <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="onFile" />
        <p v-if="picked.length > 1" class="picked">已选 {{ picked.length }} 张 · 将建为一个文件夹</p>
        <button class="run" :disabled="!currentFile || busy" @click="runAnalyze">
          {{ busy ? `分析中… ${elapsed}s` : picked.length > 1 ? `批量分析 ${picked.length} 张` : "开始分析" }}
        </button>

        <div v-if="batch" class="batch-box">
          <div class="batch-line">
            <b>{{ batch.title }}</b>
            <span>{{ batch.done }}/{{ batch.total }}<template v-if="batch.failed"> · 失败 {{ batch.failed }}</template></span>
          </div>
          <div class="bar"><i :style="{ width: `${Math.round((batch.done / Math.max(1, batch.total)) * 100)}%` }"></i></div>
          <a class="go-lib" href="/inspiration" @click.prevent="emit('back')">去灵感库 · 上传 分类查看 →</a>
        </div>

        <label v-if="currentFile && picked.length <= 1" class="cat-pick">
          类别
          <select v-model="category" :disabled="busy">
            <option v-for="c in CATEGORIES" :key="c.v" :value="c.v">{{ c.label }}</option>
          </select>
          <small class="cat-hint">
            {{ busy
              ? "分析完成后自动填入"
              : saved
                ? (category ? "06 已识别，可手动调整" : "06 未识别出确切类别，落库后显示未归类")
                : "06 未识别出确切类别时为未归类" }}
          </small>
        </label>
        <div v-if="saved && !busy" class="actions">
          <button class="ghost" @click="retry">↻ 重试</button>
          <button class="save" :disabled="savedToLib" @click="saveToLib">
            {{ savedToLib ? "✓ 已落库" : "＋ 落库" }}
          </button>
        </div>
        <p v-if="errorMsg" class="err">{{ errorMsg }}</p>
        <div v-if="savedToLib" class="saved">✅ 已落库 · 灵感库「uploads」分类可查看</div>
      </div>

      <div class="panel result-panel">
        <div v-if="busy && jobSteps.length" class="live">
          <b>执行进度</b>
          <div v-for="(s, i) in jobSteps" :key="i" class="live-row">
            <span class="st" :class="{ done: s.status !== 'running' }">{{ s.status === "running" ? "◌" : "✓" }}</span>
            <span class="nm">{{ s.step }}</span>
            <span class="dt">{{ s.detail }}</span>
          </div>
        </div>
        <div v-else-if="!result" class="empty">等待分析结果…</div>

        <template v-if="result">
          <div class="result-head">
            <b>{{ result.image_id }}</b>
            <span class="badge">主体 {{ result.subjectCount }}</span>
          </div>

          <div class="subjects" v-if="result.subjects?.length">
            <div v-for="(s, i) in result.subjects" :key="i" class="subject-row">
              <span class="role">{{ s.role === "primary" ? "主" : "次" }}</span>
              <div>
                <b>{{ s.subject }}</b>
                <small>{{ s.category }} · {{ s.depth }} · {{ s.occlusionPreference }}</small>
              </div>
            </div>
          </div>

          <div class="block">
            <VocabPanel
              :vocabulary="result.analysis"
              :detection="wfDetection"
              heat-size="40%"
              style="--heat-max: 300px"
            />
          </div>

          <div class="block" v-if="result.texts?.length">
            <b>文字（{{ result.texts.length }}）</b>
            <ul class="texts">
              <li v-for="(t, i) in result.texts.slice(0, 8)" :key="i">{{ t.content }}</li>
            </ul>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.wf { max-width: 1200px; margin: 0 auto; padding: 40px 24px 100px; color: #e9ece6; }
.eyebrow { font: 600 10px/1 var(--mono, ui-monospace); letter-spacing: .22em; color: #6d6d66; margin: 0 0 12px; }
h1 { font-size: 34px; margin: 0 0 8px; letter-spacing: -.02em; }
.sub { color: #8a8a80; font-size: 13px; margin: 0 0 28px; }

.crumb {
  margin: 0 0 14px;
  padding: 4px 10px 4px 0;
  border: 0;
  color: #8f979f;
  background: none;
  font: 600 11px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.06em;
  cursor: pointer;
}
.crumb:hover { color: #d9ff52; }

.picked { margin: 6px 0 0; color: #d9ff52; font-size: 11px; }
.batch-box { margin-top: 12px; padding: 12px; border: 1px solid #2a323a; border-radius: 10px; background: #10141a; }
.batch-line { display: flex; justify-content: space-between; font-size: 11.5px; color: #ccd3da; margin-bottom: 8px; }
.batch-line b { font-weight: 600; }
.bar { height: 5px; border-radius: 99px; background: #1c232b; overflow: hidden; }
.bar i { display: block; height: 100%; background: #d9ff52; transition: width 220ms ease; }
.go-lib { display: inline-block; margin-top: 10px; color: #d9ff52; font-size: 11px; text-decoration: none; }
.go-lib:hover { text-decoration: underline; }
.cat-pick { display: flex; align-items: center; gap: 8px; margin-top: 10px; color: #8f979f; font-size: 11px; }
.cat-pick select {
  padding: 5px 8px; border: 1px solid #39414b; border-radius: 7px;
  color: #dfe5ea; background: #14181d; font-size: 11px;
}
.cat-pick select:disabled { opacity: .55; cursor: progress; }
.cat-hint { color: #6f7680; font-size: 10px; line-height: 1.5; }

.wf-steps { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin-bottom: 28px; }
.wf-step { position: relative; border: 1px solid #23262a; border-radius: 10px; padding: 12px; background: #0e1012; display: flex; flex-direction: column; gap: 4px; transition: border-color 200ms ease, background 200ms ease; }
.wf-step.is-running { border-color: #d9ff52; background: #14180f; }
.wf-step.is-done { border-color: #2f4a2f; background: #0f1510; }
.wf-step .num { font: 700 10px/1 ui-monospace; color: #d9ff52; }
.wf-step b { font-size: 12px; }
.wf-step small { font-size: 10px; color: #7a7a72; line-height: 1.5; }
.dot-state { margin-top: 4px; font: 600 9px/1 ui-monospace; color: #5d5d57; }
.wf-step.is-running .dot-state { color: #d9ff52; }
.wf-step.is-done .dot-state { color: #8fd18f; }

.wf-body { display: grid; grid-template-columns: 380px 1fr; gap: 16px; align-items: start; }
.panel { border: 1px solid #23262a; border-radius: 12px; background: #0e1012; padding: 14px; }
.drop { aspect-ratio: 4/3; border: 1px dashed #2f3338; border-radius: 10px; overflow: hidden; cursor: pointer; display: flex; align-items: center; justify-content: center; background: #0a0c0e; }
.drop img { width: 100%; height: 100%; object-fit: contain; }
.placeholder { text-align: center; color: #6f6f68; }
.placeholder .plus { font-size: 34px; color: #d9ff52; }
.placeholder p { margin: 6px 0 2px; font-size: 13px; }
.placeholder small { font-size: 10px; }
.run { width: 100%; margin-top: 12px; padding: 11px; border: 0; border-radius: 9px; background: #d9ff52; color: #11140c; font-weight: 800; font-size: 13px; cursor: pointer; }
.run:disabled { opacity: .45; cursor: not-allowed; }
.err { color: #ff8a80; font-size: 11px; margin: 10px 0 0; }
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
.actions button { padding: 9px; border-radius: 9px; font-weight: 700; font-size: 12px; cursor: pointer; }
.actions .ghost { background: transparent; border: 1px solid #39414b; color: #c8d0d8; }
.actions .save { background: #d9ff52; border: 0; color: #11140c; }
.actions .save:disabled { opacity: .5; cursor: default; }
.saved { margin-top: 10px; padding: 9px 10px; border-radius: 8px; background: #16210f; border: 1px solid #2f4a2f; color: #b6e48f; font-size: 11px; }

.result-panel { min-height: 420px; }
.empty { color: #5d5d57; font-size: 13px; text-align: center; padding: 120px 0; }
.live { display: flex; flex-direction: column; gap: 8px; }
.live > b { font-size: 11px; color: #a8a89e; }
.live-row { display: grid; grid-template-columns: 20px 110px 1fr; gap: 8px; font-size: 11px; color: #b8b8ae; }
.live-row .st { color: #d9ff52; }
.live-row .st.done { color: #8fd18f; }
.live-row .dt { color: #7a7a72; }
.result-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.badge { font: 700 10px/1 ui-monospace; background: #d9ff52; color: #11140c; padding: 4px 8px; border-radius: 99px; }
.subjects { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.subject-row { display: flex; gap: 10px; align-items: flex-start; border: 1px solid #23262a; border-radius: 8px; padding: 8px 10px; }
.subject-row .role { font: 700 10px/1 ui-monospace; background: #1d2124; color: #d9ff52; padding: 4px 6px; border-radius: 5px; }
.subject-row b { font-size: 12px; display: block; }
.subject-row small { font-size: 10px; color: #7a7a72; }

.block { margin-bottom: 16px; }
.block > b { font-size: 11px; color: #a8a89e; display: block; margin-bottom: 8px; }
.block small { display: block; margin-top: 6px; font-size: 10px; color: #7a7a72; }

.texts { margin: 0; padding-left: 16px; font-size: 11px; color: #b8b8ae; line-height: 1.7; }
</style>
