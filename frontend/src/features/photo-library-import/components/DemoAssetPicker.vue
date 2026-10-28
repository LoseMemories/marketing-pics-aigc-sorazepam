<script setup lang="ts">
import { onMounted, ref } from "vue";
import { PlayCircleOutlined } from "@ant-design/icons-vue";
import type { LiveAsset } from "@/entities/live-asset/model/live-asset.types";
import { listDemoAssets } from "../api/demo-assets.api";
import type { DemoAsset } from "../model/import-source.types";

const emit = defineEmits<{ selected: [asset: LiveAsset] }>();
const demos = ref<DemoAsset[]>([]);
const loading = ref(true);
const errorMessage = ref("");

onMounted(async () => {
  try {
    demos.value = await listDemoAssets();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "演示资源加载失败。";
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="demo-panel" aria-labelledby="demo-title">
    <div class="section-heading">
      <span class="eyebrow">01 · DEMO SOURCE</span>
      <h2 id="demo-title">使用预置实况样例</h2>
      <p>考虑到您的设备可能没有测试资源，项目已准备好完整实况样例，可直接体验预览与营销动效生成。</p>
    </div>
    <div v-if="loading" class="loading-card">正在准备演示资源…</div>
    <button v-for="demo in demos" :key="demo.slug" class="demo-card" type="button" @click="emit('selected', demo.asset)">
      <img :src="demo.asset.posterUrl" alt="" />
      <span><small>BUILT-IN LIVE ASSET</small><strong>{{ demo.title }}</strong><em>{{ demo.description }}</em></span>
      <PlayCircleOutlined />
    </button>
    <a-alert v-if="errorMessage" :message="errorMessage" type="error" show-icon />
  </section>
</template>

<style scoped>
.demo-panel { display: flex; flex-direction: column; gap: 22px; }
.section-heading h2 { margin: 8px 0; color: #f4f6f8; font-size: clamp(24px, 3vw, 38px); letter-spacing: -0.04em; }
.section-heading p { max-width: 620px; margin: 0; color: #9299a3; line-height: 1.7; }
.eyebrow { color: #d9ff52; font: 600 11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .16em; }
.loading-card { min-height: 210px; display: grid; place-items: center; border: 1px dashed #3a414b; border-radius: 18px; color: #7b838d; }
.demo-card { display: grid; grid-template-columns: 128px 1fr auto; align-items: center; gap: 20px; padding: 14px; border: 1px solid #343a43; border-radius: 18px; color: #e8ebee; text-align: left; background: #14171b; cursor: pointer; }
.demo-card:hover { border-color: #d9ff52; transform: translateY(-2px); }
.demo-card img { width: 128px; height: 150px; border-radius: 11px; object-fit: cover; }
.demo-card span, .demo-card small, .demo-card strong, .demo-card em { display: block; }
.demo-card small { margin-bottom: 10px; color: #d9ff52; font: 600 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .12em; }
.demo-card strong { font-size: 19px; }
.demo-card em { margin-top: 8px; color: #858d97; font-size: 12px; font-style: normal; line-height: 1.6; }
.demo-card > span:last-child { color: #d9ff52; font-size: 27px; }
</style>
