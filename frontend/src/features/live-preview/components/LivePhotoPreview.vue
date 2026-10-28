<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { AudioMutedOutlined, SoundOutlined } from "@ant-design/icons-vue";
import type { LiveAsset } from "@/entities/live-asset/model/live-asset.types";
import PreviewControls from "./PreviewControls.vue";
import { usePressToPlay } from "../composables/usePressToPlay";

const props = defineProps<{ asset: LiveAsset; showHeading?: boolean; live?: boolean }>();
const emit = defineEmits<{ "update:live": [value: boolean] }>();
const video = ref<HTMLVideoElement>();
const { isPlaying, currentTimeMs, stop, toggle, onPointerDown, onPointerUp } =
  usePressToPlay(video);

/** 默认静音，由用户主动开启原声。 */
const muted = ref(true);
/** 实况开关：关闭后不再使用视频轨，按静态图处理。 */
const liveEnabled = computed(() => props.live !== false);

const displayDimensions = computed(() => {
  const rotated = Math.abs(props.asset.rotation) % 180 === 90;
  return rotated
    ? { width: props.asset.height, height: props.asset.width }
    : { width: props.asset.width, height: props.asset.height };
});

const aspectRatio = computed(
  () => `${displayDimensions.value.width} / ${displayDimensions.value.height}`
);

watch(() => props.asset.id, () => {
  stop();
  muted.value = true;
});

function toggleSound(): void {
  muted.value = !muted.value;
  if (video.value) video.value.muted = muted.value;
}

function syncMute(): void {
  if (video.value) video.value.muted = muted.value;
}

function toggleLive(): void {
  stop();
  emit("update:live", !liveEnabled.value);
}

function handlePointerDown(event: PointerEvent): void {
  if (!liveEnabled.value) return;
  onPointerDown(event);
}

function handlePointerUp(): void {
  if (!liveEnabled.value) return;
  onPointerUp();
}
</script>

<template>
  <section class="preview-shell" aria-labelledby="preview-title">
    <div v-if="showHeading !== false" class="preview-heading">
      <div>
        <span class="eyebrow">01 · PREVIEW</span>
        <h2 id="preview-title">预览</h2>
      </div>
      <span class="ready-dot">READY</span>
    </div>

    <div class="frame-slot">
      <div
        class="media-frame"
        :style="{ aspectRatio }"
        :role="liveEnabled ? 'button' : 'img'"
        tabindex="0"
        :aria-label="liveEnabled ? '按住播放实况' : '静态照片预览'"
        @pointerdown="handlePointerDown"
        @pointerup="handlePointerUp"
        @pointercancel="handlePointerUp"
        @pointerleave="isPlaying && handlePointerUp()"
        @keydown.space.prevent="liveEnabled && toggle()"
      >
        <img :src="asset.posterUrl" alt="实况静态主图" draggable="false" />
        <video
          ref="video"
          :key="asset.id"
          :src="asset.videoUrl"
          :class="{ visible: isPlaying }"
          playsinline
          preload="metadata"
          @loadedmetadata="syncMute"
          @ended="stop"
        />
        <button
          type="button"
          class="live-toggle"
          :class="{ 'is-off': !liveEnabled }"
          :aria-pressed="liveEnabled"
          :title="liveEnabled ? '关闭实况，按静态图处理' : '开启实况'"
          @pointerdown.stop
          @pointerup.stop
          @click.stop="toggleLive"
        >
          <i />{{ liveEnabled ? "LIVE" : "STILL" }}
        </button>

        <div class="frame-actions">
          <button
            v-if="liveEnabled && asset.hasAudio"
            type="button"
            class="sound-toggle"
            :aria-pressed="!muted"
            :title="muted ? '开启原声' : '关闭原声'"
            @pointerdown.stop
            @click.stop="toggleSound"
          >
            <SoundOutlined v-if="!muted" />
            <AudioMutedOutlined v-else />
            <span>{{ muted ? "静音" : "原声" }}</span>
          </button>
          <span v-if="liveEnabled && !isPlaying" class="hold-hint">按住画面播放</span>
        </div>

        <slot
          name="overlay"
          :current-time-ms="currentTimeMs"
          :playing="isPlaying"
          :media-width="displayDimensions.width"
          :media-height="displayDimensions.height"
        />
      </div>
    </div>

    <PreviewControls
      :is-playing="isPlaying"
      :duration-ms="asset.durationMs"
      :has-audio="asset.hasAudio"
      :muted="muted"
      :live="liveEnabled"
      @toggle="toggle"
    />
  </section>
</template>

<style scoped>
.preview-shell {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
  min-height: 0;
}

.preview-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}

.preview-heading h2 {
  margin: 6px 0 0;
  color: #f4f6f8;
  font-size: 20px;
  letter-spacing: -0.03em;
}

.eyebrow {
  color: #d9ff52;
  font: 600 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.16em;
}

.ready-dot {
  padding: 6px 9px;
  border: 1px solid rgb(217 255 82 / 28%);
  border-radius: 99px;
  color: #d9ff52;
  font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
}

.frame-slot {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.media-frame {
  position: relative;
  flex: 0 0 auto;
  height: 100%;
  width: auto;
  max-width: 100%;
  overflow: hidden;
  border: 1px solid #2d323a;
  border-radius: 22px;
  background: #090a0c;
  cursor: pointer;
  user-select: none;
  touch-action: none;
}

.media-frame img,
.media-frame video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.media-frame video {
  opacity: 0;
  transition: opacity 80ms linear;
}

.media-frame video.visible { opacity: 1; }

.live-toggle {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: 99px;
  color: white;
  font: 700 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.08em;
  backdrop-filter: blur(12px);
  background: rgb(0 0 0 / 32%);
  cursor: pointer;
  transition: border-color 140ms ease, color 140ms ease;
}

.live-toggle:hover { border-color: rgb(217 255 82 / 45%); }

.live-toggle i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #d9ff52;
  box-shadow: 0 0 10px #d9ff52;
}

.live-toggle.is-off {
  color: #a9b0b8;
}

.live-toggle.is-off i {
  background: #6b727b;
  box-shadow: none;
}

.frame-actions {
  position: absolute;
  left: 14px;
  bottom: 14px;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 8px;
}

.hold-hint {
  padding: 8px 11px;
  border: 1px solid transparent;
  border-radius: 99px;
  color: white;
  font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.08em;
  backdrop-filter: blur(12px);
  background: rgb(0 0 0 / 42%);
  white-space: nowrap;
}

.sound-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 11px;
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: 99px;
  color: #f2f4f6;
  background: rgb(0 0 0 / 42%);
  backdrop-filter: blur(12px);
  font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: color 140ms ease, border-color 140ms ease;
}

.sound-toggle:hover {
  color: #d9ff52;
  border-color: rgb(217 255 82 / 45%);
}
</style>
