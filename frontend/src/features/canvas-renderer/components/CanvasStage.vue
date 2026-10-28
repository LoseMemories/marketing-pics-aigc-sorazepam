<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { EffectTimeline, SubjectMaskRegion } from "@/features/motion-effects/model/effect.types";
import { CanvasRenderer } from "../runtime/canvas-renderer";

const props = defineProps<{
  timeline: EffectTimeline;
  timeMs: number;
  mediaWidth: number;
  mediaHeight: number;
  playing: boolean;
  /** 主体避让多边形，用于“文字从人物后方出现”。 */
  subjectRegions?: readonly SubjectMaskRegion[];
}>();

const host = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
let renderer: CanvasRenderer | undefined;
let observer: ResizeObserver | undefined;

function render(): void {
  renderer?.render(props.timeMs, props.timeline, {
    width: props.mediaWidth,
    height: props.mediaHeight
  }, props.playing ? "timeline" : "snapshot", {
    ...(props.subjectRegions ? { subjectRegions: props.subjectRegions } : {})
  });
}

onMounted(() => {
  if (!host.value || !canvas.value) return;
  renderer = new CanvasRenderer(canvas.value);
  observer = new ResizeObserver(([entry]) => {
    if (!entry) return;
    renderer?.resize(entry.contentRect.width, entry.contentRect.height, window.devicePixelRatio);
    render();
  });
  observer.observe(host.value);
});

watch(() => [props.timeMs, props.timeline, props.mediaWidth, props.mediaHeight, props.playing] as const, render);

onBeforeUnmount(() => {
  observer?.disconnect();
  renderer?.destroy();
});
</script>

<template>
  <div ref="host" class="canvas-stage" aria-hidden="true">
    <canvas ref="canvas" />
  </div>
</template>

<style scoped>
.canvas-stage,
.canvas-stage canvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
