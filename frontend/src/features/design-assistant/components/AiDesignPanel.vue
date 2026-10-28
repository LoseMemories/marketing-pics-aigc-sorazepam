<script setup lang="ts">
import { computed, h, ref, watch, type Component } from "vue";
import { Tooltip } from "ant-design-vue";
import { BulbOutlined, InfoCircleOutlined, ThunderboltOutlined } from "@ant-design/icons-vue";
import type { LiveAsset } from "@/entities/live-asset/model/live-asset.types";
import { ApiClientError } from "@/shared/api/http-client";
import { analyzeLiveAssetScene, composeDesign, designLayout, planLayout, readCopySource, readDesign } from "../api/design-assistant.api";
import type {
  AnchorSpan,
  CompositionSpec,
  DesignIssue,
  DesignSpec,
  LayoutPlan,
  SceneAnalysis
} from "../model/design-assistant.types";

const props = defineProps<{ asset: LiveAsset; live?: boolean }>();
const emit = defineEmits<{
  composed: [composition: CompositionSpec];
  analyzed: [analysis: SceneAnalysis];
  /** 当前查看的阶段，页用它决定是否在原图上高亮主体 */
  "update:stage": [stage: number];
  /** 当前选中的主体标签，页只给这些主体做闪烁高亮 */
  "update:selection": [labels: string[]];
}>();
/** 实况关闭后按静态图逻辑处理：不生成时间线，只生成静态画面。 */
const liveMode = computed(() => props.live !== false);

/** 隐私与模式说明收进悬浮提示，卡片本身只保留核心信息。 */
const hintText = computed(
  () =>
    `仅将后端生成的预览 JPEG 发送给 DeepSeek Flash，原始实况文件与视频轨不会上传。当前为${
      liveMode.value ? "实况模式：使用视频轨与动画时间线" : "静态模式：仅使用主图，不生成动画"
    }。分析结果会按图片缓存，「重新分析」才会重新调用模型。`
);

const backgroundLabel = computed(() => {
  const complexity = analysis.value?.background?.complexity;
  return complexity ? { clean: "干净", moderate: "适中", busy: "杂乱" }[complexity] : "";
});

const analysis = ref<SceneAnalysis>();
const brief = ref("突出人物主体，加入简洁的品牌标题和呼吸光点");
const state = ref<"idle" | "analyzing" | "composing" | "designing">("idle");
const errorMessage = ref("");
/** L1 构图决策结果 */
const plan = ref<LayoutPlan>();
/** L2 设计语汇（可手改，改完即时重算 L3） */
const design = ref<DesignSpec>();
const designIssues = ref<DesignIssue[]>([]);
const copySource = ref("");
/** 本轮设计选中的主体标签，未选择时使用全部识别结果。 */
const selectedSubjects = ref<Set<string>>(new Set());

/** 标签以 subjectRegions 为准，避免 subjects 与区域 label 不一致时选不中。 */
const subjectLabels = computed(() =>
  (analysis.value?.subjectRegions ?? []).map((region) => region.label)
);

/** 主体评分：低于 60 分默认不选（识别得很准的陪体不该抢主体位置）。 */
const SUBJECT_SCORE_THRESHOLD = 60;

const subjectScores = computed(() => {
  const map = new Map<string, number>();
  for (const region of analysis.value?.subjectRegions ?? []) {
    map.set(region.label, Math.round(region.score ?? 100));
  }
  return map;
});

function subjectScore(label: string): number {
  return subjectScores.value.get(label) ?? 100;
}

/** 改动过的文案/参数：只标记，不自动重算预览。 */
const designDirty = ref(false);

function markDirty(): void {
  designDirty.value = true;
}

/** 选中的主体标签列表（每次选择都换成新数组，方便页侧 watch）。 */
const selectedSubjectList = computed(() => [...selectedSubjects.value]);

watch(selectedSubjectList, (labels) => emit("update:selection", labels), { immediate: true });

const scaleLabel = computed(() => {
  const current = plan.value;
  if (!current) return "";
  if (current.subjectCount === 0) return "未约束主体";
  return { small: "小面积主体", medium: "中等面积主体", large: "大面积主体" }[current.scale];
});

const sourceLabel: Record<string, string> = {
  subject: "主体色",
  image: "画面主色",
  derived: "画面同色系",
  universal: "通用安全色"
};

const anchorLabel = computed(() => plan.value?.textAnchor.label ?? "");

const secondaryLabel = computed(() => plan.value?.secondaryAnchor?.label ?? "");

/** 决策格矩阵：按网格行列排好，方便直接渲染。 */
const heatCells = computed(() => {
  const current = plan.value;
  if (!current) return [];
  const cells: Array<{ key: string; heat: number; score: number }> = [];
  for (let row = 0; row < current.grid.rows; row += 1) {
    for (let col = 0; col < current.grid.cols; col += 1) {
      const cell = current.candidates.find((entry) => entry.col === col && entry.row === row);
      cells.push({ key: `${row}-${col}`, heat: cell?.heat ?? 0, score: cell?.score ?? -99 });
    }
  }
  return cells;
});

const gridStyle = computed(() => {
  const grid = plan.value?.grid ?? { cols: 3, rows: 3 };
  return {
    gridTemplateColumns: `repeat(${grid.cols}, 1fr)`,
    gridTemplateRows: `repeat(${grid.rows}, 1fr)`,
    aspectRatio: `${grid.cols} / ${grid.rows}`
  };
});

/** 把一个承载区换算成覆盖在网格上的矩形（百分比定位）。 */
function spanStyle(span: AnchorSpan): Record<string, string> {
  const grid = plan.value?.grid ?? { cols: 3, rows: 3 };
  const width = (span.colEnd - span.colStart + 1) / grid.cols;
  const height = (span.rowEnd - span.rowStart + 1) / grid.rows;
  return {
    left: `calc(${((span.colStart / grid.cols) * 100).toFixed(2)}% + 2px)`,
    top: `calc(${((span.rowStart / grid.rows) * 100).toFixed(2)}% + 2px)`,
    width: `calc(${(width * 100).toFixed(2)}% - 4px)`,
    height: `calc(${(height * 100).toFixed(2)}% - 4px)`
  };
}

