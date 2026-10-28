<script setup lang="ts">
import { computed, ref } from "vue";
import type { LiveAsset } from "@/entities/live-asset/model/live-asset.types";
import CanvasStage from "@/features/canvas-renderer/components/CanvasStage.vue";
import SubjectPulseOverlay, {
  type SubjectOutline
} from "@/features/canvas-renderer/components/SubjectPulseOverlay.vue";
import AiDesignPanel from "@/features/design-assistant/components/AiDesignPanel.vue";
import type { CompositionSpec } from "@/features/design-assistant/model/design-assistant.types";
import type { SubjectMaskRegion } from "@/features/motion-effects/model/effect.types";
import PhotoLibraryStage from "@/features/photo-library/components/PhotoLibraryStage.vue";
import type { EffectTimeline } from "@/features/motion-effects/model/effect.types";
import { createEffectTimeline, emptyEffectTimeline } from "@/features/motion-effects/runtime/effect-timeline";

const asset = ref<LiveAsset>();
const timeline = ref<EffectTimeline>(emptyEffectTimeline);
/** 实况开关：关闭后按静态图逻辑处理（不使用视频轨）。 */
const isLive = ref(true);
/** 画面分析得到的主体轮廓，供画布做“文字从人后出现”的遮挡。 */
const subjectRegions = ref<SubjectMaskRegion[]>([]);
/** 主体轮廓的完整几何（含矩形），只用于 L1 阶段的高亮叠加。 */
const subjectOutlines = ref<SubjectOutline[]>([]);
/** 设计面板里选中的主体标签：没选中的主体不参与闪烁。 */
const selectedSubjectLabels = ref<string[]>([]);
/** 设计面板当前停在哪个阶段；停在 L1（=1）才在原图上呼吸高亮主体。 */
const designStage = ref(0);
const l1Highlight = ref(false);

/** 只保留被选中的主体；一个都没选就不闪。 */
const pulseOutlines = computed(() => {
  const selected = new Set(selectedSubjectLabels.value);
  return subjectOutlines.value.filter((outline) => outline.label && selected.has(outline.label));
});

function useAsset(nextAsset: LiveAsset): void {
  asset.value = nextAsset;
  timeline.value = emptyEffectTimeline;
  isLive.value = true;
  subjectRegions.value = [];
  subjectOutlines.value = [];
  selectedSubjectLabels.value = [];
  designStage.value = 0;
  l1Highlight.value = false;
}

function useAnalysis(analysis: {
  subjectRegions: readonly {
    label?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    points?: readonly { x: number; y: number }[];
  }[];
}): void {
  subjectRegions.value = analysis.subjectRegions.map((region) => ({
    ...(region.points ? { points: region.points } : {})
  }));
  subjectOutlines.value = analysis.subjectRegions.map((region) => ({
    ...(region.label ? { label: region.label } : {}),
    x: region.x,
    y: region.y,
    width: region.width,
    height: region.height,
    ...(region.points ? { points: region.points } : {})
  }));
}

function useStage(stage: number): void {
  designStage.value = stage;
  l1Highlight.value = stage === 1;
}

function useSelection(labels: string[]): void {
  selectedSubjectLabels.value = labels;
}

function useComposition(composition: CompositionSpec): void {
  timeline.value = createEffectTimeline(composition.layers, composition.durationMs);
}
</script>

