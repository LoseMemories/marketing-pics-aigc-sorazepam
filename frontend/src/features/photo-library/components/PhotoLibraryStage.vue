<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { AppstoreOutlined, CompressOutlined, ReloadOutlined } from "@ant-design/icons-vue";
import type { LiveAsset } from "@/entities/live-asset/model/live-asset.types";
import LivePhotoPreview from "@/features/live-preview/components/LivePhotoPreview.vue";
import { listPhotoLibrary } from "../api/photo-library.api";
import { photoAspect } from "../model/photo-library.layout";
import type { PhotoLibraryItem } from "../model/photo-library.types";
import PhotoCollectionGallery from "./PhotoCollectionGallery.vue";

const props = defineProps<{ asset?: LiveAsset; live?: boolean }>();
const emit = defineEmits<{ selected: [asset: LiveAsset]; "update:live": [value: boolean] }>();

const items = ref<PhotoLibraryItem[]>([]);
const loading = ref(true);
const errorMessage = ref("");
const selectedKey = ref<string>();
const mode = ref<"preview" | "browse">("preview");
/** 相册栏滚动中才显示滚动条。 */
const railScrolling = ref(false);
let railScrollTimer: ReturnType<typeof setTimeout> | undefined;

function onRailScroll(): void {
  railScrolling.value = true;
  clearTimeout(railScrollTimer);
  railScrollTimer = setTimeout(() => {
    railScrolling.value = false;
  }, 900);
}

let pollTimer: ReturnType<typeof setTimeout> | undefined;
let autoSelected = false;
let disposed = false;

const readyCount = computed(() => items.value.filter((item) => item.status === "ready").length);
const pendingCount = computed(
  () => items.value.filter((item) => item.status === "processing").length
);

function selectItem(item: PhotoLibraryItem): void {
  if (!item.asset) return;
  selectedKey.value = item.key;
  emit("selected", item.asset);
  mode.value = "preview";
}

function autoSelectFirstReady(): void {
  if (autoSelected) return;
  const first = items.value.find((item) => item.status === "ready" && item.asset);
  if (!first?.asset) return;
  autoSelected = true;
  selectedKey.value = first.key;
  emit("selected", first.asset);
}

async function load(refresh = false): Promise<void> {
  clearTimeout(pollTimer);
  try {
    items.value = await listPhotoLibrary({ refresh });
    errorMessage.value = "";
    autoSelectFirstReady();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "图库加载失败。";
  } finally {
    loading.value = false;
    if (!disposed && pendingCount.value > 0) {
      pollTimer = setTimeout(() => void load(), 1200);
    }
  }
}

function rescan(): void {
  clearTimeout(pollTimer);
  void load(true);
}

function toggleMode(): void {
  mode.value = mode.value === "browse" ? "preview" : "browse";
}

onMounted(() => void load());

onBeforeUnmount(() => {
  disposed = true;
  clearTimeout(pollTimer);
  clearTimeout(railScrollTimer);
});
</script>

<template>
  <section class="stage" aria-label="预览">
    <header class="stage-head">
      <div class="stage-title">
        <span class="eyebrow">01 · PREVIEW</span>
        <span class="stage-count">
          {{ readyCount }}<template v-if="pendingCount"> / +{{ pendingCount }} 处理中</template>
        </span>
      </div>

      <div class="stage-actions">
        <button type="button" class="ghost-btn" @click="toggleMode">
          <CompressOutlined v-if="mode === 'browse'" />
          <AppstoreOutlined v-else />
          {{ mode === "browse" ? "返回预览" : "展开所有照片" }}
        </button>
        <button type="button" class="icon-btn" title="重新扫描" aria-label="重新扫描" @click="rescan">
          <ReloadOutlined />
        </button>
      </div>
    </header>

    <div class="stage-body">
      <PhotoCollectionGallery
        v-if="mode === 'browse'"
        :items="items"
        :loading="loading"
        :selected-key="selectedKey"
        @select="selectItem"
      />

      <div v-else class="preview-layout">
        <div
          class="rail"
          :class="{ 'is-scrolling': railScrolling }"
          role="listbox"
          aria-label="图库缩略图"
          @scroll.passive="onRailScroll"
        >
          <button
            v-for="item in items"
            :key="item.key"
            type="button"
            role="option"
            class="rail-item"
            :class="{
              'is-selected': selectedKey === item.key,
              'is-pending': item.status === 'processing',
              'is-failed': item.status === 'failed'
            }"
            :style="{ aspectRatio: String(photoAspect(item)) }"
            :aria-selected="selectedKey === item.key"
            :disabled="item.status !== 'ready'"
            :title="item.title"
            @click="selectItem(item)"
          >
            <img
              v-if="item.asset"
              :src="item.asset.thumbUrl || item.asset.posterUrl"
              :alt="item.title"
              loading="lazy"
              draggable="false"
            />
            <span v-else class="rail-state">
              <i v-if="item.status === 'processing'" class="spinner" />
            </span>
            <span class="rail-live"><i />LIVE</span>
          </button>

          <div v-if="!loading && items.length === 0" class="rail-empty">暂无素材</div>
        </div>

        <div class="preview-pane">
          <LivePhotoPreview
            v-if="props.asset"
            :asset="props.asset"
            :show-heading="false"
            :live="props.live !== false"
            @update:live="emit('update:live', $event)"
          >
            <template #overlay="slotProps">
              <slot name="overlay" v-bind="slotProps" />
            </template>
          </LivePhotoPreview>

          <div v-else class="preview-empty">
            <h3>等待图库载入</h3>
            <p>选中左侧任意一张实况照片后，这里会显示原图与视频轨的联动预览。</p>
          </div>
        </div>
      </div>
    </div>

    <div v-if="errorMessage" class="stage-error">
      <span>{{ errorMessage }}</span>
      <button type="button" @click="rescan">重试</button>
    </div>
  </section>