/** 步骤定义：每个阶段自己的执行按钮文案（首次执行 / 重跑）。 */
const ROLE_LABELS: Record<string, string> = {
  headline: "Hero 标题",
  subline: "副标题",
  paragraph: "段落",
  meta: "信息行",
  kicker: "眉标"
};

/** 与后端 motion-catalog 的 text-enter 枚举保持一致。 */
const enterIds = [
  "fade",
  "fade-in-place",
  "slide-up",
  "slide-left",
  "slide-right",
  "mask-reveal",
  "rise",
  "stand-up-3d",
  "through"
];

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

const EFFECT_LABELS: Record<string, string> = {
  "breathing-dot": "呼吸圆点",
  "subject-outline": "主体描边",
  "icon-marker": "贴图图标",
  "laser-overlay": "镭射滤镜",
  "glow-mask": "光斑蒙层",
  "soft-focus": "柔光滤镜",
  strobe: "频闪",
  sweep: "光带扫过",
  drift: "粒子漂移"
};

const PATTERN_LABELS: Record<string, string> = {
  dapple: "树叶碎光",
  bokeh: "散景光斑",
  beam: "斜射光束"
};

/** 动效清单的一行说明：名称 + 样式/模式 + 关键参数。 */
function effectLabel(effect: { id: string; options: Record<string, string>; params: Record<string, number> }): string {
  const name = EFFECT_LABELS[effect.id] ?? effect.id;
  const style = effect.options.style ? ` ${effect.options.style.replace("spray-", "")}` : "";
  const mode = effect.options.mode ? `/${effect.options.mode}` : "";
  const glyph = effect.options.glyph ? ` ${effect.options.glyph}` : "";
  const pattern = effect.options.pattern ? ` ${PATTERN_LABELS[effect.options.pattern] ?? effect.options.pattern}` : "";
  return `${name}${style}${mode}${glyph}${pattern}`;
}

/** 可选锚点：来自 L1 的两个承载区 + 分析给出的安全区。 */
const anchorOptions = computed(() => {
  const options = [{ value: "textAnchor", label: "主文字区" }];
  if (plan.value?.secondaryAnchor) options.push({ value: "secondaryAnchor", label: "收尾小字区" });
  (analysis.value?.safeZones ?? []).forEach((_, index) => {
    options.push({ value: `safeZone:${index}`, label: `安全区 ${index + 1}` });
  });
  options.push({ value: "free", label: "自由放置" });
  return options;
});

const stageDefs = [
  { title: "画面理解", runLabel: "主图分析", rerunLabel: "重新分析" },
  { title: "L1 构图", runLabel: "生成方案 · L1 构图", rerunLabel: "重新构图" },
  { title: "L2 设计师", runLabel: "开始设计", rerunLabel: "重新设计" },
  { title: "L3 Canvas", runLabel: "开始绘制", rerunLabel: "重新绘制" }
] as const;

type StageState = "pending" | "running" | "done";

/** 正在执行的步骤：分析=0，构图=1，设计=2。 */
const runningStage = computed<number | null>(() => {
  if (state.value === "analyzing") return 0;
  if (state.value === "composing") return 1;
  if (state.value === "designing") return 2;
  return null;
});

/** 每个步骤自己的运行态：有结果＝已完成，执行中的优先，其余未激活。 */
const stageStates = computed<StageState[]>(() => {
  const states: StageState[] = ["pending", "pending", "pending", "pending"];
  if (analysis.value) states[0] = "done";
  if (plan.value) states[1] = "done";
  if (design.value) states[2] = "done";
  const running = runningStage.value;
  if (running !== null) {
    states[running] = "running";
    // 执行某一步时，它后面的步骤全部打回未激活
    for (let index = running + 1; index < states.length; index += 1) states[index] = "pending";
  }
  return states;
});

/** 进度：执行中的步骤就是进度所在；空闲时停在最后一个已完成的步骤。 */
const progressStage = computed(() => {
  const running = runningStage.value;
  if (running !== null) return running;
  return stageStates.value.reduce((last, item, index) => (item === "done" ? index : last), 0);
});

/** 当前展示的步骤：点圆圈可以回看已完成 / 执行中的步骤。 */
const viewStage = ref(0);

watch(progressStage, (stage) => {
  viewStage.value = stage;
});

watch(viewStage, (stage) => emit("update:stage", stage));

function stageDescription(index: number, stageState: StageState): string {
  if (stageState === "running") {
    return index === 0 ? "分析中…" : index === 2 ? "设计中…" : "生成中…";
  }
  if (index === 0) return analysis.value ? "已完成" : "待分析";
  if (index === 1) return plan.value ? "已完成" : analysis.value ? "待生成" : "待分析";
  if (index === 2) return design.value ? "可编辑" : plan.value ? "待设计" : "待构图";
  return "待接入";
}

/**
 * 步骤圆圈：未激活不可点；已完成与执行中的步骤可以跳过去看。
 * 已完成用 ant 的 finish 状态才能拿到绿圈，但它会把数字换成对勾，所以自己传数字图标。
 */
const stageItems = computed(() =>
  stageDefs.map((stage, index) => {
    const stageState = stageStates.value[index] ?? "pending";
    const isProgress = index === progressStage.value;
    // 还没有结果的那一步（含正在执行）用实心绿，已完成用绿圈
    const status: "process" | "finish" | "wait" =
      stageState === "running" || (isProgress && stageState === "pending")
        ? "process"
        : stageState === "done"
          ? "finish"
          : "wait";
    return {
      title: stage.title,
      description: stageDescription(index, stageState),
      disabled: index > progressStage.value,
      status,
      ...(status === "finish"
        ? { icon: h("span", { class: "stage-num" }, String(index + 1)) }
        : {})
    };
  })
);