<template>
  <main class="workbench">
    <section class="intro" aria-label="产品概览">
      <p class="kicker">PHOTO MARKETING LAB</p>
      <h1>真实素材，<br /><em>即刻变成营销画面。</em></h1>
      <p class="intro-lead">
        实况与静态照片统一入库：按真实比例浏览、原声预览，再由 DeepSeek 理解画面，
        在预览上编排受控的 Canvas 文字与光点动效。
      </p>
    </section>

    <div class="workspace-grid">
      <div class="panel stage-card">
        <PhotoLibraryStage
          :asset="asset"
          :live="isLive"
          @selected="useAsset"
          @update:live="isLive = $event"
        >
          <template #overlay="{ currentTimeMs, mediaWidth, mediaHeight, playing }">
            <!-- 放在画布之前：让高亮位于文字/动效下方，不遮住内容 -->
            <SubjectPulseOverlay
              v-if="l1Highlight"
              :outlines="pulseOutlines"
              :media-width="mediaWidth"
              :media-height="mediaHeight"
            />
            <CanvasStage
              :timeline="timeline"
              :time-ms="currentTimeMs"
              :media-width="mediaWidth"
              :media-height="mediaHeight"
              :playing="isLive && playing"
              :subject-regions="subjectRegions"
            />
          </template>
        </PhotoLibraryStage>
      </div>

      <div class="panel design-card">
        <AiDesignPanel
          v-if="asset"
          :asset="asset"
          :live="isLive"
          @composed="useComposition"
          @analyzed="useAnalysis"
          @update:stage="useStage"
          @update:selection="useSelection"
        />
        <section v-else class="design-empty" aria-labelledby="design-empty-title">
          <span class="eyebrow">02 · AI DESIGN</span>
          <h3 id="design-empty-title">画面理解与动效编排</h3>
          <p>先从图库中选择一张实况照片，这里会提供主体识别、文案编排与 Canvas 动效生成。</p>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped>
.workbench {
  /* 吸顶偏移与高度都从这里推，避免两处写死对不上 */
  --masthead-h: 68px;
  --sticky-gap: 16px;
  min-height: 100vh;
  padding: 0 4vw 4vw;
}

.intro {
  padding: 36px 0 40px;
}

.kicker {
  margin: 0 0 16px;
  color: #767e88;
  font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.2em;
}

.intro h1 {
  margin: 0;
  color: #f3f5f7;
  font-size: clamp(40px, 5.2vw, 76px);
  line-height: 1.02;
  letter-spacing: -0.06em;
}

.intro h1 em {
  color: #d9ff52;
  font-family: Georgia, "Times New Roman", serif;
  font-weight: 400;
}

.intro-lead {
  max-width: 560px;
  margin: 26px 0 0;
  color: #8f969f;
  font-size: 15px;
  line-height: 1.8;
}

.workspace-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 22px;
  align-items: start;
}

.panel {
  padding: clamp(22px, 2vw, 36px);
  border: 1px solid #242830;
  border-radius: 26px;
  background: rgb(18 20 24 / 88%);
  box-shadow: 0 24px 90px rgb(0 0 0 / 24%);
}

.stage-card {
  /*
   * 01 是“参照物”：吸顶后始终可见，高度必须装得进视口。
   *
   * 视觉上保留和 02 同一套卡片语法（细边框 + 大圆角），但去掉填充色和投影。
   * 实心 + 阴影会让人以为它是“一块可滚动的独立面板”，而它其实不动；
   * 空心的框只负责框住预览，视觉重量比 02 轻，两侧的关系才读得通：
   *   左侧吸顶、轻、始终可见（看效果）
   *   右侧滚动、重、随内容增长（改参数）
   */
  position: sticky;
  top: calc(var(--masthead-h) + var(--sticky-gap));
  display: flex;
  height: clamp(420px, calc(100vh - var(--masthead-h) - var(--sticky-gap) * 2), 900px);
  padding: clamp(14px, 1.6vw, 22px);
  border: 1px solid #242830;
  border-radius: 26px;
  background: none;
  box-shadow: none;
}

.design-card {
  /* 长表单不吸顶：吸顶会让它的下半部分永远滚不到 */
  position: static;
  /* 与 01 保持同一套外观：只有描边，不填充、不投影 */
  background: none;
  box-shadow: none;
}

.design-empty .eyebrow {
  color: #d9ff52;
  font: 600 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.14em;
}

.design-empty h3 {
  margin: 7px 0 0;
  color: #e9edf0;
  font-size: 17px;
}

.design-empty p {
  margin: 14px 0 0;
  color: #727a84;
  font-size: 12px;
  line-height: 1.7;
}

@media (max-width: 980px) {
  .workspace-grid { grid-template-columns: minmax(0, 1fr); }
  /* 单列后不需要吸顶，否则会把 02 顶出视口 */
  .stage-card,
  .design-card { position: static; }
  .stage-card { height: clamp(520px, 72vh, 780px); }
}

@media (max-width: 560px) {
  .workbench { padding-inline: 16px; }
  .intro { padding-top: 52px; }
  .version { display: none; }
}
</style>