</template>

<style scoped>
.stage {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.stage-head {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.stage-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.stage-title h2 {
  margin: 0;
  color: #f4f6f8;
  font-size: 20px;
  letter-spacing: -0.03em;
}

.eyebrow {
  color: #d9ff52;
  font: 600 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.16em;
  white-space: nowrap;
}

.stage-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

.stage-count {
  padding: 5px 9px;
  border: 1px solid rgb(217 255 82 / 24%);
  border-radius: 99px;
  color: #d9ff52;
  font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: nowrap;
}

.ghost-btn,
.icon-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #343a43;
  border-radius: 99px;
  color: #98a0aa;
  background: transparent;
  font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: color 140ms ease, border-color 140ms ease;
}

.ghost-btn { padding: 7px 12px; }

.icon-btn {
  width: 28px;
  height: 28px;
  justify-content: center;
  font-size: 12px;
}

.ghost-btn:hover,
.icon-btn:hover {
  color: #d9ff52;
  border-color: rgb(217 255 82 / 40%);
}

.stage-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.stage-flow { margin-top: 12px; }

.preview-layout {
  display: grid;
  grid-template-columns: 156px minmax(0, 1fr);
  gap: 16px;
  height: 100%;
  min-height: 0;
}

.rail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
  /* 滚动条默认透明，仅滚动时显示滑块（scrollbar-width/color 兼容 Firefox 与新版 Chromium）。 */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.rail.is-scrolling {
  scrollbar-color: #3a4049 transparent;
}

.rail::-webkit-scrollbar { width: 6px; }
.rail::-webkit-scrollbar-track { background: transparent; }
.rail::-webkit-scrollbar-thumb {
  border-radius: 99px;
  background: transparent;
}

.rail.is-scrolling::-webkit-scrollbar-thumb {
  background: #3a4049;
}

.rail-item {
  position: relative;
  flex: none;
  width: 100%;
  padding: 0;
  overflow: hidden;
  border: 1px solid #2b3038;
  border-radius: 10px;
  background: #0b0d10;
  cursor: pointer;
  transition: border-color 140ms ease, box-shadow 140ms ease;
}

.rail-item img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.rail-item:hover { border-color: #59606a; }

.rail-item.is-selected {
  border-color: #d9ff52;
  box-shadow: 0 0 0 2px rgb(217 255 82 / 50%);
}

.rail-item.is-pending { cursor: progress; border-style: dashed; }
.rail-item.is-failed { cursor: not-allowed; border-color: #5b2b2b; }

.rail-state {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}

.rail-live {
  position: absolute;
  left: 4px;
  bottom: 4px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 5px;
  border-radius: 99px;
  color: #eef1f3;
  background: rgb(6 8 10 / 62%);
  backdrop-filter: blur(6px);
  font: 700 7px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.1em;
}

.rail-live i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #d9ff52;
}

.rail-empty {
  padding: 14px 6px;
  color: #6f7680;
  font-size: 11px;
  text-align: center;
}

.preview-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.preview-empty {
  display: grid;
  flex: 1;
  align-content: center;
  justify-items: center;
  min-height: 0;
  padding: 28px;
  border: 1px dashed #2f353d;
  border-radius: 20px;
  color: #767e88;
  text-align: center;
}

.preview-empty span {
  color: #59606a;
  font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.16em;
}

.preview-empty h3 { margin: 16px 0 8px; color: #d3d7db; font-size: 18px; }
.preview-empty p { max-width: 320px; margin: 0; font-size: 12px; line-height: 1.7; }

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #333a43;
  border-top-color: #d9ff52;
  border-radius: 50%;
  animation: spin 700ms linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.stage-error {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid #5b2b2b;
  border-radius: 12px;
  color: #e4a2a7;
  background: rgb(91 43 43 / 18%);
  font-size: 12px;
}

.stage-error button {
  flex: none;
  padding: 6px 12px;
  border: 1px solid #7a3f45;
  border-radius: 8px;
  color: #f0c9cc;
  background: transparent;
  font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  cursor: pointer;
}

@media (max-width: 720px) {
  .stage-head { flex-wrap: wrap; }
  .preview-layout { grid-template-columns: 108px minmax(0, 1fr); gap: 12px; }
}
</style>