/** 点步骤圆圈：只允许跳到已完成或执行中的步骤。 */
function goToStage(index: number): void {
  if (index > progressStage.value) return;
  viewStage.value = index;
}

interface StageAction {
  label: string;
  icon?: Component;
  loading: boolean;
  disabled: boolean;
  run: (() => void) | null;
}

/** 步骤条下方左侧：当前查看的这一步自己的执行按钮。 */
const runAction = computed<StageAction>(() => {
  const index = viewStage.value;
  if (index === 0) {
    return {
      label: analysis.value ? stageDefs[0].rerunLabel : stageDefs[0].runLabel,
      icon: BulbOutlined,
      loading: state.value === "analyzing",
      disabled: false,
      run: () => void analyze()
    };
  }
  if (index === 1) {
    return {
      label: plan.value ? stageDefs[1].rerunLabel : stageDefs[1].runLabel,
      icon: ThunderboltOutlined,
      loading: state.value === "composing",
      disabled: !analysis.value,
      run: () => void compose()
    };
  }
  if (index === 2) {
    return {
      label: design.value ? stageDefs[2].rerunLabel : stageDefs[2].runLabel,
      icon: ThunderboltOutlined,
      loading: state.value === "designing",
      disabled: !plan.value,
      run: () => void runDesign()
    };
  }
  // L3 在 L2 里即时生效，这一步的面板待接入
  return {
    label: stageDefs[index]?.rerunLabel ?? "",
    loading: false,
    disabled: true,
    run: null
  };
});

/** 步骤条下方右侧：跳到下一步；下一步还没结果时就直接把它跑出来。 */
const nextAction = computed<StageAction | null>(() => {
  const index = viewStage.value + 1;
  const def = stageDefs[index];
  if (!def) return null;
  if (index === 1) {
    const l1Done = stageStates.value[1] === "done";
    return {
      label: `下一步 · ${def.title}`,
      loading: state.value === "composing",
      disabled: !analysis.value,
      run: l1Done ? () => goToStage(1) : () => void compose()
    };
  }
  if (index === 2) {
    const l2Done = stageStates.value[2] === "done";
    return {
      label: `下一步 · ${def.title}`,
      loading: state.value === "designing",
      disabled: !plan.value,
      run: l2Done ? () => goToStage(2) : () => void runDesign()
    };
  }
  // L3 还没接入：L2 完成后可以走进去看占位页，但不能再往下推
  const currentDone = stageStates.value[viewStage.value] === "done";
  return {
    label: `下一步 · ${def.title}`,
    loading: false,
    disabled: !currentDone,
    run: () => {
      viewStage.value = index;
    }
  };
});

/** 把当前设计交给 L3 解算并推给画布（不调模型，快）。 */
async function applyDesign(): Promise<void> {
  const current = design.value;
  if (!current) return;
  state.value = "composing";
  try {
    const result = await composeDesign(props.asset.id, current, [...selectedSubjects.value]);
    design.value = result.design;
    designIssues.value = [];
    designDirty.value = false;
    emit("composed", result.composition);
  } catch (error) {
    presentError(error);
  } finally {
    state.value = "idle";
  }
}

/** L2 里的「重新渲染」：只有点这个才把改动推给预览。 */
async function rerender(): Promise<void> {
  await applyDesign();
}

/** L2：调模型产出设计语汇。 */
async function runDesign(): Promise<void> {
  if (!plan.value) return;
  state.value = "designing";
  errorMessage.value = "";
  try {
    const result = await designLayout(props.asset.id, brief.value, [...selectedSubjects.value]);
    design.value = result.design;
    designIssues.value = result.issues;
    copySource.value = (await readCopySourceText()).text;
    await applyDesign();
  } catch (error) {
    presentError(error);
  } finally {
    state.value = "idle";
  }
}

async function readCopySourceText(): Promise<{ text: string }> {
  try {
    return await readCopySource(props.asset.id);
  } catch {
    return { text: "" };
  }
}

/** 进入 L2 时把已保存（可能被人手改过）的设计载回来。 */
async function ensureDesignLoaded(): Promise<void> {
  if (design.value || !plan.value || state.value === "designing") return;
  try {
    const stored = await readDesign(props.asset.id);
    if (!stored.design) return;
    design.value = stored.design;
    copySource.value = (await readCopySourceText()).text;
    await applyDesign();
  } catch (error) {
    presentError(error);
  }
}

watch(viewStage, (stage) => {
  if (stage === 2) void ensureDesignLoaded();
});

/** 热区浓度 0–1 → 背景透明度 + 可读的文字颜色。 */
function heatStyle(heat: number): Record<string, string> {
  const alpha = Math.min(0.92, 0.04 + heat * 1.15);
  return {
    background: `rgba(217, 255, 82, ${alpha.toFixed(3)})`,
    color: alpha > 0.42 ? "#12160f" : "#8f97a1"
  };
}

watch(() => props.asset.id, () => {
  analysis.value = undefined;
  errorMessage.value = "";
  plan.value = undefined;
  design.value = undefined;
  designIssues.value = [];
  copySource.value = "";
  selectedSubjects.value = new Set();
  viewStage.value = 0;
});

function toggleSubject(subject: string): void {
  const next = new Set(selectedSubjects.value);
  if (next.has(subject)) next.delete(subject);
  else next.add(subject);
  selectedSubjects.value = next;
}

function clearSubjects(): void {
  selectedSubjects.value = new Set();
}

function presentError(error: unknown): void {
  errorMessage.value = error instanceof ApiClientError ? error.message : "AI 设计请求失败，请稍后重试。";
}

