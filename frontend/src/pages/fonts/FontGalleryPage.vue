<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { FONT_CATALOG } from "@/shared/fonts/font-catalog";
import { kbOf } from "@/shared/fonts/font-tags";

const selected = ref<"all" | "en" | "zh">("all");
const customText = ref("");

// 完整覆盖简体中文的字体（缺字的日系字体不显示，文件仍保留在项目中）
const FULL_ZH = new Set([
  "LXGW WenKai", "LXGW WenKai TC", "Liu Jian Mao Cao", "Long Cang", "Ma Shan Zheng",
  "Noto Sans SC", "Noto Serif SC", "ZCOOL KuaiLe", "ZCOOL QingKe HuangYou", "ZCOOL XiaoWei", "Zhi Mang Xing",
  "Smiley Sans", "Yozai", "NaikaiFont", "HarmonyOS Sans SC", "MiSans",
  "DingTalk JinBuTi", "Alimama DaoLiTi", "TaoBao MaiCaiTi", "Alimama ShuHeiTi", "Alimama DongFangDaKai", "Alimama FangYuanTi"
]);

function isFullZh(f: { name: string; lang: string }): boolean {
  return f.lang === "zh" && FULL_ZH.has(f.name);
}

// 只显示英文 + 完整中文；缺字的中文（日系字体）不显示
const visible = computed(() => FONT_CATALOG.filter((f) => f.lang === "en" || isFullZh(f)));

const CHUNK = 24;

/** 按分类过滤后的完整列表（懒加载的数据源） */
const allItems = computed(() => {
  const base =
    selected.value === "all"
      ? visible.value
      : selected.value === "en"
        ? visible.value.filter((f) => f.lang === "en")
        : visible.value.filter((f) => f.lang === "zh");
  return base.map((f) => ({ ...f, kb: kbOf(f.name) }));
});

const shuffled = ref<Array<(typeof allItems.value)[number]>>([]);
const shown = ref(CHUNK);
/** 当前只渲染已加载的部分，滚到底部再追加 */
const items = computed(() => shuffled.value.slice(0, shown.value));

const sentinelRef = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

/** 随机排布：切换分类时重排一次，避免同类字体扎堆 */
function reshuffle(): void {
  const list = [...allItems.value];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = list[i];
    const b = list[j];
    if (a === undefined || b === undefined) continue;
    list[i] = b;
    list[j] = a;
  }
  shuffled.value = list;
  shown.value = CHUNK;
}

function attachObserver(): void {
  observer?.disconnect();
  observer = null;
  const el = sentinelRef.value;
  if (!el) return;
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting) && shown.value < shuffled.value.length) {
        shown.value += CHUNK;
      }
    },
    { rootMargin: "500px 0px" }
  );
  observer.observe(el);
}

watch(selected, () => reshuffle(), { immediate: true });
onMounted(async () => {
  await nextTick();
  attachObserver();
});
onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

const enCount = computed(() => visible.value.filter((f) => f.lang === "en").length);
const zhCount = computed(() => visible.value.filter((f) => f.lang === "zh").length);

const hasCustom = computed(() => customText.value.trim().length > 0);

function defaultSample(lang: string): { a: string; b: string } {
  return lang === "zh" ? { a: "营销图博客", b: "即刻生成" } : { a: "Photo Blog", b: "Marketing AIGC" };
}
</script>

<template>
  <section class="gallery">
    <header class="gallery-head">
      <div>
        <span class="eyebrow">FONT LIBRARY</span>
        <h2>字体库</h2>
        <p class="summary">
          共 {{ visible.length }} 款 · 英文 {{ enCount }} · 完整中文 {{ zhCount }}（免费可商用）
        </p>
      </div>
    </header>

    <div class="input-row">
      <input
        v-model="customText"
        type="text"
        placeholder="输入自定义文案，实时预览所有字体效果（留空显示默认）"
      />
      <button v-if="hasCustom" class="clear-btn" @click="customText = ''">清除</button>
    </div>

    <nav class="cat-tabs">
      <button :class="{ active: selected === 'all' }" @click="selected = 'all'">全部 · {{ visible.length }}</button>
      <button :class="{ active: selected === 'en' }" @click="selected = 'en'">英文 · {{ enCount }}</button>
      <button :class="{ active: selected === 'zh' }" @click="selected = 'zh'">中文 · {{ zhCount }}</button>
    </nav>

    <div class="grid">
      <article v-for="f in items" :key="f.name" class="card">
        <div class="sample" :style="{ fontFamily: `'${f.family}', 'Noto Sans SC', sans-serif` }">
          <template v-if="hasCustom">
            <span class="sample-a">{{ customText }}</span>
          </template>
          <template v-else>
            <span class="sample-a">{{ defaultSample(f.lang).a }}</span>
            <span class="sample-b">{{ defaultSample(f.lang).b }}</span>
          </template>
        </div>
        <div class="meta">
          <div class="title">{{ f.name }}</div>
          <div class="row">
            <span class="lang" :class="f.lang">{{ f.lang === "zh" ? "中文" : "EN" }}</span>

            <div class="tag-wrap">
              <span class="tag-icon" aria-label="查看标签">🏷</span>
              <div v-if="f.kb" class="tag-pop">
                <div class="tag-row"><b>场景</b><span>{{ f.kb.tags.scenes.join(" · ") }}</span></div>
                <div class="tag-row"><b>用户</b><span>{{ f.kb.tags.audience.join(" · ") }}</span></div>
                <div class="tag-row"><b>复杂度</b><span>{{ f.kb.tags.complexity }}</span></div>
                <div class="tag-row"><b>风格</b><span>{{ f.kb.tags.styles.join(" · ") }}</span></div>
                <div class="tag-desc">{{ f.kb.description }}</div>
              </div>
            </div>

            <span class="cat">{{ f.category }}</span>
          </div>
        </div>
      </article>
    </div>

    <div ref="sentinelRef" class="feed-sentinel" aria-live="polite">
      <span v-if="shown < shuffled.length">加载更多…</span>
      <span v-else>共 {{ allItems.length }} 款，已全部展示</span>
    </div>
  </section>
