<script setup lang="ts">
import { PauseOutlined, PlayCircleOutlined } from "@ant-design/icons-vue";

defineProps<{
  isPlaying: boolean;
  durationMs: number;
  hasAudio: boolean;
  muted: boolean;
  live: boolean;
}>();

defineEmits<{ toggle: [] }>();
</script>

<template>
  <div class="preview-controls">
    <a-button v-if="live" shape="round" size="large" @click="$emit('toggle')">
      <template #icon>
        <PauseOutlined v-if="isPlaying" />
        <PlayCircleOutlined v-else />
      </template>
      {{ isPlaying ? '停止预览' : '播放实况' }}
    </a-button>
    <span v-else class="static-note">静态图 · 不使用动态轨</span>
    <span v-if="live">
      {{ (durationMs / 1000).toFixed(1) }}s · {{ hasAudio ? (muted ? '原声已关闭' : '原声开启') : '无音轨' }}
    </span>
  </div>
</template>

<style scoped>
.preview-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  color: #808792;
  font-size: 12px;
}

.static-note {
  padding: 7px 12px;
  border: 1px solid #2f353d;
  border-radius: 99px;
  color: #98a0aa;
  font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.08em;
}
</style>