async function analyze(): Promise<void> {
  // 重新分析会把 L1 及之后的结果一并作废，进度打回画面理解
  plan.value = undefined;
  design.value = undefined;
  state.value = "analyzing";
  errorMessage.value = "";
  try {
    analysis.value = await analyzeLiveAssetScene(props.asset.id, {
      // 已有结果时点「重新分析」才强制重算，否则直接命中后端缓存。
      refresh: Boolean(analysis.value)
    });
    // 默认只选评分 > 60 的主体，其余当作背景
    selectedSubjects.value = new Set(
      analysis.value.subjectRegions
        .filter((region) => Math.round(region.score ?? 100) > SUBJECT_SCORE_THRESHOLD)
        .map((region) => region.label)
    );
    emit("analyzed", analysis.value);
  } catch (error) {
    presentError(error);
  } finally {
    state.value = "idle";
  }
}

async function compose(): Promise<void> {
  if (!analysis.value) return;
  state.value = "composing";
  errorMessage.value = "";
  try {
    // 当前只跑 L1：不调用大模型，先核对构图决策。
    plan.value = await planLayout(props.asset.id, [...selectedSubjects.value]);
  } catch (error) {
    presentError(error);
  } finally {
    state.value = "idle";
  }
}
</script>

<template>
  <section class="ai-panel" aria-label="画面理解与动效编排">
    <div class="ai-heading">
      <div class="ai-eyebrow">
        <span>02 · AI DESIGN</span>
        <Tooltip placement="top" :title="hintText">
          <InfoCircleOutlined class="ai-info" />
        </Tooltip>
      </div>
    </div>

    <a-alert v-if="errorMessage" :message="errorMessage" type="error" show-icon />

    <!--
      current 传 -1：ant 在 index === current 时不会派发 change，
      那样「执行中/已完成」的那一步就点不动了。样式全部由每项的 status 决定。
    -->
    <a-steps
      class="stage-steps"
      size="small"
      :current="-1"
      :items="stageItems"
      @change="goToStage"
    />

    <!-- 按钮统一放在步骤条下方：本步自己的执行按钮 + 跳转下一步 -->
    <div class="stage-actions">
      <a-button
        class="stage-btn stage-btn--run"
        type="primary"
        :loading="runAction.loading"
        :disabled="runAction.disabled"
        @click="runAction.run?.()"
      >
        <template v-if="runAction.icon" #icon><component :is="runAction.icon" /></template>
        {{ runAction.label }}
      </a-button>
      <!-- L2：改动不自动上屏，点这个才重算预览 -->
      <a-button
        v-if="viewStage === 2 && design"
        class="stage-btn stage-btn--render"
        :class="{ 'is-dirty': designDirty }"
        :loading="state === 'composing'"
        @click="rerender()"
      >
        {{ designDirty ? "重新渲染（有改动）" : "重新渲染" }}
      </a-button>
      <a-button
        v-if="nextAction"
        class="stage-btn stage-btn--next"
        :loading="nextAction.loading"
        :disabled="nextAction.disabled"
        @click="nextAction.run?.()"
      >
        {{ nextAction.label }}
      </a-button>
    </div>

    <template v-if="analysis && viewStage === 0">
      <div class="analysis-card">
        <p>{{ analysis.summary }}</p>
        <p class="coordinate-summary">
          已定位 {{ analysis.subjectRegions.length }} 个主体区域 · {{ analysis.safeZones.length }} 个文字安全区
          <template v-if="backgroundLabel"> · 背景{{ backgroundLabel }}</template>
        </p>
        <div class="tag-block">
          <div class="tag-head">
            <span>主体标签 · 点击选择参与设计</span>
            <button v-if="selectedSubjects.size > 0" type="button" class="clear-btn" @click="clearSubjects">
              清空
            </button>
          </div>
          <div class="tag-row" role="group" aria-label="选择参与设计的主体">
            <button
              v-for="subject in subjectLabels"
              :key="subject"
              type="button"
              class="subject-tag"
              :class="{ 'is-selected': selectedSubjects.has(subject) }"
              :aria-pressed="selectedSubjects.has(subject)"
              @click="toggleSubject(subject)"
            >
              <span class="subject-name">{{ subject }}</span>
              <span class="subject-score" :class="{ 'is-low': subjectScore(subject) <= SUBJECT_SCORE_THRESHOLD }">
                {{ subjectScore(subject) }}
              </span>
            </button>
          </div>
          <p class="tag-hint">
            <template v-if="selectedSubjects.size > 0">已选 {{ selectedSubjects.size }} / {{ subjectLabels.length }} 个主体，其余主体将视为背景。</template>
            <template v-else>已全部取消：不约束主体，按全画面自由排版。</template>
            <br />
            分数是模型给的主体价值分，{{ SUBJECT_SCORE_THRESHOLD }} 分以下默认不选。
          </p>
        </div>

        <div class="tag-row tone-row">
          <a-tag v-for="tone in analysis.marketingTone" :key="tone" color="lime">{{ tone }}</a-tag>
        </div>
        <div class="palette" aria-label="画面主色">
          <i v-for="color in analysis.dominantColors" :key="color" :style="{ background: color }" :title="color" />
        </div>
      </div>

    </template>

    <template v-if="plan && viewStage === 1">
      <div class="stage-block">
        <div class="stage-head">
          <span class="stage-tag">L1 · 构图决策</span>
          <span class="stage-scale">{{ scaleLabel }}</span>
        </div>
        <dl class="plan-facts">
          <div><dt>主体占比</dt><dd>{{ (plan.areaRatio * 100).toFixed(1) }}%</dd></div>
          <div><dt>重心</dt><dd>{{ plan.subjectCount === 0 ? "—" : plan.dominantRegion }}</dd></div>
          <div><dt>主文字区</dt><dd>{{ anchorLabel }}</dd></div>
          <div><dt>收尾小字</dt><dd>{{ secondaryLabel || "—" }}</dd></div>
          <div><dt>策略</dt><dd>{{ plan.strategy }}</dd></div>
          <div><dt>标题字号</dt><dd>{{ plan.headlineSizeRange[0] }}–{{ plan.headlineSizeRange[1] }}</dd></div>
        </dl>

        <div class="heat-block">
          <div class="heat-head">
            <span>主体热区 · {{ plan.grid.cols }}×{{ plan.grid.rows }} 网格</span>
            <span class="heat-legend">亮＝主体覆盖多</span>
          </div>

          <div class="heat-panels">
            <div class="heat-grid" :style="gridStyle">
              <div
                v-for="cell in heatCells"
                :key="cell.key"
                class="heat-cell"
                :style="heatStyle(cell.heat)"
                :title="`热区 ${(cell.heat * 100).toFixed(0)}% · 得分 ${cell.score.toFixed(2)}`"
              >
                <span class="heat-value">{{ (cell.heat * 100).toFixed(0) }}</span>
              </div>
              <span class="heat-span is-primary" :style="spanStyle(plan.textAnchor)">
                <em>主</em>{{ plan.textAnchor.cells > 1 ? plan.textAnchor.cells : "" }}
              </span>
              <span
                v-if="plan.secondaryAnchor"
                class="heat-span is-secondary"
                :style="spanStyle(plan.secondaryAnchor)"
              >
                <em>次</em>{{ plan.secondaryAnchor.cells > 1 ? plan.secondaryAnchor.cells : "" }}
              </span>
            </div>

            <div class="heat-side">
              <dl class="side-facts">
                <div><dt>画幅</dt><dd>{{ plan.frameRatio }}</dd></div>
                <div><dt>峰值</dt><dd>{{ (plan.peakHeat * 100).toFixed(0) }}%</dd></div>
                <div><dt>合并阈值</dt><dd>{{ (plan.mergeThreshold * 100).toFixed(1) }}%</dd></div>
                <div>
                  <dt>可用纵向</dt>
                  <dd>{{ plan.freeColumn.fromY }}–{{ plan.freeColumn.toY }}（{{ (plan.freeColumn.freeRatio * 100).toFixed(0) }}%）</dd>
                </div>
              </dl>

              <div class="palette-block">
                <div class="side-title">
                  <span>配色初始方案</span>
                  <em>基调取自画面 · 由 L2 决定</em>
                </div>
                <div class="palette-list">
                  <div class="palette-row">
                    <i :style="{ background: plan.palette.suggested.headline }" />
                    <span>正文</span>
                    <em>{{ plan.palette.textContrast }}:1</em>
                  </div>
                  <div class="palette-row">
                    <i :style="{ background: plan.palette.suggested.support }" />
                    <span>描边</span>
                    <em>{{ plan.palette.suggested.support }}</em>
                  </div>
                  <div class="palette-row">
                    <i :style="{ background: plan.palette.backdrop }" />
                    <span>承载区</span>
                    <em>{{ plan.palette.backdrop }}</em>
                  </div>
                </div>
                <div class="option-row">
                  <span
                    v-for="option in plan.palette.options"
                    :key="option.hex"
                    class="option-chip"
                    :class="{ 'is-suggested': option.hex === plan.palette.suggested.accent }"
                    :title="`${option.name} ${option.hex} · ${sourceLabel[option.source]} · ${option.note}`"
                  >
                    <span class="option-dot" :style="{ background: option.hex }" />
                    {{ option.name }}<em>{{ option.contrast.toFixed(1) }}</em>
                  </span>
                </div>
                <p class="side-note">
                  基调 {{ plan.palette.base.join(" ") || "—" }} · 光点 → {{ plan.palette.effectAnchors.join(" / ") || "低热区" }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="safe-zone-block">
          <div class="heat-head">
            <span>分析给出的文字安全区</span>
            <span class="heat-legend">与热区一并交给 L2</span>
          </div>
          <ol class="safe-zone-list">
            <li v-for="zone in plan.safeZones" :key="`${zone.x}-${zone.y}`">
              <span class="zone-bar">
                <i v-for="color in zone.colors ?? []" :key="color" :style="{ background: color }" />
              </span>
              <span class="zone-reason">{{ zone.reason }}</span>
              <em>{{ (zone.width * zone.height * 100).toFixed(1) }}%</em>
            </li>
          </ol>
        </div>

        <p class="plan-rationale">{{ plan.rationale }}</p>

        <details class="brief-fold">
          <summary>查看完整设计简报（给 L2 的输入）</summary>
          <pre class="plan-brief">{{ plan.designerBrief }}</pre>
        </details>
      </div>
    </template>

    <template v-if="design && viewStage === 2">
      <div class="stage-block">
        <div class="stage-head">
          <span class="stage-tag">L2 · 设计师</span>
          <span class="stage-scale">{{ design.concept }}</span>
        </div>

        <div class="design-list">
          <div v-for="block in design.blocks" :key="block.id" class="design-item">
            <div class="design-item-head">
              <span class="role-chip" :data-role="block.role">{{ roleLabel(block.role) }}</span>
              <textarea
                v-if="block.role === 'subline' || block.role === 'paragraph'"
                v-model="block.text"
                class="design-text design-text--area"
                rows="2"
                maxlength="60"
                placeholder="文案"
                @input="markDirty"
              />
              <input
                v-else
                v-model="block.text"
                class="design-text"
                maxlength="40"
                placeholder="文案"
                @input="markDirty"
              />
            </div>
            <div class="design-grid">
              <label class="design-field">
                <span>锚点</span>
                <select v-model="block.anchor.ref" @change="markDirty">
                  <option v-for="option in anchorOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </label>
              <label class="design-field">
                <span>水平偏移</span>
                <input v-model.number="block.anchor.dxPct" type="number" min="-8" max="8" step="0.5" @input="markDirty" />
              </label>
              <label class="design-field">
                <span>垂直偏移</span>
                <input v-model.number="block.anchor.dyPct" type="number" min="-8" max="8" step="0.5" @input="markDirty" />
              </label>
              <label class="design-field">
                <span>对齐</span>
                <select v-model="block.align" @change="markDirty">
                  <option value="left">左</option>
                  <option value="center">中</option>
                  <option value="right">右</option>
                </select>
              </label>
              <label class="design-field design-field--wide">
                <span>字号 {{ (block.sizeRatio * 100).toFixed(1) }}% · 字重 {{ block.weight }}</span>
                <input v-model.number="block.sizeRatio" type="range" min="0.02" max="0.18" step="0.005" @input="markDirty" />
              </label>
              <label class="design-field">
                <span>入场动效</span>
                <select v-model="block.enter.id" @change="markDirty">
                  <option v-for="id in enterIds" :key="id" :value="id">{{ id }}</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        <p v-if="designIssues.length > 0" class="design-issues">
          代码修正了 {{ designIssues.length }} 处：{{ designIssues.slice(0, 3).map((issue) => issue.message).join("；") }}
        </p>
        <p class="design-effects">
          动效：{{ design.effects.length > 0 ? design.effects.map((effect) => effectLabel(effect)).join(" · ") : "未加特效" }}
        </p>
        <p class="tag-hint">
          改动先存在本地，点「重新渲染」才更新预览并保存（不调模型）。换文案或换风格请点「重新设计」。
          <template v-if="copySource">文案源：{{ copySource.slice(0, 40) }}…</template>
          <template v-else>未找到同名 md 文案源，模型仅凭创作方向写文案。</template>
        </p>
      </div>
    </template>

    <div v-if="viewStage >= 3" class="stage-placeholder">
      <span>{{ stageDefs[viewStage]?.title ?? "" }} · 由 L2 即时解算，画面已在左侧预览</span>
      <a-button size="small" disabled>{{ stageDefs[viewStage]?.rerunLabel ?? "" }}</a-button>
    </div>
  </section>
</template>

<style scoped>
.ai-panel { display: flex; flex-direction: column; gap: 14px; }

/* 横向步骤条：四个阶段不会把页面拉高；不套容器，直接作为模块内的分区 */
.stage-steps { background: none; }
.stage-steps :deep(.ant-steps-item-title) { font-size: 11px; }
.stage-steps :deep(.ant-steps-item-description) { font-size: 9px; }
.stage-steps :deep(.ant-steps-item-title),
.stage-steps :deep(.ant-steps-item-description) { color: #aeb6bf !important; }
.stage-steps :deep(.ant-steps-item-process .ant-steps-item-title) { color: #d9ff52 !important; }

/*
 * ant 会给「已完成」步骤的标题补一条 colorPrimary(#1677ff) 的 2px 下划线，
 * 那条才是之前看到的蓝线（不在 tail 上）。连线由我们自己画，这里直接去掉。
 */
.stage-steps :deep(.ant-steps-item-title::after) { display: none !important; }

/* 只允许点已走过的步骤回退；当前与未到达的步骤不可点 */
.stage-steps { pointer-events: none; user-select: none; }
.stage-steps :deep(.ant-steps-item-container) { cursor: default; }
.stage-steps :deep(.ant-steps-item:not(.ant-steps-item-disabled) .ant-steps-item-container) {
  pointer-events: auto;
  cursor: pointer;
}
.stage-steps :deep(.ant-steps-item:not(.ant-steps-item-disabled):hover .ant-steps-item-title) {
  color: #e6eaef !important;
}
.stage-steps :deep(.ant-steps-item) { position: relative; }

/*
 * 连线：ant 在小尺寸横向步骤里会把 tail 隐藏，我们把它重新显示并手动定位到
 * 圆圈高度上、贴着本项右侧空白处，画成一段主题绿短线（不能拉通铺，会压住文字）。
 */
.stage-steps :deep(.ant-steps-item-tail) {
  display: block !important;
  position: absolute !important;
  top: 9px !important;
  inset-inline-start: auto !important;
  left: 52% !important;
  right: -6px !important;
  width: auto !important;
  height: 2px !important;
  padding: 0 !important;
}

.stage-steps :deep(.ant-steps-item:last-child .ant-steps-item-tail) { display: none !important; }

.stage-steps :deep(.ant-steps-item-tail::after) {
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  border-radius: 1px !important;
  background: rgb(217 255 82 / 45%) !important;
}

/* 圆圈：未激活＝白边框 + 黑底 + 白字；已完成＝绿圈 + 黑底 + 白字；执行中＝#d9ff52 实心 + 黑字 */
.stage-steps :deep(.ant-steps-item-icon) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px !important;
  height: 20px !important;
  margin-inline-end: 6px;
  border: 1px solid #ffffff !important;
  border-radius: 50% !important;
  background: #0b0d10 !important;
}

/* 数字在圈内垂直居中：ant 的 .ant-steps-icon 带行高，会整体偏下 */
.stage-steps :deep(.ant-steps-item-icon .ant-steps-icon) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #ffffff !important;
  font-size: 11px;
  line-height: 1;
}

/* 已完成：绿圈保留数字（自定义图标，避开 ant 的对勾） */
.stage-steps :deep(.ant-steps-item-finish .ant-steps-item-icon) {
  border-color: #d9ff52 !important;
  background: #0b0d10 !important;
}

.stage-steps :deep(.stage-num) {
  display: block;
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

.stage-steps :deep(.ant-steps-item-finish .ant-steps-item-tail::after) {
  background: #d9ff52 !important;
}

.stage-steps :deep(.ant-steps-item-process .ant-steps-item-icon) {
  border-color: #d9ff52 !important;
  background: #d9ff52 !important;
}

.stage-steps :deep(.ant-steps-item-process .ant-steps-item-icon .ant-steps-icon) {
  color: #12160f !important;
  font-weight: 700;
}

/* 按钮区：紧跟在步骤条下方，左侧本步执行、右侧跳下一步 */
.stage-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.stage-actions :deep(.ant-btn) { font-size: 11px; }

/*
 * 步骤按钮专用样式类（.stage-btn）：
 *   未激活（disabled）＝ 暗描边 + 灰字，绝不能留 ant 默认的黑字
 *   激活的跳步按钮（--next）＝ 黑底白字
 *   激活的执行按钮（--run）＝ 亮绿底黑字
 */
.stage-btn.ant-btn {
  border-color: #39414b !important;
  background: #0b0d10 !important;
  color: #e9edf0 !important;
  font-weight: 600;
}

.stage-btn--next.ant-btn:not(:disabled):hover {
  border-color: #d9ff52 !important;
  background: #14171b !important;
  color: #ffffff !important;
}

.stage-btn--run.ant-btn:not(:disabled) {
  border-color: transparent !important;
  background: var(--accent) !important;
  color: #11140c !important;
}

.stage-btn--run.ant-btn:not(:disabled):hover {
  background: #e4ff7c !important;
}

/* 重新渲染：有改动时描边变亮提醒 */
.stage-btn--render.ant-btn {
  margin-left: auto;
  border-color: #39414b !important;
  background: transparent !important;
  color: #c8d0d8 !important;
}

.stage-btn--render.ant-btn.is-dirty {
  border-color: #d9ff52 !important;
  color: #d9ff52 !important;
}

.stage-btn--render.ant-btn.is-dirty:hover {
  background: rgb(217 255 82 / 12%) !important;
}

.stage-btn.ant-btn:disabled,
.stage-btn.ant-btn[disabled] {
  border-color: #242830 !important;
  background: #0b0d10 !important;
  color: #5c6670 !important;
  cursor: not-allowed;
}

.stage-placeholder {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0;
  padding: 24px;
  border: 1px dashed #1d2229;
  border-radius: 10px;
  color: #6f7883;
  text-align: center;
  font: 500 11px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
}

.safe-zone-block { display: flex; flex-direction: column; gap: 6px; }
.safe-zone-list { margin: 0; padding-left: 16px; color: #9fa8b2; font-size: 10px; line-height: 1.8; }
.safe-zone-list li { display: flex; align-items: center; gap: 6px; }
.zone-bar { display: inline-flex; gap: 1px; }
.zone-bar i { width: 7px; height: 7px; border-radius: 2px; }
.zone-reason { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.safe-zone-list em { color: #6f7883; font-style: normal; font-size: 9px; }

.ai-heading { display: flex; align-items: center; gap: 16px; }
.ai-heading span { color: #d9ff52; font: 600 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .14em; }

.ai-eyebrow { display: flex; align-items: center; gap: 6px; }

.ai-info {
  color: #6f7883;
  font-size: 14px;
  cursor: help;
  transition: color 140ms ease;
}

.ai-info:hover { color: #d9ff52; }

/* L1 阶段性结果 */
.stage-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid #2a3037;
  border-radius: 13px;
  background: #101216;
}

.stage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.stage-tag {
  color: #d9ff52;
  font: 600 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.12em;
}

.stage-scale {
  padding: 4px 8px;
  border: 1px solid rgb(217 255 82 / 26%);
  border-radius: 99px;
  color: #d9ff52;
  font: 600 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
}

.stage-head-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 阶段动作行：回退 + 该阶段自己的执行按钮 */
.stage-back {
  padding: 4px 8px;
  border: 1px solid #2f353d;
  border-radius: 99px;
  background: #16191e;
  color: #aeb6bf;
  font: 500 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.stage-back:hover {
  border-color: #4a525b;
  color: #e6eaef;
}

.plan-facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.plan-facts dt {
  margin-bottom: 4px;
  color: #6f7883;
  font: 600 8px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.1em;
}

.plan-facts dd {
  margin: 0;
  overflow: hidden;
  color: #dfe4e9;
  font: 500 11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
  text-overflow: ellipsis;
}

.plan-rationale {
  margin: 0;
  color: #aeb6bf;
  font-size: 11px;
  line-height: 1.65;
}

.heat-block {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.heat-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  color: #6f7883;
  font: 600 8px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.1em;
}

.heat-legend {
  color: #565e68;
  letter-spacing: 0;
}

.heat-panels {
  display: grid;
  /* 左栏固定宽度：网格靠 aspect-ratio 撑高，auto 轨道会塌成 min-content */
  grid-template-columns: 168px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.heat-side {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.side-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px 10px;
  margin: 0;
}

.side-facts div { display: flex; align-items: baseline; gap: 5px; min-width: 0; }

.side-facts dt {
  flex: 0 0 auto;
  color: #6f7883;
  font: 600 8px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.08em;
}

.side-facts dd {
  margin: 0;
  overflow: hidden;
  color: #cfd5db;
  font: 500 9px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.side-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  color: #6f7883;
  font: 600 8px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.1em;
}

.side-title em {
  color: #565e68;
  font-style: normal;
  letter-spacing: 0;
}

.side-note {
  margin: 0;
  overflow: hidden;
  color: #6f7883;
  font: 500 9px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.heat-grid {
  position: relative;
  display: grid;
  gap: 4px;
  width: 100%;
}

.heat-cell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid #1d2229;
  border-radius: 5px;
  background: #0b0d10;
}

/* 承载区可能跨多格，用一层绝对定位的框把合并范围画出来 */
.heat-span {
  position: absolute;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 2px;
  padding: 2px 3px;
  border-radius: 6px;
  pointer-events: none;
  font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
}

.heat-span em {
  font-style: normal;
}

.heat-span.is-primary {
  border: 1.5px solid rgb(217 255 82 / 85%);
  color: #d9ff52;
  background: rgb(217 255 82 / 10%);
}

.heat-span.is-secondary {
  border: 1px dashed rgb(217 255 82 / 45%);
  color: rgb(217 255 82 / 75%);
}

.heat-value {
  position: relative;
  color: #7d858f;
  font: 600 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
}

.heat-note {
  margin: 0;
  color: #6f7883;
  font: 500 9px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
}

.palette-block {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.palette-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.palette-row {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #dfe4e9;
  font: 500 9px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
}

.palette-row i {
  width: 11px;
  height: 11px;
  flex: 0 0 auto;
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: 3px;
}

.palette-row em {
  margin-left: auto;
  overflow: hidden;
  color: #6f7883;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 简报默认收起：一次性铺开会抢走注意力 */
.brief-fold {
  border-top: 1px solid #1d2229;
  padding-top: 8px;
}

.brief-fold summary {
  color: #6f7883;
  cursor: pointer;
  font: 600 9px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.06em;
  list-style: none;
}

.brief-fold summary::-webkit-details-marker { display: none; }
.brief-fold summary::before { content: "＋ "; color: #d9ff52; }
.brief-fold[open] summary::before { content: "－ "; }
.brief-fold summary:hover { color: #aeb6bf; }
.brief-fold[open] summary { margin-bottom: 8px; }

.option-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.option-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  border: 1px solid #1d2229;
  border-radius: 99px;
  color: #aeb6bf;
  background: #0b0d10;
  font: 600 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
}

/* 建议值只加一圈提示，不作最终决定 */
.option-chip.is-suggested {
  border-color: rgb(217 255 82 / 60%);
  color: #d9ff52;
}

.option-dot {
  width: 9px;
  height: 9px;
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: 50%;
}

.option-chip em {
  color: #6f7883;
  font-style: normal;
}

.option-chip.is-suggested em {
  color: rgb(217 255 82 / 65%);
}

.plan-brief {
  margin: 0;
  padding: 10px;
  overflow-x: auto;
  border-radius: 9px;
  color: #9fa8b2;
  background: #0b0d10;
  font: 500 10px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: pre-wrap;
}

.stage-next {
  display: flex;
  gap: 12px;
  color: #5f6771;
  font: 600 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.1em;
}
.analysis-card { padding: 15px; border: 1px solid #2a3037; border-radius: 13px; background: #101216; }
.analysis-card p { margin: 0 0 12px; color: #b5bbc2; font-size: 12px; line-height: 1.65; }
.analysis-card .coordinate-summary { color: #8d969f; font: 500 10px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.tag-row { display: flex; flex-wrap: wrap; gap: 6px; }

.tag-block { display: flex; flex-direction: column; gap: 8px; }

.tag-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #8b939d;
  font: 600 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.1em;
}

.clear-btn {
  padding: 0;
  border: 0;
  color: #9aa2ac;
  background: transparent;
  font: 600 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.1em;
  cursor: pointer;
}

.clear-btn:hover { color: #d9ff52; }

.subject-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid #343a43;
  border-radius: 8px;
  color: #ffffff;
  background: #15181c;
  font-size: 11px;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
  transition: border-color 140ms ease, background 140ms ease, color 140ms ease;
}

.subject-tag:hover { border-color: #59606a; background: #1b1f24; }

.subject-tag.is-selected {
  border-color: #d9ff52;
  color: #ffffff;
  background: rgb(217 255 82 / 12%);
}

.subject-name { flex: 1; }

.subject-score {
  padding: 1px 5px;
  border-radius: 5px;
  background: rgb(217 255 82 / 18%);
  color: #d9ff52;
  font: 700 9px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
}

.subject-score.is-low {
  background: rgb(255 255 255 / 8%);
  color: #8b939d;
}

.tag-hint {
  margin: 0;
  color: #79818b;
  font-size: 10px;
  line-height: 1.6;
}

.tone-row { margin-top: 2px; }
.palette { display: flex; gap: 7px; margin-top: 13px; }
.palette i { width: 20px; height: 20px; border: 2px solid rgb(255 255 255 / 16%); border-radius: 50%; }
@media (max-width: 520px) { .ai-heading { align-items: flex-start; flex-direction: column; } }

/* ---------- L2 设计编辑器 ---------- */
.design-list { display: flex; flex-direction: column; gap: 8px; }

.design-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px;
  border: 1px solid #242a31;
  border-radius: 9px;
  background: #0b0d10;
}

.design-item-head { display: flex; align-items: center; gap: 8px; }

.role-chip {
  flex: 0 0 auto;
  padding: 3px 7px;
  border: 1px solid rgb(217 255 82 / 30%);
  border-radius: 99px;
  color: #d9ff52;
  font: 600 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.08em;
}

.role-chip[data-role="subline"] { border-color: #3a4650; color: #9fb0bf; }
.role-chip[data-role="meta"] { border-color: #333a42; color: #8b939d; }
.role-chip[data-role="kicker"] { border-color: #4a4330; color: #d8c07a; }

.design-text {
  flex: 1 1 auto;
  min-width: 0;
  padding: 5px 8px;
  border: 1px solid #2c333b;
  border-radius: 7px;
  color: #eef2f5;
  background: #14171b;
  font-size: 12px;
}

.design-text:focus { border-color: #d9ff52; outline: none; }

.design-text--area { resize: vertical; min-height: 38px; line-height: 1.4; }

.design-effects {
  margin: 0;
  color: #7d858f;
  font: 500 9px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
}

.design-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px 8px;
}

.design-field { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.design-field--wide { grid-column: span 2; }

.design-field span {
  overflow: hidden;
  color: #6f7883;
  font: 600 8px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.06em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.design-field input,
.design-field select {
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid #2c333b;
  border-radius: 6px;
  color: #dfe4e9;
  background: #14171b;
  font: 500 10px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
}

.design-field input[type="range"] { padding: 0; accent-color: #d9ff52; }

.design-issues {
  margin: 0;
  padding: 7px 9px;
  border: 1px solid rgb(217 255 82 / 24%);
  border-radius: 8px;
  color: #cfd5db;
  background: rgb(217 255 82 / 6%);
  font-size: 10px;
  line-height: 1.5;
}
</style>
