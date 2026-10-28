<script setup lang="ts">
/**
 * L1 步骤激活时，把主体轮廓画成一块面积并做呼吸闪烁。
 *
 * 只做视觉提示，不参与渲染管线：用 SVG 叠在原图上，靠 CSS 动画驱动，
 * 不占用 CanvasStage 的 requestAnimationFrame（那里只在播放时才跑）。
 *
 * 坐标对齐：SVG 的 viewBox 用图片自身的像素尺寸，配 preserveAspectRatio=meet，
 * 等价于给轮廓套了一层 object-fit: contain。页面缩放后容器比例和图片不一致时，
 * 轮廓也会跟图片本体一起等比缩放并居中，而不是被拉伸到容器上。
 */
import { computed } from "vue";
import {
  MAX_OUTLINE_POINTS,
  refineOutline,
  type OutlinePoint
} from "@/features/canvas-renderer/runtime/subject-outline";

export interface SubjectOutline {
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  points?: ReadonlyArray<{ x: number; y: number }>;
}

const props = defineProps<{
  outlines: readonly SubjectOutline[];
  /** 主图自身像素尺寸（已按旋转校正），用来和 <img> 的 contain 对齐。 */
  mediaWidth: number;
  mediaHeight: number;
}>();

/** 没有轮廓点时退化成外接矩形，保证一定看得到高亮。 */
function rectPoints(outline: SubjectOutline): OutlinePoint[] {
  const { x, y, width, height } = outline;
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height }
  ];
}

/** 平滑 + 重采样到最多 100 个点：模型给的 20 点也能画成顺滑闭合曲线。 */
const polygons = computed(() => {
  const width = Math.max(1, props.mediaWidth);
  const height = Math.max(1, props.mediaHeight);
  return props.outlines.map((outline) => {
    const refined = refineOutline(outline.points ?? []);
    const points = refined.length >= 3 ? refined : rectPoints(outline);
    return points
      .slice(0, MAX_OUTLINE_POINTS)
      .map((point) => `${(point.x * width).toFixed(2)},${(point.y * height).toFixed(2)}`)
      .join(" ");
  });
});

const viewBox = computed(
  () => `0 0 ${Math.max(1, props.mediaWidth)} ${Math.max(1, props.mediaHeight)}`
);
</script>

<template>
  <svg
    class="subject-pulse"
    :viewBox="viewBox"
    preserveAspectRatio="xMidYMid meet"
    aria-hidden="true"
  >
    <polygon v-for="(points, index) in polygons" :key="index" :points="points" />
  </svg>
</template>

<style scoped>
.subject-pulse {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  /* 一个来回 2s：浅 → 深 → 浅 */
  animation: subject-pulse 2s ease-in-out infinite;
}

.subject-pulse polygon {
  fill: #d9ff52;
}

@keyframes subject-pulse {
  0%,
  100% {
    opacity: 0;
  }

  50% {
    opacity: 0.5;
  }
}

@media (prefers-reduced-motion: reduce) {
  .subject-pulse {
    animation: none;
    opacity: 0.28;
  }
}
</style>
