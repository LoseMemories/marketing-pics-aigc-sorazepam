<script setup lang="ts">
import { ref } from "vue";
import LiveWorkbenchPage from "@/pages/live-workbench/LiveWorkbenchPage.vue";
import GalleryPage from "@/pages/gallery/GalleryPage.vue";
import FontGalleryPage from "@/pages/fonts/FontGalleryPage.vue";
import WorkflowPage from "@/pages/workflow/WorkflowPage.vue";
import DocsPage from "@/pages/docs/DocsPage.vue";
import BackendSwitcher from "@/shared/components/BackendSwitcher.vue";

type View = "workbench" | "gallery" | "fonts" | "workflow" | "docs";

const PATHS: Record<View, string> = {
  workbench: "/",
  gallery: "/inspiration",
  workflow: "/workflow",
  fonts: "/fonts",
  docs: "/docs"
};

/** 解析路径首段 → 视图；未知段返回 null（由调用方决定兜底）。 */
function knownViewFromPath(path: string): View | null {
  const seg = path.replace(/\/+$/, "").split("/").filter(Boolean)[0] ?? "";
  if (!seg) return "workbench";
  return (Object.keys(PATHS) as View[]).find((v) => PATHS[v].replace(/^\//, "") === seg) ?? null;
}

const view = ref<View>("workbench");

/** 未知路由 → 重置到首页，并把地址栏一起改掉（replace，不污染历史） */
function syncRouteFromLocation(): void {
  const next = knownViewFromPath(location.pathname);
  if (next === null) {
    history.replaceState({ v: "workbench" }, "", PATHS.workbench);
    view.value = "workbench";
    return;
  }
  view.value = next;
}

syncRouteFromLocation();

/** 前端路由：pushState + popstate，浏览器前进/后退可用 */
function go(v: View, replace = false) {
  if (v === view.value) return;
  if (replace) history.replaceState({ v }, "", PATHS[v]);
  else history.pushState({ v }, "", PATHS[v]);
  view.value = v;
  window.scrollTo({ top: 0 });
}

function back() {
  if (history.length > 1) history.back();
  else go("gallery", true);
}

window.addEventListener("popstate", syncRouteFromLocation);
</script>

<template>
  <div>
    <header class="app-banner">
      <a href="#" class="brand" aria-label="Marketing Photo AIGC 首页">
        <svg viewBox="0 0 6 6" width="28" height="28" class="heat-mark" aria-hidden="true">
          <rect x="0" y="0" width="1" height="1" fill="#161b20" />
          <rect x="1" y="0" width="1" height="1" fill="#161b20" />
          <rect x="2" y="0" width="1" height="1" fill="#161b20" />
          <rect x="3" y="0" width="1" height="1" fill="#3d8ae0" />
          <rect x="4" y="0" width="1" height="1" fill="#161b20" />
          <rect x="5" y="0" width="1" height="1" fill="#161b20" />
          <rect x="0" y="1" width="1" height="1" fill="#161b20" />
          <rect x="1" y="1" width="1" height="1" fill="#7f9c2b" />
          <rect x="2" y="1" width="1" height="1" fill="#7f9c2b" />
          <rect x="3" y="1" width="1" height="1" fill="#3d8ae0" />
          <rect x="4" y="1" width="1" height="1" fill="#161b20" />
          <rect x="5" y="1" width="1" height="1" fill="#161b20" />
          <rect x="0" y="2" width="1" height="1" fill="#161b20" />
          <rect x="1" y="2" width="1" height="1" fill="#7f9c2b" />
          <rect x="2" y="2" width="1" height="1" fill="#d9ff52" />
          <rect x="3" y="2" width="1" height="1" fill="#d9ff52" />
          <rect x="4" y="2" width="1" height="1" fill="#7f9c2b" />
          <rect x="5" y="2" width="1" height="1" fill="#161b20" />
          <rect x="0" y="3" width="1" height="1" fill="#161b20" />
          <rect x="1" y="3" width="1" height="1" fill="#7f9c2b" />
          <rect x="2" y="3" width="1" height="1" fill="#d9ff52" />
          <rect x="3" y="3" width="1" height="1" fill="#d9ff52" />
          <rect x="4" y="3" width="1" height="1" fill="#7f9c2b" />
          <rect x="5" y="3" width="1" height="1" fill="#3fc8d8" />
          <rect x="0" y="4" width="1" height="1" fill="#161b20" />
          <rect x="1" y="4" width="1" height="1" fill="#161b20" />
          <rect x="2" y="4" width="1" height="1" fill="#7f9c2b" />
          <rect x="3" y="4" width="1" height="1" fill="#7f9c2b" />
          <rect x="4" y="4" width="1" height="1" fill="#3d8ae0" />
          <rect x="5" y="4" width="1" height="1" fill="#161b20" />
          <rect x="0" y="5" width="1" height="1" fill="#161b20" />
          <rect x="1" y="5" width="1" height="1" fill="#161b20" />
          <rect x="2" y="5" width="1" height="1" fill="#161b20" />
          <rect x="3" y="5" width="1" height="1" fill="#161b20" />
          <rect x="4" y="5" width="1" height="1" fill="#161b20" />
          <rect x="5" y="5" width="1" height="1" fill="#161b20" />
        </svg>
        <span>MARKETING PHOTO <b>AIGC</b></span>
      </a>
      <nav class="banner-nav">
        <button :class="{ active: view === 'workbench' }" @click="go('workbench')">工作台</button>
        <button :class="{ active: view === 'gallery' }" @click="go('gallery')">灵感</button>
        <button :class="{ active: view === 'fonts' }" @click="go('fonts')">字体库</button>
        <button :class="{ active: view === 'docs' }" @click="go('docs')">产品文档</button>
      </nav>
      <BackendSwitcher class="banner-backend" />
    </header>

    <LiveWorkbenchPage v-if="view === 'workbench'" />
    <GalleryPage v-else-if="view === 'gallery'" @open-workflow="go('workflow')" />
    <WorkflowPage v-else-if="view === 'workflow'" @back="back" />
    <FontGalleryPage v-else-if="view === 'fonts'" />
    <DocsPage v-else />
  </div>
</template>

<style scoped>
.app-banner {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 34px;
  height: 68px;
  padding: 0 4vw;
  border-bottom: 1px solid #242830;
  background: rgb(12 14 17 / 82%);
  backdrop-filter: blur(14px);
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  color: #e8ebee;
  font: 600 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.07em;
  text-decoration: none;
}

.banner-backend {
  margin-left: auto;
}
.brand b { color: #d9ff52; }
.heat-mark {
  display: block;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  overflow: hidden;
  background: #0b0d10;
  box-shadow: 0 0 0 1px #2b333b;
}

.banner-nav {
  display: flex;
  gap: 26px;
}
.banner-nav button {
  padding: 3px 0;
  border: 0;
  border-bottom: 1.5px solid transparent;
  color: #8f979f;
  background: transparent;
  font: 600 11px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: color 140ms ease, border-color 140ms ease;
}
.banner-nav button:hover {
  color: #e8ebee;
}
.banner-nav button.active {
  color: #d9ff52;
  border-bottom-color: #d9ff52;
}
</style>
