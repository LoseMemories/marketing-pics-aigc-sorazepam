<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { LiveAsset } from "@/entities/live-asset/model/live-asset.types";
import { ApiClientError } from "@/shared/api/http-client";
import VocabPanel from "@/shared/VocabPanel.vue";
import { analyzeLiveAssetWorkflow, pollWorkflowJob } from "../api/design-assistant.api";

const props = defineProps<{ asset: LiveAsset; live?: boolean }>();

interface WorkflowStep { step: string; status: string; detail: string }
interface WorkflowResult {
  image_id?: string;
  width?: number;
  height?: number;
  subjects?: Array<{ subject?: string; category?: string; role?: string; bbox?: number[] }>;
  subjectCount?: number;
  maskHeatGrid?: number[];
  maskCoverage?: number;
  colorGrid?: Array<{ region: number; color: string; layer: string }> | null;
  colorGridCols?: number;
  colorGridRows?: number;
  texts?: Array<{ content?: string; conf?: number; bbox?: number[]; level?: string }>;
  analysis?: Record<string, any>;
}

const result = ref<WorkflowResult | null>(null);
const state = ref<"idle" | "analyzing">("idle");
const errorMessage = ref("");
const jobSteps = ref<WorkflowStep[]>([]);
const intentHint = ref("");

/** 后端步骤 → 进度百分比（驱动进度条）。 */
const STEP_PROGRESS: Record<string, number> = {
  "主体探查": 14,
  "SAM 分割": 30,
  "热区计算": 36,
  "色块探查": 36,
  "文字探查": 46,
  "语汇分析": 66,
  "代码回填": 88,
  "写入结果": 96
};

/** 后端步骤 → 给用户看的动作描述。 */
const ACTION_LABEL: Record<string, string> = {
  "主体探查": "裁切主体（视觉定位）",
  "SAM 分割": "裁切主体（像素分割）",
  "热区计算": "裁切主体（热区计算）",
  "色块探查": "裁切主体（色块取样）",
  "文字探查": "探查是否有文案",
  "语汇分析": "分析风格与构图",
  "代码回填": "判断基础意图",
  "写入结果": "整理分析结果"
};

/** 文案兜底：识别到文案 = 用户传的素材已被设计过。 */
const hasCopy = computed(() => (result.value?.texts?.length ?? 0) > 0);
const analysis = computed(() => result.value?.analysis ?? null);

/** 01 主图分析的物理层：故意不传 textGrid，热区图不渲染文案区。 */
const detection = computed<Record<string, any> | null>(() => {
  const r = result.value;
  if (!r || (!r.maskHeatGrid && !r.colorGrid)) return null;
  return {
    subjectCount: r.subjectCount ?? 0,
    heatGrid: r.maskHeatGrid ?? [],
    cols: 10,
    rows: 10,
    colorGrid: r.colorGrid ?? null
  };
});

/** 模型识别的基础意图（场景/目的）。 */
const modelIntent = computed(() => {
  const scene = analysis.value?.scene;
  return [scene?.intent, scene?.purpose].filter(Boolean).join(" · ") || "未识别";
});

/** 用户提示词优先级高于模型识别的场景/目的。 */
const effectiveIntent = computed(() => intentHint.value.trim() || modelIntent.value);

function reset(): void {
  stopElapsed();
  result.value = null;
  state.value = "idle";
  errorMessage.value = "";
  jobSteps.value = [];
  intentHint.value = "";
  elapsedMs.value = 0;
}

watch(() => props.asset.id, reset);

function presentError(error: unknown): void {
  errorMessage.value = error instanceof ApiClientError ? error.message : "识别请求失败，请稍后重试。";
}

/**
 * 前端自动计时：从点击开始实时增长，分析结束停在最终值。
 * （后端每步也带耗时 detail，暂不使用，保留在 job.steps 里备用。）
 */
const elapsedMs = ref(0);
let elapsedTimer = 0;

function startElapsed(): void {
  stopElapsed();
  const startedAt = Date.now();
  elapsedMs.value = 0;
  elapsedTimer = window.setInterval(() => {
    elapsedMs.value = Date.now() - startedAt;
  }, 100);
}

function stopElapsed(): void {
  window.clearInterval(elapsedTimer);
  elapsedTimer = 0;
}

const elapsedText = computed(() => `${(elapsedMs.value / 1000).toFixed(1)}s`);