</template>

<style scoped>
.gallery {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 32px 4vw 60px;
}

.gallery-head .eyebrow {
  color: #d9ff52;
  font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.16em;
}
.gallery-head h2 {
  margin: 8px 0 4px;
  color: #f3f5f7;
  font-size: 28px;
}
.gallery-head .summary {
  margin: 0;
  color: #8f969f;
  font-size: 13px;
}

.input-row { display: flex; gap: 8px; align-items: center; }
.input-row input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #39414b;
  border-radius: 10px;
  color: #eef2f5;
  background: #0b0d10;
  font-size: 14px;
}
.input-row input:focus { border-color: #d9ff52; outline: none; }
.input-row input::placeholder { color: #565e68; }
.clear-btn {
  padding: 8px 14px;
  border: 1px solid #39414b;
  border-radius: 10px;
  color: #c8d0d8;
  background: transparent;
  font-size: 12px;
  cursor: pointer;
}
.clear-btn:hover { border-color: #d9ff52; color: #fff; }

.cat-tabs { display: flex; flex-wrap: wrap; gap: 8px; }
.cat-tabs button {
  padding: 6px 14px;
  border: 1px solid #39414b;
  border-radius: 99px;
  color: #c8d0d8;
  background: #0b0d10;
  font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  cursor: pointer;
  transition: border-color 140ms ease, color 140ms ease;
}
.cat-tabs button:hover { border-color: #d9ff52; color: #fff; }
.cat-tabs button.active { border-color: #d9ff52; color: #11140c; background: #d9ff52; }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }

/* 懒加载哨兵：接近底部时自动追加下一批 */
.feed-sentinel {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  color: #6f767f;
  font: 500 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.05em;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid #242830;
  border-radius: 14px;
  background: #101216;
}

.sample {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 18px 14px;
  border-radius: 9px;
  background: #0b0d10;
  line-height: 1.15;
  min-height: 90px;
  overflow: hidden;
}
.sample-a { color: #f3f5f7; font-size: 26px; font-weight: 700; word-break: break-all; }
.sample-b { color: #d9ff52; font-size: 17px; font-weight: 500; }

.meta { display: flex; flex-direction: column; gap: 6px; }
.title {
  overflow: hidden;
  color: #eef2f5;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.lang {
  padding: 1px 6px;
  border-radius: 5px;
  font: 600 9px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.lang.en { color: #9fc3ff; background: rgb(90 140 255 / 14%); }
.lang.zh { color: #d9ff52; background: rgb(217 255 82 / 14%); }

/* 标签悬浮 */
.tag-wrap { position: relative; }
.tag-icon {
  display: inline-block;
  font-size: 12px;
  line-height: 1;
  cursor: help;
  opacity: 0.65;
  transition: opacity 140ms ease;
}
.tag-wrap:hover .tag-icon { opacity: 1; }
.tag-pop {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  z-index: 30;
  width: 240px;
  padding: 10px 12px;
  border: 1px solid #39414b;
  border-radius: 10px;
  background: #14171c;
  box-shadow: 0 12px 32px rgb(0 0 0 / 55%);
  text-align: left;
  opacity: 0;
  pointer-events: none;
  transform: translateY(4px);
  transition: opacity 140ms ease, transform 140ms ease;
}
.tag-wrap:hover .tag-pop {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}
.tag-row {
  display: flex;
  gap: 8px;
  font-size: 11px;
  line-height: 1.5;
  color: #c8d0d8;
}
.tag-row b {
  flex: 0 0 40px;
  color: #d9ff52;
  font-weight: 600;
}
.tag-row span { flex: 1; word-break: break-all; }
.tag-desc {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #242830;
  color: #9aa3ad;
  font-size: 10.5px;
  line-height: 1.6;
}

.cat { overflow: hidden; color: #8f969f; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
</style>
