<script setup lang="ts">
/**
 * 设计语汇 + 物理层展示面板。
 * 灵感库悬浮浮层与工作流分析结果共用同一份渲染逻辑，保证信息一致。
 */
withDefaults(
  defineProps<{
    vocabulary?: Record<string, any> | null;
    detection?: Record<string, any> | null;
    title?: string;
    heatSize?: string;
  }>(),
  { heatSize: "50%", vocabulary: null, detection: null, title: "" }
);

function layerSummary(grid: Array<{ layer: string }> | null | undefined): string {
  if (!grid?.length) return "无色块数据";
  const c: Record<string, number> = {};
  for (const g of grid) c[g.layer] = (c[g.layer] ?? 0) + 1;
  return ["高饱和", "中间调", "暗部"]
    .filter((k) => c[k])
    .map((k) => `${k} ${c[k]}`)
    .join(" · ");
}

function displayIndex(index: string | number): number {
  return Number(index) + 1;
}

function hasNext(index: string | number, total: number): boolean {
  return Number(index) < total - 1;
}

/** 文案内容最多显示 10 个字符，超出补 ... */
function truncateText(value: unknown, max = 10): string {
  const text = String(value ?? "");
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max).join("")}...` : text;
}

/** 热区格着色：主体热区(黄绿) / 纯文案区(蓝) / 文字重叠主体(青) */
function cellColor(heat: number, text: number): string {
  const h = Math.max(0, Math.min(100, heat || 0));
  const t = Math.max(0, Math.min(100, text || 0));
  if (h === 0 && t > 0) {
    const k = t / 100;
    return `rgb(${30 + Math.round(k * 30)}, ${90 + Math.round(k * 80)}, ${170 + Math.round(k * 85)})`;
  }
  if (h > 0 && t > 0) {
    const k = Math.min(1, (h + t) / 200);
    return `rgb(${20 + Math.round(k * 40)}, ${150 + Math.round(k * 90)}, ${160 + Math.round(k * 80)})`;
  }
  const a = 0.07 + (h / 100) * 0.93;
  const mix = (base: number, lime: number) => Math.round(base + (lime - base) * a);
  return `rgb(${mix(10, 217)}, ${mix(12, 255)}, ${mix(14, 82)})`;
}
</script>

<template>
  <div class="vocab-panel" :style="{ '--heat-size': heatSize }">
    <div class="vp-head" v-if="title">设计语汇 · <span class="vp-title">{{ title }}</span></div>

    <div class="vp-block" v-if="vocabulary?.semanticSummary">
      <b>语义摘要</b>
      <p>{{ vocabulary.semanticSummary }}</p>
    </div>

    <!-- 物理层：无主体 → 色块分布 -->
    <div
      class="vp-block"
      v-if="detection && detection.subjectCount === 0 && detection.colorGrid"
    >
      <b>物理层 · 色块分布（10×10 · 无主体）</b>
      <div class="heat-row">
        <div class="heat-grid" :style="{ gridTemplateColumns: `repeat(${detection.cols || 10}, 1fr)` }">
          <div
            v-for="(g, idx) in detection.colorGrid"
            :key="idx"
            class="heat-cell color-cell"
            :class="{ 'has-text': (detection.textGrid?.[idx] ?? 0) > 0 }"
            :style="{ background: g.color }"
            :title="`${g.color} · ${g.layer}${(detection.textGrid?.[idx] ?? 0) > 0 ? ' · 文案 ' + detection.textGrid[idx] : ''}`"
          >
            <span v-if="(detection.textGrid?.[idx] ?? 0) > 0" class="hc-text-mark">T</span>
          </div>
        </div>
        <div class="heat-side">
          <p class="vp-note">
            主体 0 个 · 无主体背景图 · 按格取中位色（{{ layerSummary(detection.colorGrid) }}）
          </p>
          <p class="vp-note legend">
            <span class="lg"><i class="dot main" style="background: #d9ff52"></i>高饱和</span>
            <span class="lg"><i class="dot sec" style="background: #6b6b6b"></i>中间调</span>
            <span class="lg"><i class="dot txt" style="background: #1a1a1a"></i>暗部</span>
            <span class="lg"><i class="dot" style="background: #3d8ae0"></i>文案区(T)</span>
          </p>
        </div>
      </div>
    </div>

    <!-- 物理层：有主体 → 主体热区 -->
    <div class="vp-block" v-else-if="detection && detection.heatGrid">
      <b>物理层 · 主体热区（10×10）</b>
      <div class="heat-row">
        <div class="heat-grid" :style="{ gridTemplateColumns: `repeat(${detection.cols || 10}, 1fr)` }">
          <div
            v-for="(p, idx) in detection.heatGrid"
            :key="idx"
            class="heat-cell"
            :style="{ background: cellColor(p, detection.textGrid?.[idx] ?? 0) }"
            :title="`主体 ${p}${(detection.textGrid?.[idx] ?? 0) > 0 ? ' · 文案 ' + detection.textGrid[idx] : ''}`"
          >
            <span class="hc-heat">{{ p }}</span>
            <span v-if="(detection.textGrid?.[idx] ?? 0) > 0" class="hc-text-mark">T</span>
          </div>
        </div>
        <div class="heat-side">
          <p class="vp-note">
            主体 {{ detection.subjectCount }} 个 · 每格分数 = 主体框与该格的重合面积占比（0-100）
          </p>
          <p class="vp-note legend">
            <span class="lg"><i class="dot main"></i>主体</span>
            <span class="lg"><i class="dot" style="background: #3d8ae0"></i>文案区</span>
            <span class="lg"><i class="dot" style="background: #3fc8d8"></i>文字重叠主体</span>
          </p>
        </div>
      </div>
    </div>

    <div class="vp-block" v-if="vocabulary?.texts?.length">
      <b>文案层（{{ vocabulary.texts.length }}）</b>
      <div class="vp-copy-line">
        <span v-for="(t, i) in vocabulary.texts" :key="t.id" class="copy-item">
          <i class="lv" :class="{ top: t.emphasis === '最强' }">{{ t.level || "—" }}</i>
          <span class="sw" v-if="t.color" :style="{ background: t.color }"></span>
          <span class="copy-text">{{ truncateText(t.content || "（未识别）", 10) }}</span>
          <span v-if="hasNext(i, vocabulary.texts.length)" class="copy-sep">|</span>
        </span>
      </div>
    </div>

    <div class="vp-block" v-if="vocabulary?.composition">
      <b>构图层</b>
      <p class="vp-line">
        {{ vocabulary.composition.pattern || "—" }} · 焦点 {{ vocabulary.composition.focal || "—" }}
        <template v-if="vocabulary.composition.subjectTextRelation">
          · {{ vocabulary.composition.subjectTextRelation }}
        </template>
      </p>
      <p class="vp-line" v-if="vocabulary.composition.readingOrder?.length">
        <span v-for="(r, i) in vocabulary.composition.readingOrder" :key="i">{{ displayIndex(i) }}. {{ r }}<br /></span>
      </p>
    </div>

    <div class="vp-block" v-if="vocabulary?.style">
      <b>风格层</b>
      <p class="vp-line">
        {{ vocabulary.style.composition || "—" }} · 色调
        {{ (vocabulary.style.colorTone || []).join("/") || "—" }}
        <template v-if="vocabulary.style.colorMood?.length">
          · 氛围 {{ vocabulary.style.colorMood.join("/") }}
        </template>
        · 风格 {{ (vocabulary.style.styleTags || []).join("/") || "—" }}
      </p>
      <p class="vp-line" v-if="vocabulary.style.palette">
        主色
        <span class="swatch" :style="{ background: vocabulary.style.palette.maincolor }"></span>{{
          vocabulary.style.palette.maincolor
        }}
        · 辅色
        <span class="swatch" :style="{ background: vocabulary.style.palette.vicecolor }"></span>{{
          Array.isArray(vocabulary.style.palette.vicecolor)
            ? vocabulary.style.palette.vicecolor.join(" / ")
            : vocabulary.style.palette.vicecolor
        }}
      </p>
    </div>

    <div class="vp-block" v-if="vocabulary?.scene">
      <b>场景层</b>
      <p class="vp-line">
        {{ vocabulary.scene.purpose || "—" }} · 意图 {{ vocabulary.scene.intent || "—" }}
      </p>
      <p class="vp-line">
        {{ (vocabulary.scene.sceneTags || []).join(" / ") || "—" }}
        <span v-if="vocabulary.scene.emotionTags?.length">
          · 情绪 {{ vocabulary.scene.emotionTags.join("/") }}
        </span>
      </p>
    </div>

    <div class="vp-block" v-if="vocabulary?.designGuidance">
      <b>设计建议</b>
      <p class="vp-line" v-if="vocabulary.designGuidance.initialOcclusion">
        遮挡建议：{{ vocabulary.designGuidance.initialOcclusion }}
      </p>
      <p class="vp-line" v-if="vocabulary.designGuidance.copyDesign">
        文案设计：{{ vocabulary.designGuidance.copyDesign }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.vocab-panel {
  color: #b9c1c9;
}
.vp-head {
  margin-bottom: 8px;
  color: #d9ff52;
  font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.08em;
}
.vp-title {
  color: #8f969f;
  font-weight: 400;
}
.vp-block {
  margin-bottom: 10px;
}
.vp-block b {
  display: block;
  margin-bottom: 4px;
  color: #eef2f5;
  font-size: 11px;
}
.vp-block p {
  margin: 0 0 3px;
  color: #b9c1c9;
  font-size: 10.5px;
  line-height: 1.55;
  word-break: break-word;
}
.vp-line {
  padding-left: 2px;
}
.vp-copy-line {
  font-size: 10.5px;
  line-height: 1.8;
  word-break: break-word;
}
.copy-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  vertical-align: middle;
}
.copy-item + .copy-item {
  margin-left: 6px;
}
.copy-text {
  color: #d6dde3;
}
.copy-sep {
  margin-left: 4px;
  color: #5f6872;
}
.lv {
  flex: 0 0 auto;
  padding: 0 6px;
  border-radius: 99px;
  color: #8f969f;
  background: rgb(255 255 255 / 8%);
  font: 600 9px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  font-style: normal;
  white-space: nowrap;
}
.lv.top {
  color: #fff;
  background: #3d8ae0;
}
.sw {
  display: inline-block;
  width: 10px;
  height: 10px;
  flex: 0 0 10px;
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgb(255 255 255 / 20%);
}
.swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin: 0 3px 0 2px;
  border-radius: 50%;
  vertical-align: middle;
  box-shadow: 0 0 0 1px rgb(255 255 255 / 20%);
}

/* 10×10 热力图：左侧网格，右侧说明/图例 */
.heat-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 8px 0 6px;
}
.heat-grid {
  display: grid;
  flex: 0 0 var(--heat-size, 50%);
  gap: 2px;
  width: var(--heat-size, 50%);
  max-width: var(--heat-max, 190px);
}
.heat-side {
  flex: 1 1 auto;
  min-width: 0;
}
.heat-cell {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: 2px;
  display: grid;
  place-items: center;
}
.heat-cell.is-text,
.heat-cell.has-text {
  outline: 1px dashed rgb(255 255 255 / 45%);
  outline-offset: -1px;
}
.color-cell.has-text {
  box-shadow: inset 0 0 0 2px #3d8ae0;
}
.hc-text-mark {
  position: absolute;
  right: 2px;
  bottom: 1px;
  font: 700 8px/1 ui-monospace;
  color: rgb(255 255 255 / 85%);
}
.hc-heat {
  color: rgb(0 0 0 / 45%);
  font: 600 7px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.vp-note {
  margin: 0 0 6px;
  color: #9aa3ad;
  font-size: 10px;
  line-height: 1.5;
}
.legend {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  color: #8f969f;
}
.lg {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 2px;
}
.dot.main {
  background: #d9ff52;
}
.dot.sec {
  background: rgb(255 255 255 / 22%);
}
.dot.txt {
  border: 1px dashed rgb(255 255 255 / 45%);
}
</style>