/** 进度条百分比：完成后 100%，分析中按当前 running 步骤推导。 */
const progressPct = computed(() => {
  if (result.value) return 100;
  if (state.value !== "analyzing") return 0;
  const running = jobSteps.value.find((s) => s.status === "running");
  if (running) return STEP_PROGRESS[running.step] ?? 50;
  const doneSteps = jobSteps.value.filter((s) => s.status !== "running");
  const last = doneSteps[doneSteps.length - 1];
  return last ? STEP_PROGRESS[last.step] ?? 6 : 6;
});

/** 分析中正在做什么（裁切主体 / 分析风格 / 判断意图）。 */
const currentAction = computed(() => {
  if (state.value !== "analyzing") return "";
  const running = jobSteps.value.find((s) => s.status === "running");
  if (running) return ACTION_LABEL[running.step] ?? running.step;
  return "准备中…";
});

/** 进度条下方的一行状态：总体百分比 + 现在在做。 */
const statusText = computed(() => {
  if (state.value === "analyzing") return currentAction.value;
  if (result.value) return "素材分析完成";
  return "等待开始";
});

async function analyze(): Promise<void> {
  state.value = "analyzing";
  errorMessage.value = "";
  jobSteps.value = [];
  startElapsed();
  try {
    const { jobId } = await analyzeLiveAssetWorkflow(props.asset.id);
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const job = await pollWorkflowJob(jobId);
      jobSteps.value = job.steps ?? [];
      if (job.status === "done") {
        result.value = (job.result ?? null) as WorkflowResult | null;
        break;
      }
      if (job.status === "error") throw new Error(job.error || "识别失败");
    }
  } catch (error) {
    presentError(error);
  } finally {
    stopElapsed();
    state.value = "idle";
  }
}

onBeforeUnmount(() => stopElapsed());
</script>

<template>
  <section class="wf-panel" aria-label="素材识别工作流">
    <div class="wf-eyebrow">
      <span>02 · AI DESIGN</span>
    </div>

    <div v-if="errorMessage" class="wf-error">{{ errorMessage }}</div>

    <!-- 文案兜底：有文案 = 已设计过 -->
    <div v-if="hasCopy" class="copy-warn" role="status">
      <b>⚠ 您上传的素材已经设计过了</b>
      <span>检测到 {{ result?.texts?.length ?? 0 }} 段文案（如海报 / 网页成品）。建议换一张未设计的原版素材再分析。</span>
    </div>

    <!-- 进度条：素材分析 → RAG -->
    <div class="flow">
      <div class="flow-track">
        <div class="flow-fill" :class="{ 'is-done': !!result }" :style="{ width: `${progressPct}%` }" />
        <span class="flow-dot is-start" :class="{ 'is-done': !!result, 'is-active': state === 'analyzing' }" />
        <span class="flow-dot is-end" />
      </div>
      <div class="flow-labels">
        <span class="flow-label" :class="{ 'is-active': state === 'analyzing', 'is-done': !!result }">素材分析</span>
        <span class="flow-label is-locked">RAG · 待接入</span>
      </div>
    </div>

    <!-- 动态文字：总体进度百分比 + 现在在做 + 实时耗时 -->
    <div class="flow-status">
      <span class="flow-pct">{{ progressPct }}%</span>
      <span class="flow-sep">·</span>
      <span class="flow-doing">{{ statusText }}</span>
      <span v-if="state === 'analyzing' || result" class="flow-elapsed">{{ elapsedText }}</span>
    </div>

    <div class="wf-actions">
      <button class="wf-run" :disabled="state === 'analyzing'" @click="analyze">
        {{ state === "analyzing" ? "分析中…" : result ? "重新分析" : "开始素材分析" }}
      </button>
    </div>

    <!-- 01-03 输出合并展示：左栏热区+主体标签+注释，右栏风格，意图横跨底部 -->
    <div v-if="result" class="result-area">
      <div class="result-left">
        <VocabPanel
          :detection="detection"
          title="主图 · 主体热区"
          heat-size="100%"
          style="--heat-max: 100%"
        />
      </div>

      <div class="result-right">
        <VocabPanel v-if="analysis" :vocabulary="analysis" title="风格与构图" />
      </div>

      <div class="intent-block intent-full">
        <b>基础意图</b>
        <p class="intent-model">模型识别：{{ modelIntent }}</p>
        <label class="intent-field">
          <span>你的提示词（优先级高于模型识别）</span>
          <textarea
            v-model="intentHint"
            rows="2"
            maxlength="200"
            placeholder="例如：突出人物主体，做成夏日清爽风的主视觉…"
          />
        </label>
        <p class="intent-effective">
          当前生效意图：<em>{{ effectiveIntent }}</em>
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.wf-panel { display: flex; flex-direction: column; gap: 14px; }

