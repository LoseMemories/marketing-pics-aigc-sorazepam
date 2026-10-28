<script setup lang="ts">
import { onMounted, ref } from "vue";

/**
 * 开发期后端切换器。
 * webpack dev-server 暴露 /__backend：
 *   GET  /__backend            读取当前选中的后端
 *   POST /__backend?name=xxx   切换后端（仅改动代理目标，无需重启 dev-server）
 * 生产构建下该接口不存在，组件自动隐藏。
 */
type BackendName = "local" | "remote";

interface BackendState {
  active: BackendName;
  options: Record<string, string>;
}

const LABELS: Record<BackendName, string> = { local: "本地", remote: "远程" };

const visible = ref(false);
const active = ref<BackendName>("local");
const options = ref<Partial<Record<BackendName, string>>>({});
const switching = ref(false);

async function syncState(): Promise<void> {
  try {
    const res = await fetch("/__backend", { headers: { accept: "application/json" } });
    if (!res.ok) return;
    const data = (await res.json()) as BackendState;
    active.value = data.active;
    options.value = data.options ?? {};
    visible.value = true;
  } catch {
    visible.value = false;
  }
}

async function select(name: BackendName): Promise<void> {
  if (name === active.value || switching.value) return;
  switching.value = true;
  try {
    const res = await fetch(`/__backend?name=${name}`, { method: "POST" });
    if (!res.ok) throw new Error("切换失败");
    active.value = name;
    // 重新加载页面，避免两个后端的图库/任务数据混用
    window.location.reload();
  } catch {
    switching.value = false;
  }
}

onMounted(syncState);
</script>

<template>
  <div v-if="visible" class="backend-switcher" role="group" aria-label="后端环境切换">
    <span class="label">后端</span>
    <button
      v-for="name in (['local', 'remote'] as BackendName[])"
      :key="name"
      type="button"
      class="option"
      :class="{ active: active === name }"
      :disabled="switching"
      :title="options[name] ?? ''"
      @click="select(name)"
    >
      {{ LABELS[name] }}
    </button>
  </div>
</template>

<style scoped>
.backend-switcher {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px 3px 10px;
  border: 1px solid #2b3038;
  border-radius: 999px;
  background: #14171c;
}

.label {
  color: #7b828c;
  font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.08em;
}

.option {
  padding: 5px 11px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #9aa3ad;
  font: 500 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.option:hover:not(:disabled):not(.active) {
  background: #1e222a;
  color: #dfe4ea;
}

.option.active {
  background: #d9ff52;
  color: #161b20;
  font-weight: 600;
}

.option:disabled {
  cursor: progress;
  opacity: 0.6;
}
</style>
