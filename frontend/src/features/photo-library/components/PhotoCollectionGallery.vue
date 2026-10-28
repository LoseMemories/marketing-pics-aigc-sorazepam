<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { FALLBACK_CONTAINER_WIDTH, buildPhotoFlow } from "../model/photo-library.layout";
import type { PhotoLibraryItem } from "../model/photo-library.types";

const props = defineProps<{
  items: readonly PhotoLibraryItem[];
  loading: boolean;
  selectedKey?: string;
}>();

const emit = defineEmits<{ select: [item: PhotoLibraryItem] }>();

const flowEl = ref<HTMLElement>();
const containerWidth = ref(0);
let resizeObserver: ResizeObserver | undefined;
let widthFrame: number | undefined;

const rows = computed(() => buildPhotoFlow(props.items, containerWidth.value));

function selectItem(item: PhotoLibraryItem): void {
  if (!item.asset) return;
  emit("select", item);
}

onMounted(() => {
  if (!flowEl.value) return;
  containerWidth.value = flowEl.value.clientWidth || FALLBACK_CONTAINER_WIDTH;
  resizeObserver = new ResizeObserver((entries) => {
    const width = Math.round(entries[0]?.contentRect.width ?? 0);
    if (width <= 0 || width === containerWidth.value) return;
    // 布局变化会影响容器高度，同步改写宽度会触发 "ResizeObserver loop" 告警；
    // 推迟到下一帧并跳过未变化的宽度即可收敛。
    if (widthFrame !== undefined) cancelAnimationFrame(widthFrame);
    widthFrame = requestAnimationFrame(() => {
      widthFrame = undefined;
      containerWidth.value = width;
    });
  });
  resizeObserver.observe(flowEl.value);
});

onBeforeUnmount(() => {
  if (widthFrame !== undefined) cancelAnimationFrame(widthFrame);
  resizeObserver?.disconnect();
});
</script>

<template>
  <div ref="flowEl" class="flow">
    <div v-if="loading" class="skeleton-flow" aria-busy="true">
      <div v-for="rowIndex in 3" :key="rowIndex" class="row skeleton-row">
        <div v-for="col in 3" :key="col" class="tile skeleton" />
      </div>
    </div>

    <template v-else>
      <div v-for="(row, rowIndex) in rows" :key="rowIndex" class="row">
        <button
          v-for="tile in row.tiles"
          :key="tile.item.key"
          type="button"
          class="tile"
          :class="{
            'is-selected': selectedKey === tile.item.key,
            'is-pending': tile.item.status === 'processing',
            'is-failed': tile.item.status === 'failed'
          }"
          :style="{ width: `${tile.width}px`, height: `${tile.height}px` }"
          :disabled="tile.item.status !== 'ready'"
          :aria-pressed="selectedKey === tile.item.key"
          :title="tile.item.status === 'failed' ? (tile.item.message ?? '处理失败') : tile.item.title"
          @click="selectItem(tile.item)"
        >
          <img
            v-if="tile.item.asset"
            :src="tile.item.asset.thumbUrl || tile.item.asset.posterUrl"
            :alt="tile.item.title"
            loading="lazy"
            draggable="false"
          />
          <span v-else class="tile-state">
            <i v-if="tile.item.status === 'processing'" class="spinner" />
            <span>{{ tile.item.status === "failed" ? "FAILED" : "PREPARING" }}</span>
          </span>
          <span class="tile-live"><i /> LIVE</span>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.flow {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
}

.row {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.row:last-child { margin-bottom: 0; }

.skeleton-flow { display: flex; flex-direction: column; }

.skeleton-row { height: 172px; }

.skeleton-row > .tile {
  flex: 1 1 0;
  height: 100%;
}

.tile {
  position: relative;
  display: block;
  flex: 0 1 auto;
  box-sizing: border-box;
  padding: 0;
  overflow: hidden;
  border: 1px solid #2b3038;
  border-radius: 14px;
  background: #0b0d10;
  cursor: pointer;
  transition: border-color 140ms ease, transform 140ms ease, box-shadow 140ms ease;
}

.tile img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.tile:not(:disabled):hover {
  border-color: #59606a;
  transform: translateY(-2px);
}

.tile.is-selected {
  border-color: #d9ff52;
  box-shadow: 0 0 0 2px rgb(217 255 82 / 55%), 0 16px 34px rgb(0 0 0 / 45%);
  transform: none;
}

.tile.is-pending {
  cursor: progress;
  border-style: dashed;
}

.tile.is-failed {
  cursor: not-allowed;
  border-color: #5b2b2b;
}

.tile-state {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 8px;
  color: #6c747e;
  font: 600 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.14em;
}

.tile.is-failed .tile-state { color: #b4656b; }

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid #333a43;
  border-top-color: #d9ff52;
  border-radius: 50%;
  animation: spin 700ms linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.tile-live {
  position: absolute;
  left: 8px;
  bottom: 8px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 7px;
  border-radius: 99px;
  color: #eef1f3;
  background: rgb(6 8 10 / 62%);
  backdrop-filter: blur(6px);
  font: 700 8px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.12em;
}

.tile-live i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #d9ff52;
}

.tile.skeleton {
  border-color: #23282f;
  background: linear-gradient(110deg, #14171b 20%, #1c2027 45%, #14171b 70%);
  background-size: 220% 100%;
  animation: shimmer 1.6s ease-in-out infinite;
  cursor: default;
}

@keyframes shimmer {
  from { background-position: 140% 0; }
  to { background-position: -40% 0; }
}
</style>