.wf-eyebrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.wf-eyebrow span {
  color: #d9ff52;
  font: 600 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.14em;
}

.wf-error {
  padding: 10px 12px;
  border: 1px solid rgb(255 92 92 / 40%);
  border-radius: 10px;
  background: rgb(255 92 92 / 8%);
  color: #ffb4b4;
  font-size: 11px;
  line-height: 1.6;
}

.copy-warn {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid rgb(255 184 77 / 45%);
  border-radius: 12px;
  background: rgb(255 184 77 / 8%);
  color: #ffd9a8;
  font-size: 11px;
  line-height: 1.6;
}

.copy-warn b { color: #ffb84d; font-size: 12px; }

/* 进度条：素材分析 → RAG */
.flow { display: flex; flex-direction: column; gap: 8px; }

.flow-track {
  position: relative;
  height: 4px;
  margin: 0 5px;
  border-radius: 99px;
  background: #1d2229;
}

.flow-fill {
  height: 100%;
  border-radius: 99px;
  background: linear-gradient(90deg, #7fbf2f, #d9ff52);
  transition: width 320ms ease;
}

.flow-fill.is-done { background: #d9ff52; }

.flow-dot {
  position: absolute;
  top: 50%;
  width: 10px;
  height: 10px;
  border: 1px solid #39414b;
  border-radius: 50%;
  background: #0b0d10;
  transform: translate(-50%, -50%);
  transition: all 160ms ease;
}

.flow-dot.is-start { left: 0; }
.flow-dot.is-end { left: 100%; }
.flow-dot.is-active { border-color: #d9ff52; }
.flow-dot.is-done { border-color: #d9ff52; background: #d9ff52; }

.flow-labels { display: flex; justify-content: space-between; }

.flow-label {
  color: #8f969f;
  font: 500 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  transition: color 160ms ease;
}

.flow-label.is-active { color: #d9ff52; }
.flow-label.is-done { color: #c8d0d8; }
.flow-label.is-locked { color: #5c6670; }

.wf-actions { display: flex; align-items: center; gap: 10px; }

.wf-run {
  padding: 8px 16px;
  border: 1px solid transparent;
  border-radius: 99px;
  background: #d9ff52;
  color: #11140c;
  font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  cursor: pointer;
  transition: background 140ms ease;
}

.wf-run:not(:disabled):hover { background: #e4ff7c; }
.wf-run:disabled { background: #39414b; color: #5c6670; cursor: not-allowed; }

/* 动态状态：总体百分比 + 现在在做 */
.flow-status {
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: #8f969f;
  font-size: 10px;
}

.flow-pct {
  color: #d9ff52;
  font: 600 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
}

.flow-sep { color: #39414b; }
.flow-doing { color: #c8d0d8; }

.flow-elapsed {
  margin-left: auto;
  color: #8f969f;
  font: 500 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
}


/* 结果区：左栏热区，右栏风格，意图横跨底部 */
.result-area {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
  gap: 14px 20px;
  padding: 14px;
  border: 1px solid #2a3037;
  border-radius: 13px;
  background: #101216;
}

.result-left {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.result-right { min-width: 0; }

/* 意图块横跨两栏，文本域需要完整宽度 */
.intent-full { grid-column: 1 / -1; }

@media (max-width: 1280px) {
  .result-area { grid-template-columns: minmax(0, 1fr); }
}

.intent-block { display: flex; flex-direction: column; gap: 10px; }
.intent-block > b { color: #d9ff52; font-size: 11px; }
.intent-model { margin: 0; color: #9fa8b2; font-size: 11px; }

.intent-field { display: flex; flex-direction: column; gap: 6px; }
.intent-field span { color: #8f969f; font-size: 10px; }
.intent-field textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #2f353d;
  border-radius: 10px;
  background: #0b0d10;
  color: #e9edf0;
  font-size: 11px;
  line-height: 1.6;
  resize: vertical;
}

.intent-field textarea:focus { border-color: #d9ff52; outline: none; }

.intent-effective { margin: 0; color: #9fa8b2; font-size: 11px; }
.intent-effective em { color: #d9ff52; font-style: normal; }

.rag-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  border: 1px dashed #1d2229;
  border-radius: 10px;
  color: #6f7883;
  font: 500 11px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
