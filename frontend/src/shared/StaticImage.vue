<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

/**
 * 只渲染图片首帧（用于动图 webp，禁止播放）
 * 用 canvas 绘制，object-fit: cover 效果
 */
const props = defineProps<{ src: string; alt?: string }>();

const canvas = ref<HTMLCanvasElement | null>(null);
let img: HTMLImageElement | null = null;
let observer: ResizeObserver | null = null;

function draw() {
  const c = canvas.value;
  if (!c || !img || !img.naturalWidth) return;
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (!w || !h) return;
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const ctx = c.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function load() {
  if (img) {
    img.onload = null;
    img = null;
  }
  img = new Image();
  img.onload = draw;
  img.src = props.src;
}

onMounted(() => {
  load();
  if (canvas.value) {
    observer = new ResizeObserver(() => draw());
    observer.observe(canvas.value);
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
  if (img) img.onload = null;
});

watch(() => props.src, load);
</script>

<template>
  <canvas ref="canvas" class="static-frame" role="img" :aria-label="alt" />
</template>

<style scoped>
.static-frame {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
