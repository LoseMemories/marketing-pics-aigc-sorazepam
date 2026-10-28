<script setup lang="ts">
const emit = defineEmits<{ (e: "open-workflow"): void }>();
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  ClockCircleOutlined,
  DiffOutlined,
  LoadingOutlined,
  ReloadOutlined,
  StarFilled,
  StarOutlined
} from "@ant-design/icons-vue";
import StaticImage from "@/shared/StaticImage.vue";
import VocabPanel from "@/shared/VocabPanel.vue";

interface SubGeometry {
  id: string;
  category?: string;
  region?: number[];
  areaRatio?: number;
  importance?: number;
  occlusionPreference?: string;
  isOccluded?: boolean;
  occlusionBy?: string;
  occlusionColors?: string[];
  bbox?: { x: number; y: number; w: number; h: number };
  margins?: { top: number; bottom: number; left: number; right: number };
  mainColor?: string;
}
interface TextGeometry {
  id: string;
  level?: string;
  content?: string;
  region?: number[];
  fontStyle?: string;
  color?: string;
  orientation?: string;
}
interface Relation {
  textId: string;
  subjectId: string;
  type?: string;
  detail?: string;
}
interface Vocabulary {
  semanticSummary: string | null;
  embeddingText: string | null;
  geometry: { subjects: SubGeometry[]; texts: TextGeometry[]; relations: Relation[] } | null;
  style: {
    composition?: string;
    whitespace?: number;
    colorTone?: string[];
    styleTags?: string[];
    texture?: string;
    palette?: { maincolor?: string; vicecolor?: string; textColors?: string[] };
    textStyles?: Array<{ textId: string; fontStyle?: string; color?: string }>;
  } | null;
  scene: { sceneTags?: string[]; emotionTags?: string[]; purpose?: string; intent?: string; series?: string } | null;
  designGuidance?: {
    sceneSubject?: string;
    initialOcclusion?: string;
    actualOcclusion?: string;
    copyDesign?: string;
  } | null;
  grid: { cols: number; rows: number } | null;
  texts: Array<{
    id?: string; level?: string; content?: string | null; color?: string;
    emphasis?: string; align?: string; inSubject?: boolean; source?: string;
  }> | null;
  subjects: Array<Record<string, any>> | null;
  composition: {
    pattern?: string; focal?: string; balance?: string;
    readingOrder?: string[]; whitespace?: number; subjectTextRelation?: string;
  } | null;
  meta: Record<string, unknown> | null;
}
interface GalleryItem {
  title: string;
  category: string;
  free: boolean;
  hasPrompt: boolean;
  promptLen: number;
  image: string;
  imageUrl: string;
  promptUrl: string | null;
  hasAnalysis: boolean;
  batchId: string | null;
  /** 后端扫描时标记：存在重分析候选（`<base>.rerun.analysis.json`） */
  pendingRerun: boolean;
  favorite: boolean;
  autoCategory: string | null;
  tags: string[];
  vocabulary: Vocabulary | null;
  detection: {
    subjectCount: number;
    heatGrid: number[];
    cols: number;
    rows: number;
    colorGrid: Array<{ region: number; color: string; layer: string }> | null;
    textGrid: number[] | null;
    width: number;
    height: number;
  } | null;
}
interface GalleryFolder {
  id: string; title: string; total: number; done: number; failed: number;
  status: string; createdAt: number; cover: string | null;
}
interface GalleryData {
  categories: string[];
  folders?: GalleryFolder[];
  items: GalleryItem[];
  total: number;
  freeCount: number;
  paidCount: number;
  analysisCount?: number;
}

interface ReanalyzePayload {
  mode?: string;
  category: string;
  base: string;
  title: string;
  old: Record<string, any> | null;
  next: Record<string, any> | null;
  oldDetection?: Record<string, any> | null;
  nextDetection?: Record<string, any> | null;
}

interface CompareEntry {
  key: string;
  category: string;
  base: string;
  title: string;
  old: Record<string, any> | null;
  next: Record<string, any> | null;
  oldDetection: Record<string, any> | null;
  nextDetection: Record<string, any> | null;
}

const data = ref<GalleryData | null>(null);
const loading = ref(true);
const selected = ref("all");
const gridRef = ref<HTMLElement | null>(null);
const gridW = ref(0);
const GAP = 16;
const MIN_H = 168;    // 低于此行高就换行
const FLOOR_H = 150;  // 极端情况的高度下限
const MAX_H = 250;    // 单张超宽图不被拉爆
const NORMAL_H = 190; // 末行不撑满时的正常行高

/** 打乱 + 按分类轮转交错，避免同类扎堆 */
function interleave(list: GalleryItem[]): GalleryItem[] {
  const groups = new Map<string, GalleryItem[]>();
  for (const it of list) {
    if (!groups.has(it.category)) groups.set(it.category, []);
    groups.get(it.category)!.push(it);
  }
  const keys = [...groups.keys()].sort(() => Math.random() - 0.5);
  for (const k of keys) groups.get(k)!.sort(() => Math.random() - 0.5);
  const out: GalleryItem[] = [];
  let alive = true;
  while (alive) {
    alive = false;
    for (const k of keys) {
      const g = groups.get(k)!;
      if (g.length) {
        out.push(g.shift()!);
        alive = true;
      }
    }
  }
  return out;
}

const ordered = ref<GalleryItem[]>([]);
const folders = ref<GalleryFolder[]>([]);
const folderId = ref<string | null>(null);

function folderFromPath(): string | null {
  const m = location.pathname.match(/\/inspiration\/folder\/([^/]+)/);
  const id = m?.[1];
  return id ? decodeURIComponent(id) : null;
}
function openFolder(id: string) {
  history.pushState({}, "", `/inspiration/folder/${encodeURIComponent(id)}`);
  folderId.value = id;
  window.scrollTo({ top: 0 });
}
function closeFolder() {
  history.pushState({}, "", "/inspiration");
  folderId.value = null;
}

/** 分类筛选：文件夹里点其他分类时直接退出文件夹，回到该分类视角。 */
function selectCategory(category: string) {
  if (folderId.value) closeFolder();
  statusFilter.value = "";
  selected.value = category;
  window.scrollTo({ top: 0 });
  // 分类变了就重建分页会话，带分类参数向后端重新查询
  void resetFeed();
}

function selectStatus(status: "favorite" | "retrying" | "needs-update") {
  if (folderId.value) closeFolder();
  statusFilter.value = statusFilter.value === status ? "" : status;
  if (statusFilter.value) selected.value = "all";
  window.scrollTo({ top: 0 });
}

function onMobileFilterChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  if (value.startsWith("status:")) {
    if (folderId.value) closeFolder();
    statusFilter.value = value.slice(7) as "favorite" | "retrying" | "needs-update";
    selected.value = "all";
    window.scrollTo({ top: 0 });
    return;
  }
  selectCategory(value.slice(4));
}
const currentFolder = computed(() =>
  folderId.value ? folders.value.find((f) => f.id === folderId.value) ?? null : null
);
const showFolders = computed(
  () => !folderId.value && !statusFilter.value && folders.value.length > 0 && selected.value === "uploads"
);

const DICTIONARY_CATEGORIES = new Set([
  "3d", "creative", "ecommerce", "landingpage", "magazine", "technology", "travel"
]);

/** 06 识别的确切分类；没有或不在字典内 → null（未归类）。 */
function autoCategoryOf(item: GalleryItem): string | null {
  if (item.autoCategory && DICTIONARY_CATEGORIES.has(item.autoCategory)) return item.autoCategory;
  const fromTags = item.tags?.find((t) => DICTIONARY_CATEGORIES.has(t));
  return fromTags ?? null;
}

/** 用于筛选的分类：上传素材优先用 06 识别的类别，否则归在「未归类」（不出现在确切分类页）。 */
function effectiveCategoryOf(item: GalleryItem): string {
  if (item.category !== "uploads") return item.category;
  return autoCategoryOf(item) ?? "unclassified";
}

const filtered = computed(() => {
  const all = data.value?.items ?? [];
  if (statusFilter.value === "favorite") return all.filter((x) => x.favorite);
  if (statusFilter.value === "retrying") return all.filter((x) => Boolean(retryStates.value[keyOf(x)]));
  if (statusFilter.value === "needs-update") return all.filter((x) => Boolean(compareByKey.value[keyOf(x)]));
  // 文件夹内只看该批次
  if (folderId.value) return all.filter((x) => x.batchId === folderId.value);
  // 「全部」用随机穿插顺序；批次素材也打散，不在全部分类下以文件夹出现
  if (selected.value === "all") return ordered.value;
  if (selected.value === "uploads") {
    // 「上传」筛选：显示文件夹 + 单张上传；批次素材收在文件夹里，不再散落
    const batchIds = new Set(folders.value.map((f) => f.id));
    return all.filter((x) => x.category === "uploads" && !(x.batchId && batchIds.has(x.batchId)));
  }
  // 确切分类：单张与批次素材都分散展示（只要 06 识别到了该类）
  return all.filter((x) => effectiveCategoryOf(x) === selected.value);
});

/* ---------- 展示辅助 ---------- */
function styleTagText(item: GalleryItem): string {
  const tags = item.vocabulary?.style?.styleTags ?? [];
  if (tags.length) return tags.slice(0, 2).join(" / ");
  return item.vocabulary?.style?.composition ?? "";
}

/* 分类显示名（内部 key 保持目录名不变） */
const CAT_LABEL: Record<string, string> = {
  "3d": "3D",
  creative: "创意",
  ecommerce: "电商",
  hero: "hero主页",
  landingpage: "hero主页",
  magazine: "杂志",
  technology: "科技",
  travel: "旅行",
  uploads: "上传"
};
/** 卡片类别：上传素材取 06 识别的字典分类，未识别显示「未归类」 */
function itemCat(item: GalleryItem): string {
  if (item.category !== "uploads") return catLabel(item.category);
  const auto = autoCategoryOf(item);
  return auto ? catLabel(auto) : "未归类";
}

function catLabel(c: string): string {
  return CAT_LABEL[c] ?? c;
}

function arOf(item: GalleryItem): number {
  const w = item.detection?.width || 0;
  const h = item.detection?.height || 0;
  return w > 0 && h > 0 ? w / h : 1.33;
}

type RowCard = { item: GalleryItem; w: number };
type JRow = { h: number; cards: RowCard[] };

const rows = computed<JRow[]>(() => {
  const W = gridW.value || 1310;
  const out: JRow[] = [];
  let cur: GalleryItem[] = [];
  let sumAr = 0;
  let normalH = 0;

  const flush = () => {
    if (!cur.length) return;
    const usable = W - (cur.length - 1) * GAP;
    const h = Math.max(FLOOR_H, Math.min(MAX_H, usable / sumAr));
    // 记录第一行真正「排满但不触顶」的高度，作为末行的正常尺寸
    if (!normalH && h > FLOOR_H && h < MAX_H) normalH = h;
    out.push({ h, cards: cur.map((it) => ({ item: it, w: h * arOf(it) })) });
    cur = [];
    sumAr = 0;
  };

  for (const it of filtered.value) {
    const ar = arOf(it);
    if (cur.length > 0) {
      // 并入这张会让行高跌破 MIN_H → 先收行
      const h = (W - cur.length * GAP) / (sumAr + ar);
      if (h < MIN_H) flush();
    }
    cur.push(it);
    sumAr += ar;
  }
  flush();

  // 最后一行不强行撑满，也不要比前面的行更大；靠左对齐即可
  const last = out[out.length - 1];
  if (last) {
    const prev = out[out.length - 2];
    const cap = normalH || prev?.h || NORMAL_H;
    if (last.h > cap) {
      last.h = cap;
      for (const c of last.cards) c.w = cap * arOf(c.item);
    }
  }
  return out;
});

/* 容器宽度感知：只认宽度变化，且延后一帧测量，
   避免「行重排 → 容器高度变化 → 再触发观察」的同步循环 */
let ro: ResizeObserver | null = null;
let roRaf = 0;
function measureGrid() {
  roRaf = 0;
  const el = gridRef.value;
  if (!el) return;
  const w = el.clientWidth;
  if (Math.abs(w - gridW.value) > 0.5) gridW.value = w;
}
function attachGridObserver() {
  ro?.disconnect();
  ro = null;
  const el = gridRef.value;
  if (!el) return;
  measureGrid();
  ro = new ResizeObserver(() => {
    if (roRaf) return;
    roRaf = requestAnimationFrame(measureGrid);
  });
  ro.observe(el);
}
watch(loading, async (v) => {
  if (!v) { await nextTick(); attachGridObserver(); }
});
onMounted(async () => {
  folderId.value = folderFromPath();
  window.addEventListener("popstate", syncFolderFromPath);
  document.addEventListener("pointerdown", onDocumentPointerDown);
  mobileMedia = window.matchMedia("(max-width: 720px)");
  isMobile.value = mobileMedia.matches;
  mobileMedia.addEventListener("change", onMobileMediaChange);
  await resetFeed();
  void syncRetryEnabled();
  await nextTick();
  attachGridObserver();
  attachFeedObserver();
});

function onMobileMediaChange(event: MediaQueryListEvent): void {
  isMobile.value = event.matches;
}

function syncFolderFromPath() {
  folderId.value = folderFromPath();
  void resetFeed();
}
onBeforeUnmount(() => {
  window.clearTimeout(popTimer);
  window.clearTimeout(pollTimer);
  window.clearTimeout(noticeTimer);
  window.clearTimeout(compareHideTimer);
  window.clearTimeout(retryStatusTimer);
  mobileMedia?.removeEventListener("change", onMobileMediaChange);
  window.removeEventListener("popstate", syncFolderFromPath);
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  window.clearTimeout(hideTimer);
  if (roRaf) cancelAnimationFrame(roRaf);
  ro?.disconnect();
  ro = null;
  feedObserver?.disconnect();
  feedObserver = null;
});

const error = ref("");
let pollTimer = 0;

/* ---------- 懒加载 feed ---------- */
const feedSession = ref("");
const feedExhausted = ref(false);
const feedLoading = ref(false);
const feedTotals = ref<Record<string, number>>({});
/** 筛选区全量统计（独立接口，与懒加载无关） */
const stats = ref<{
  total: number;
  categories: Array<{ name: string; total: number }>;
  favorite: number;
  analyzed: number;
  needsUpdate: number;
  uploads: { folders: number; folderItems: number; singles: number };
} | null>(null);
const sentinelRef = ref<HTMLElement | null>(null);
let feedObserver: IntersectionObserver | null = null;

/** 当前分类参数：全部 / 上传 传空，由后端兜底；其余传具体分类。 */
function categoryParam(): string {
  if (selected.value === "all" || selected.value === "uploads") return "";
  return selected.value;
}

/** 视口尺寸交给后端推算批量（后端按列宽/行高估 1.5 倍窗口量）。 */
function viewportSize(): { vw: number; vh: number } {
  return {
    vw: Math.round(gridW.value || Math.max(window.innerWidth - 40, 720)),
    vh: Math.round(window.innerHeight)
  };
}

/** 请求令牌：切分类时自增，旧响应一律丢弃，避免串会话。 */
let feedToken = 0;
let feedAbort: AbortController | null = null;

async function refreshFolders(): Promise<void> {
  try {
    const res = await fetch("/api/v1/gallery/folders");
    if (!res.ok) return;
    const json = (await res.json()) as { folders?: GalleryFolder[] };
    folders.value = json.folders ?? [];
  } catch {
    /* 轮询失败忽略 */
  }
}

/** 拉取筛选区统计：只在首屏、收藏/删除、批次进度变化时调用 */
async function loadStats(): Promise<void> {
  try {
    const res = await fetch("/api/v1/gallery/stats");
    if (!res.ok) return;
    stats.value = (await res.json()) as typeof stats.value;
  } catch {
    /* 统计失败不阻塞图库 */
  }
}

/* ---------- 悬浮入口：打开画面分析工作流 ---------- */
function openWorkflow(): void {
  emit("open-workflow");
}

function schedulePoll() {
  window.clearTimeout(pollTimer);
  if (folderId.value || !folders.value.some((f) => f.status !== "done")) return;
  pollTimer = window.setTimeout(() => { void refreshFolders().then(schedulePoll); }, 3000);
}

/** 重建分页会话（切分类 / 进入文件夹 / 首次加载）。 */
async function resetFeed(): Promise<void> {
  // 筛选区统计与分页无关，顺带刷新一次（不阻塞）
  void loadStats();
  feedToken += 1;
  const token = feedToken;
  // 停掉上一轮请求，并解除“加载中”锁，否则新会话会被旧请求阻塞
  feedAbort?.abort();
  feedAbort = new AbortController();
  feedLoading.value = false;
  loading.value = true;
  error.value = "";
  feedExhausted.value = false;
  feedSession.value = "";
  try {
    const res = await fetch(
      `/api/v1/gallery/feed/meta?categories=${encodeURIComponent(categoryParam())}`,
      { signal: feedAbort.signal }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const meta = (await res.json()) as {
      sessionId: string;
      total: number;
      categories: Array<{ name: string; total: number }>;
      allCounts?: Array<{ name: string; total: number }>;
      allCategories: string[];
      folders: GalleryFolder[];
    };
    // 过期会话响应：直接丢弃
    if (token !== feedToken) return;
    feedSession.value = meta.sessionId;
    // tabs 用全量计数，避免只看单一分类时其他 tab 变成 0
    const countSource = meta.allCounts ?? meta.categories;
    feedTotals.value = Object.fromEntries(countSource.map((c) => [c.name, c.total]));
    folders.value = meta.folders ?? [];
    data.value = {
      categories: meta.allCategories ?? [],
      items: [],
      total: meta.total ?? 0,
      freeCount: 0,
      paidCount: 0,
      analysisCount: 0,
      folders: meta.folders ?? []
    };
    ordered.value = [];
    await loadMoreFeed();
    schedulePoll();
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    error.value = (e as Error).message;
  } finally {
    if (token === feedToken) loading.value = false;
  }
}

/** 追加一页：后端已保证不重复，前端只负责打散后追加。 */
async function loadMoreFeed(): Promise<void> {
  if (feedLoading.value || feedExhausted.value || !feedSession.value) return;
  const token = feedToken;
  const session = feedSession.value;
  const { vw, vh } = viewportSize();
  feedLoading.value = true;
  try {
    const res = await fetch(
      `/api/v1/gallery/feed?session=${encodeURIComponent(session)}&vw=${vw}&vh=${vh}`,
      { signal: feedAbort?.signal }
    );
    if (token !== feedToken) return;
    if (res.status === 410) {
      await resetFeed();
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const page = (await res.json()) as { items?: GalleryItem[]; exhausted?: boolean };
    const incoming = page.items ?? [];
    if (!data.value) return;
    data.value.items = [...data.value.items, ...incoming];
    // 每页先打散再追加，保证随机排布且不打断已显示内容
    ordered.value = [...ordered.value, ...interleave(incoming)];
    data.value.freeCount = data.value.items.filter((i) => i.free).length;
    data.value.paidCount = data.value.items.length - data.value.freeCount;
    data.value.analysisCount = data.value.items.filter((i) => i.hasAnalysis).length;
    feedExhausted.value = Boolean(page.exhausted) || incoming.length === 0;
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    error.value = (e as Error).message;
  } finally {
    if (token === feedToken) feedLoading.value = false;
  }
}

function attachFeedObserver(): void {
  feedObserver?.disconnect();
  feedObserver = null;
  const el = sentinelRef.value;
  if (!el) return;
  feedObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMoreFeed();
    },
    { rootMargin: "400px 0px" }
  );
  feedObserver.observe(el);
}


const items = computed(() => data.value?.items ?? []);
const categories = computed(() => data.value?.categories ?? []);
/** 统计全部来自 /api/v1/gallery/stats，`?? ` 后的分支仅作接口失败时兜底 */
const analysisCount = computed(() => stats.value?.analyzed ?? data.value?.analysisCount ?? 0);
const favoriteCount = computed(
  () => stats.value?.favorite ?? items.value.filter((x) => x.favorite).length
);
/** 重试中：来自服务端重试队列，与已加载卡片数无关 */
const retryingCount = computed(() => Object.keys(retryStates.value).length);
/** 需更新：后端按「存在 rerun 候选文件」全量统计，与已加载卡片数无关 */
const needsUpdateCount = computed(
  () =>
    stats.value?.needsUpdate ??
    items.value.filter((x) => Boolean(compareByKey.value[keyOf(x)])).length
);
const mobileFilterValue = computed(() =>
  statusFilter.value ? `status:${statusFilter.value}` : `cat:${selected.value}`
);

/** 分类 tabs 的计数：全部来自 stats；上传 = 文件夹内素材 + 单张上传。 */
function categoryCount(category: string): number {
  if (category === "uploads") {
    const fromStats = stats.value?.uploads;
    if (fromStats) return fromStats.folderItems + fromStats.singles;
    const batchIds = new Set(folders.value.map((f) => f.id));
    const singles = items.value.filter(
      (x) => x.category === "uploads" && !(x.batchId && batchIds.has(x.batchId))
    ).length;
    const folderItems = folders.value.reduce((sum, f) => sum + (f.total || 0), 0);
    return folderItems + singles;
  }
  const fromStats = stats.value?.categories.find((c) => c.name === category)?.total;
  if (typeof fromStats === "number") return fromStats;
  const total = feedTotals.value[category];
  if (typeof total === "number") return total;
  return items.value.filter((x) => effectiveCategoryOf(x) === category).length;
}

/* ---------- 边界感应浮层 ---------- */
const POP_W = 360;
const POP_H = 560;
const hover = ref<{ item: GalleryItem; top: number; left: number } | null>(null);
const pinned = ref(false);
const popEl = ref<HTMLElement>();
const reanalyzing = ref<Record<string, boolean>>({});
const retryStates = ref<Record<string, "queued" | "running">>({});
const statusFilter = ref<"" | "favorite" | "retrying" | "needs-update">("");
const compareByKey = ref<Record<string, CompareEntry>>({});
const compareHover = ref<{ entry: CompareEntry; top: number; left: number } | null>(null);
const comparePopEl = ref<HTMLElement>();
const compareApplying = ref(false);
const compareSide = ref<"old" | "new">("new");
const isMobile = ref(false);
const RETRY_FLAG_KEY = "gallery.retryEnabled";

function readRetryFlag(): boolean {
  try {
    const value = localStorage.getItem(RETRY_FLAG_KEY);
    return value === null ? true : value === "1";
  } catch {
    return true;
  }
}

const retryEnabled = ref(readRetryFlag());
let compareHideTimer = 0;
let retryStatusTimer = 0;
let mobileMedia: MediaQueryList | undefined;
const notice = ref("");
let noticeTimer = 0;
function flash(msg: string) {
  notice.value = msg;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => { notice.value = ""; }, 4200);
}

async function toggleFavorite(item: GalleryItem, event: MouseEvent): Promise<void> {
  event.stopPropagation();
  event.preventDefault();
  const next = !item.favorite;
  item.favorite = next;
  try {
    const res = await fetch(
      `/api/v1/gallery/motionsites/${encodeURIComponent(item.category)}/${encodeURIComponent(item.image)}/favorite`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: next })
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { favorite?: boolean };
    item.favorite = Boolean(data.favorite);
    // 收藏数属于筛选区统计，单独刷新接口
    void loadStats();
    flash(item.favorite ? "已标记为优质素材" : "已取消优质素材");
  } catch (err) {
    item.favorite = !next;
    flash(`收藏失败：${(err as Error).message}`);
  }
}

async function deleteUpload(item: GalleryItem) {
  const base = item.title;
  if (!window.confirm(`删除 ${base}？`)) return;
  try {
    const res = await fetch(`/api/v1/workflow/uploads/${encodeURIComponent(base)}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { dissolved?: boolean; remaining?: number };
    hover.value = null;
    pinned.value = false;
    if (data.dissolved) {
      history.pushState({}, "", "/inspiration");
      folderId.value = null;
      flash(
        data.remaining === 1
          ? "这个文件夹只剩 1 张，已自动转为单图"
          : "这个文件夹已清空"
      );
    }
    await resetFeed();
  } catch (err) {
    alert(`删除失败：${(err as Error).message}`);
  }
}

let popTimer = 0;

/** 通用浮层定位：卡片在左半屏 → 浮层贴右；在右半屏 → 贴左；最后夹紧到视口内 */
function positionFloat(el: HTMLElement, width: number, height: number): { top: number; left: number } {
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const GAP = 12;
  // 浮层实际尺寸受视口限制，定位时用同一套尺寸夹紧，避免底部超出窗口
  const popW = Math.min(width, Math.max(180, vw - 16));
  const popH = Math.min(height, Math.max(180, vh - 16));

  const rightRoom = vw - r.right - GAP;
  const leftRoom = r.left - GAP;

  let left: number;
  if (rightRoom >= popW && rightRoom >= leftRoom) left = r.right + GAP;
  else if (leftRoom >= popW) left = r.left - popW - GAP;
  else left = rightRoom >= leftRoom ? r.right + GAP : r.left - popW - GAP;

  left = Math.min(Math.max(8, left), Math.max(8, vw - popW - 8));

  let top = r.top;
  top = Math.min(Math.max(8, top), Math.max(8, vh - popH - 8));

  return { top, left };
}

function positionPop(el: HTMLElement, item: GalleryItem) {
  hover.value = { item, ...positionFloat(el, POP_W, POP_H) };
}

function showPop(e: MouseEvent, item: GalleryItem) {
  if (pinned.value) return;
  if (!item.vocabulary && !item.detection) return;
  // 以卡片为锚点定位（浮层放在卡片另一侧）
  const el = (e.currentTarget as HTMLElement).closest(".card") as HTMLElement
    || (e.currentTarget as HTMLElement);
  window.clearTimeout(popTimer);
  positionPop(el, item);
}

function closePop(): void {
  pinned.value = false;
  hover.value = null;
  window.clearTimeout(popTimer);
  window.clearTimeout(hideTimer);
  hideTimer = 0;
}

/** 点击「设计」固定浮层；再点同一个按钮收起来。 */
function pinPop(e: MouseEvent, item: GalleryItem): void {
  e.stopPropagation();
  if (pinned.value && hover.value?.item === item) {
    closePop();
    return;
  }
  const el = (e.currentTarget as HTMLElement).closest(".card") as HTMLElement
    || (e.currentTarget as HTMLElement);
  window.clearTimeout(popTimer);
  window.clearTimeout(hideTimer);
  pinned.value = true;
  positionPop(el, item);
}

/** 点击浮层/按钮之外时收起固定浮层与对比面板。 */
function onDocumentPointerDown(e: PointerEvent): void {
  const target = e.target as Node | null;
  if (!target) return;
  if (compareHover.value) {
    const insideCompare = comparePopEl.value?.contains(target);
    const onRetry = (target as HTMLElement).closest?.(".retry-btn");
    if (!insideCompare && !onRetry) closeCompare();
  }
  if (!pinned.value) return;
  if (popEl.value?.contains(target)) return;
  if ((target as HTMLElement).closest?.(".info-btn")) return;
  closePop();
}

let hideTimer = 0;

/** 鼠标离开卡片后延迟收起，给移入浮层留出时间（浮层内可滚动） */
function hidePop() {
  if (pinned.value) return;
  window.clearTimeout(popTimer);
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    hover.value = null;
  }, 160);
}

function keepPop() {
  window.clearTimeout(hideTimer);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function keyOf(item: GalleryItem): string {
  return `${item.category}/${item.image.replace(/\.[^.]+$/, "")}`;
}

function hasCompare(item: GalleryItem): boolean {
  return Boolean(compareByKey.value[keyOf(item)]);
}

function retryStateOf(item: GalleryItem): "" | "queued" | "running" | "compare" {
  const key = keyOf(item);
  if (compareByKey.value[key]) return "compare";
  if (retryStates.value[key]) return retryStates.value[key];
  if (reanalyzing.value[key]) return "running";
  return "";
}

function isReanalyzing(item: GalleryItem): boolean {
  const state = retryStateOf(item);
  return state === "queued" || state === "running";
}

async function reanalyze(item: GalleryItem): Promise<void> {
  const key = keyOf(item);
  if (isReanalyzing(item)) return;
  reanalyzing.value[key] = true;
  retryStates.value[key] = "queued";
  closePop();
  closeCompare();
  try {
    const res = await fetch("/api/v1/workflow/reanalyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: item.category, file: item.image })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { jobId, status } = (await res.json()) as { jobId: string; status?: string };
    retryStates.value[key] = status === "running" ? "running" : "queued";
    for (;;) {
      await wait(1200);
      const poll = await fetch(`/api/v1/workflow/jobs/${jobId}`);
      const job = (await poll.json()) as {
        status: string;
        result?: ReanalyzePayload;
        error?: string;
      };
      if (job.status === "queued" || job.status === "running") {
        retryStates.value[key] = job.status;
        continue;
      }
      if (job.status === "done") {
        const result = job.result;
        if (!result || result.mode !== "reanalyze") throw new Error("结果格式异常");
        compareByKey.value[key] = {
          key,
          category: result.category,
          base: result.base,
          title: result.title || item.title,
          old: result.old,
          next: result.next,
          oldDetection: result.oldDetection ?? item.detection ?? null,
          nextDetection: result.nextDetection ?? null
        };
        delete retryStates.value[key];
        flash("分析完成，可点击卡片左下角「对比」选择版本");
        break;
      }
      if (job.status === "error") throw new Error(job.error || "分析失败");
    }
  } catch (err) {
    flash(`重新分析失败：${(err as Error).message}`);
  } finally {
    delete reanalyzing.value[key];
    delete retryStates.value[key];
  }
}

function onRetryClick(e: MouseEvent, item: GalleryItem): void {
  if (isReanalyzing(item)) return;
  if (hasCompare(item)) {
    showCompare(e, item);
    return;
  }
  void reanalyze(item);
}

function showCompare(e: MouseEvent, item: GalleryItem): void {
  const entry = compareByKey.value[keyOf(item)];
  if (!entry) return;
  const el = (e.currentTarget as HTMLElement).closest(".card") as HTMLElement
    || (e.currentTarget as HTMLElement);
  window.clearTimeout(compareHideTimer);
  compareSide.value = "new";
  compareHover.value = { entry, ...positionFloat(el, 820, 640) };
  closePop();
}

function onCompareEnter(e: MouseEvent, item: GalleryItem): void {
  if (hasCompare(item)) showCompare(e, item);
}

function keepCompare(): void {
  window.clearTimeout(compareHideTimer);
}

function hideCompare(): void {
  window.clearTimeout(compareHideTimer);
  compareHideTimer = window.setTimeout(() => {
    compareHover.value = null;
  }, 160);
}

function closeCompare(): void {
  compareHover.value = null;
  window.clearTimeout(compareHideTimer);
}

async function chooseVersion(key: string, choice: "old" | "new"): Promise<void> {
  const entry = compareByKey.value[key];
  if (!entry || compareApplying.value) return;
  compareApplying.value = true;
  try {
    const res = await fetch("/api/v1/workflow/reanalyze/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: entry.category, base: entry.base, choice })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    delete compareByKey.value[key];
    closeCompare();
    await resetFeed();
    flash(choice === "new" ? "已使用新分析结果" : "已保留当前分析结果");
  } catch (err) {
    flash(`应用失败：${(err as Error).message}`);
  } finally {
    compareApplying.value = false;
  }
}

async function loadCompare(category: string, base: string): Promise<void> {
  const key = `${category}/${base}`;
  if (compareByKey.value[key]) return;
  try {
    const res = await fetch(
      `/api/v1/workflow/reanalyze/compare?category=${encodeURIComponent(category)}&base=${encodeURIComponent(base)}`
    );
    if (!res.ok) return;
    const data = (await res.json()) as {
      category: string;
      base: string;
      title: string;
      old: Record<string, any> | null;
      next: Record<string, any> | null;
      oldDetection?: Record<string, any> | null;
      nextDetection?: Record<string, any> | null;
    };
    compareByKey.value[key] = {
      key,
      category: data.category,
      base: data.base,
      title: data.title,
      old: data.old,
      next: data.next,
      oldDetection: data.oldDetection ?? null,
      nextDetection: data.nextDetection ?? null
    };
  } catch {
    /* 候选可能已被清理 */
  }
}

async function syncRetryEnabled(): Promise<void> {
  try {
    const res = await fetch("/api/v1/gallery/config");
    if (!res.ok) return;
    const data = (await res.json()) as { retryEnabled?: boolean };
    const enabled = data.retryEnabled !== false;
    retryEnabled.value = enabled;
    try {
      localStorage.setItem(RETRY_FLAG_KEY, enabled ? "1" : "0");
    } catch {
      /* localStorage 不可用时忽略 */
    }
    if (!enabled) {
      if (statusFilter.value === "retrying" || statusFilter.value === "needs-update") {
        statusFilter.value = "";
      }
      retryStates.value = {};
      compareByKey.value = {};
      closeCompare();
      window.clearTimeout(retryStatusTimer);
    } else {
      void syncRetryStatus();
    }
  } catch {
    /* 网络失败时沿用 localStorage / 默认值 */
  }
}

async function syncRetryStatus(): Promise<void> {
  if (!retryEnabled.value) return;
  window.clearTimeout(retryStatusTimer);
  retryStatusTimer = 0;
  try {
    const res = await fetch("/api/v1/workflow/reanalyze/status");
    if (!res.ok) return;
    const data = (await res.json()) as {
      tasks: Array<{ category: string; base: string; file: string; title: string; status: string }>;
    };
    const active: Record<string, "queued" | "running"> = {};
    let hasActive = false;
    for (const task of data.tasks) {
      const key = `${task.category}/${task.base}`;
      if (task.status === "queued" || task.status === "running") {
        active[key] = task.status;
        hasActive = true;
      } else if (task.status === "done") {
        await loadCompare(task.category, task.base);
      }
    }
    retryStates.value = active;
    if (hasActive) retryStatusTimer = window.setTimeout(() => void syncRetryStatus(), 2000);
  } catch {
    /* 状态接口失败不阻塞图库 */
  }
}
</script>

<template>
  <section class="gallery">
    <header class="gallery-head">
      <div>
        <span class="eyebrow">GALLERY · INSPIRATION</span>
        <h2>灵感库</h2>
        <p class="summary">共 {{ data?.total ?? "—" }} 条 · 已解析设计语汇 {{ analysisCount }}</p>
      </div>
    </header>

    <div v-if="error" class="gallery-error">加载失败：{{ error }}</div>

    <nav class="cat-tabs">
      <div class="tab-list">
        <button :class="{ active: selected === 'all' && !statusFilter }" @click="selectCategory('all')">全部 · {{ stats?.total ?? data?.total ?? items.length }}</button>
        <button v-for="c in categories" :key="c" :class="{ active: selected === c && !statusFilter }" @click="selectCategory(c)">
          {{ catLabel(c) }} · {{ categoryCount(c) }}
        </button>
        <span class="tab-sep" aria-hidden="true"></span>
        <button class="status" :class="{ active: statusFilter === 'favorite' }" @click="selectStatus('favorite')">
          已收藏 · {{ favoriteCount }}
        </button>
        <button v-if="retryEnabled" class="status" :class="{ active: statusFilter === 'retrying' }" @click="selectStatus('retrying')">
          重试中 · {{ retryingCount }}
        </button>
        <button v-if="retryEnabled" class="status" :class="{ active: statusFilter === 'needs-update' }" @click="selectStatus('needs-update')">
          需更新 · {{ needsUpdateCount }}
        </button>
      </div>
      <select class="mobile-filter" :value="mobileFilterValue" aria-label="筛选" @change="onMobileFilterChange">
        <option value="cat:all">全部 · {{ stats?.total ?? data?.total ?? items.length }}</option>
        <optgroup label="分类">
          <option v-for="c in categories" :key="`cat:${c}`" :value="`cat:${c}`">{{ catLabel(c) }} · {{ categoryCount(c) }}</option>
        </optgroup>
        <optgroup label="状态">
          <option value="status:favorite">已收藏 · {{ favoriteCount }}</option>
          <option v-if="retryEnabled" value="status:retrying">重试中 · {{ retryingCount }}</option>
          <option v-if="retryEnabled" value="status:needs-update">需更新 · {{ needsUpdateCount }}</option>
        </optgroup>
      </select>
    </nav>

    <div v-if="loading" class="loading">加载中…</div>

    <div v-if="showFolders" class="folders">
      <button v-for="f in folders" :key="f.id" class="folder" @click="openFolder(f.id)">
        <div class="folder-stack" aria-hidden="true">
          <span class="fplate fplate-back" />
          <span class="fplate fplate-mid" />
          <span class="fplate fplate-front" />
          <div class="fcover">
            <StaticImage v-if="f.cover" :src="f.cover" :alt="f.title" />
            <span v-else class="fempty">分析中</span>
            <span class="fcount" :class="{ analyzing: f.status !== 'done' }">
              {{ f.status === "done" ? f.total : `${f.done}/${f.total}` }}
            </span>
          </div>
        </div>
        <div class="fmeta">
          <b>{{ f.title }}</b>
          <small v-if="f.status !== 'done'">分析中 {{ f.done }}/{{ f.total }}</small>
          <small v-else>{{ f.total }} 张 · 已完成</small>
        </div>
      </button>
    </div>

    <div v-if="notice" class="toast">{{ notice }}</div>

    <div v-if="folderId" class="folder-head">
      <button class="crumb" @click="closeFolder">灵感 &lt;</button>
      <h2>{{ currentFolder?.title || "文件夹" }}</h2>
      <p>
        {{ currentFolder ? `${currentFolder.total} 张` : "" }}
        <template v-if="currentFolder && currentFolder.status !== 'done'">
          · 分析中 {{ currentFolder.done }}/{{ currentFolder.total }}
        </template>
      </p>
    </div>

    <div v-if="!loading" ref="gridRef" class="grid">
      <div
        v-for="(row, ri) in rows"
        :key="ri"
        class="jrow"
        :class="{ 'is-single': row.cards.length === 1 }"
      >
        <article
          v-for="c in row.cards"
          :key="c.item.imageUrl"
          class="card"
          :style="{ width: c.w + 'px' }"

        >
          <div class="thumb" :style="{ height: row.h + 'px' }">
            <button
              v-if="c.item.vocabulary || c.item.detection"
              class="info-btn"
              :class="{ 'is-active': pinned && hover?.item === c.item }"
              aria-label="查看设计语汇"
              title="查看设计语汇"
              @mouseenter="showPop($event, c.item)"
              @mouseleave="hidePop"
              @click.stop.prevent="pinPop($event, c.item)"
            >设计</button>
            <StaticImage :src="c.item.imageUrl" :alt="c.item.title" />
            <span v-if="c.item.detection" class="subj-badge">主体：{{ c.item.detection.subjectCount }}</span>
            <button
              v-if="retryEnabled"
              class="retry-btn"
              :class="{
                'is-queued': retryStateOf(c.item) === 'queued',
                'is-running': retryStateOf(c.item) === 'running',
                'is-compare': retryStateOf(c.item) === 'compare'
              }"
              :title="retryStateOf(c.item) === 'queued'
                ? '等待中'
                : retryStateOf(c.item) === 'running'
                  ? '分析中'
                  : retryStateOf(c.item) === 'compare'
                    ? '对比新旧分析'
                    : '重新分析'"
              :disabled="retryStateOf(c.item) === 'queued' || retryStateOf(c.item) === 'running'"
              @click.stop.prevent="onRetryClick($event, c.item)"
              @mouseenter="onCompareEnter($event, c.item)"
              @mouseleave="hideCompare"
            >
              <ClockCircleOutlined v-if="retryStateOf(c.item) === 'queued'" />
              <LoadingOutlined v-else-if="retryStateOf(c.item) === 'running'" spin />
              <template v-else-if="retryStateOf(c.item) === 'compare'"><DiffOutlined /> 对比</template>
              <ReloadOutlined v-else />
            </button>
            <button
              class="fav-btn"
              :class="{ 'is-fav': c.item.favorite }"
              :title="c.item.favorite ? '取消优质素材' : '标记为优质素材'"
              :aria-label="c.item.favorite ? '取消优质素材' : '标记为优质素材'"
              :aria-pressed="c.item.favorite"
              @click.stop.prevent="toggleFavorite(c.item, $event)"
            >
              <StarFilled v-if="c.item.favorite" />
              <StarOutlined v-else />
            </button>
            <button
              v-if="c.item.category === 'uploads'"
              class="del-btn"
              title="删除该素材"
              @click.stop.prevent="deleteUpload(c.item)"
            >✕</button>
          </div>
          <div class="meta">
            <div class="title" :title="c.item.title">{{ c.item.title }}</div>
            <div class="row">
              <span class="cat">{{ itemCat(c.item) }}</span>
              <span class="style-tag" v-if="styleTagText(c.item)">{{ styleTagText(c.item) }}</span>
            </div>
          </div>
        </article>
      </div>
    </div>

    <div ref="sentinelRef" class="feed-sentinel" aria-live="polite">
      <span v-if="feedLoading">加载更多…</span>
      <span v-else-if="feedExhausted && items.length > 0">已经到底了</span>
      <span v-else-if="error">{{ error }}</span>
    </div>

    <!-- 右下角悬浮入口：进入画面分析工作流 -->
    <button
      class="fab-upload"
      type="button"
      aria-label="上传图片进行分析"
      title="上传图片进行分析"
      @click="openWorkflow"
    >
      <span class="plus" aria-hidden="true">+</span>
    </button>

    <!-- 重新分析版本对比 -->
    <div
      v-if="compareHover"
      ref="comparePopEl"
      class="compare-pop"
      :style="{ top: `${compareHover.top}px`, left: `${compareHover.left}px` }"
      @mouseenter="keepCompare"
      @mouseleave="hideCompare"
    >
      <div class="cmp-head">分析结果对比 · <span>{{ compareHover.entry.title }}</span></div>
      <div v-if="isMobile" class="cmp-switch">
        <button :class="{ active: compareSide === 'old' }" @click.stop.prevent="compareSide = 'old'">
          当前版本
        </button>
        <button :class="{ active: compareSide === 'new' }" @click.stop.prevent="compareSide = 'new'">
          新分析
        </button>
      </div>
      <div class="cmp-grid" :class="{ 'is-mobile': isMobile }">
        <section v-show="!isMobile || compareSide === 'old'" class="cmp-col">
          <h4>当前版本</h4>
          <VocabPanel :vocabulary="compareHover.entry.old" :detection="compareHover.entry.oldDetection" />
          <button class="cmp-btn" :disabled="compareApplying" @click.stop.prevent="chooseVersion(compareHover.entry.key, 'old')">
            保留当前
          </button>
        </section>
        <section v-show="!isMobile || compareSide === 'new'" class="cmp-col is-new">
          <h4>新分析</h4>
          <VocabPanel :vocabulary="compareHover.entry.next" :detection="compareHover.entry.nextDetection" />
          <button class="cmp-btn primary" :disabled="compareApplying" @click.stop.prevent="chooseVersion(compareHover.entry.key, 'new')">
            使用新结果
          </button>
        </section>
      </div>
      <p class="cmp-hint">选择后按钮会恢复为「重试」</p>
    </div>

    <!-- 全局边界感应浮层 -->
    <div
      v-if="hover"
      ref="popEl"
      class="vocab-pop"
      :style="{ top: `${hover.top}px`, left: `${hover.left}px` }"
      @mouseenter="keepPop"
      @mouseleave="hidePop"
    >
      <VocabPanel
        :vocabulary="hover.item.vocabulary"
        :detection="hover.item.detection"
        :title="hover.item.title"
      />
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

.gallery-error {
  padding: 12px 16px;
  border: 1px solid #5a2a2a;
  border-radius: 10px;
  color: #ff9c9c;
  background: #1c1111;
  font-size: 12px;
}

.cat-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  /* 吸顶：紧贴 68px 高的顶部 banner */
  position: sticky;
  top: 68px;
  z-index: 19;
  padding: 10px 0;
  margin: -10px 0;
  background: rgb(12 14 17 / 92%);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid rgb(36 40 48 / 60%);
}
.tab-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.mobile-filter {
  display: none;
  min-width: 0;
  padding: 7px 9px;
  border: 1px solid #39414b;
  border-radius: 9px;
  color: #dfe5ea;
  background: #0b0d10;
  font: 600 11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
  color-scheme: dark;
}
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
.cat-tabs button:hover {
  border-color: #d9ff52;
  color: #fff;
}
.cat-tabs .wf-entry {
  margin-left: auto;
  border-color: #d9ff52 !important;
  color: #d9ff52 !important;
  background: transparent !important;
}
.cat-tabs button.active {
  border-color: #d9ff52;
  color: #11140c;
  background: #d9ff52;
}

.tab-sep {
  width: 1px;
  height: 18px;
  margin: 0 2px;
  align-self: center;
  background: #2b3038;
}

.cat-tabs button.status {
  border-color: #2f5f78;
  color: #8fd3ef;
  background: #0a1116;
}
.cat-tabs button.status:hover {
  border-color: #7dd3fc;
  color: #fff;
}
.cat-tabs button.status.active {
  border-color: #7dd3fc;
  color: #05141b;
  background: #7dd3fc;
}

@media (max-width: 720px) {
  .tab-list { display: none; }
  .mobile-filter { display: block; flex: 1 1 auto; }
  .cat-tabs { flex-wrap: nowrap; align-items: center; }
  .cat-tabs .wf-entry { margin-left: 0; flex: none; }
}

.loading {
  color: #8f969f;
  font-size: 13px;
}

/* 懒加载哨兵：滚到底部前 400px 就会触发下一页 */
.feed-sentinel {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 18px 0 34px;
  color: #6f767f;
  font: 500 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.05em;
}

/* 悬浮入口：灵感页右下角圆形按钮，点击进入画面分析工作流 */
.fab-upload {
  position: fixed;
  right: 28px;
  bottom: 28px;
  z-index: 30;
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: #d9ff52;
  color: #161b20;
  box-shadow: 0 10px 26px rgb(0 0 0 / 45%);
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.fab-upload:hover {
  transform: translateY(-2px) scale(1.04);
}
.fab-upload .plus {
  font: 300 26px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.toast {
  position: fixed;
  bottom: 28px;
  left: 50%;
  z-index: 120;
  padding: 10px 16px;
  border: 1px solid #3d4650;
  border-radius: 10px;
  color: #dfe5ea;
  background: rgb(16 20 26 / 96%);
  font-size: 12px;
  transform: translateX(-50%);
  box-shadow: 0 12px 32px rgb(0 0 0 / 55%);
}

.folders {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 26px;
}
.folder {
  position: relative;
  width: 188px;
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
}
.folder-stack {
  position: relative;
  width: 168px;
  aspect-ratio: 3 / 4;
}
/* 3 个同尺寸圆角矩形向右后方偏移重叠，形成「一叠素材 / 文件夹」视觉认知 */
.fplate {
  position: absolute;
  inset: 0;
  border-radius: 10px;
  pointer-events: none;
  transition: transform 180ms ease, border-color 180ms ease;
}
.fplate-back {
  border: 1px solid #3c4855;
  background: #1b242e;
  box-shadow: 0 6px 16px rgb(0 0 0 / 28%);
  transform: translate(19px, 0);
}
.fplate-mid {
  border: 1px solid #4b5765;
  background: #232d39;
  transform: translate(12px, 0);
}
.fplate-front {
  border: 1px solid #5d6a7a;
  background: #2b3644;
  transform: translate(5px, 0);
}
.folder:hover .fplate-back { transform: translate(23px, 0); }
.folder:hover .fplate-mid { transform: translate(15px, 0); }
.folder:hover .fplate-front { transform: translate(7px, 0); }

.fcover {
  position: absolute;
  inset: 0;
  z-index: 2;
  overflow: hidden;
  border: 1px solid #2b333b;
  border-radius: 10px;
  background: #0b0d10;
  box-shadow: 0 6px 18px rgb(0 0 0 / 35%);
}
.folder:hover .fcover { border-color: #59606a; }
.fcover :deep(img),
.fcover :deep(canvas) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.fempty {
  display: grid;
  height: 100%;
  place-items: center;
  color: #6f777f;
  font-size: 11px;
}
.fcount {
  position: absolute;
  right: 6px;
  bottom: 6px;
  padding: 2px 7px;
  border-radius: 99px;
  color: #11140c;
  background: #d9ff52;
  font: 700 10px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.fcount.analyzing {
  color: #cfd6dd;
  background: rgb(10 12 14 / 78%);
  box-shadow: inset 0 0 0 1px #3d4650;
}
.fmeta {
  width: 168px;
  padding-top: 8px;
}
.fmeta b {
  display: block;
  overflow: hidden;
  color: #dfe5ea;
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fmeta small {
  color: #7b838c;
  font-size: 10.5px;
}
.folder-head {
  margin-bottom: 20px;
}
.crumb {
  margin: 0 0 10px;
  padding: 3px 0;
  border: 0;
  color: #8f979f;
  background: none;
  font: 600 11px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
  cursor: pointer;
}
.crumb:hover { color: #d9ff52; }
.folder-head h2 { margin: 0 0 4px; font-size: 20px; }
.folder-head p { margin: 0; color: #8a8a80; font-size: 11.5px; }

.grid {
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.jrow {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
.jrow.is-single {
  justify-content: flex-start;
}
.card {
  min-width: 0;
  cursor: pointer;
}

.info-btn {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: auto;
  height: 18px;
  padding: 0 7px;
  border: 1px solid rgb(255 255 255 / 35%);
  border-radius: 99px;
  color: #eef2f5;
  background: rgb(10 12 14 / 55%);
  font: 600 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.04em;
  cursor: pointer;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 140ms ease, background 140ms ease, border-color 140ms ease;
}
.card:hover .info-btn {
  opacity: 1;
}
.info-btn:hover,
.info-btn.is-active {
  border-color: #d9ff52;
  color: #11140c;
  background: #d9ff52;
}

.card .thumb {
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: 9px;
  background: #0b0d10;
}
.card .thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.fav-btn {
  position: absolute;
  right: 8px;
  bottom: 8px;
  z-index: 2;
  display: grid;
  width: 26px;
  height: 26px;
  padding: 0;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 22%);
  border-radius: 50%;
  color: #cfd6dd;
  background: rgb(10 12 14 / 62%);
  backdrop-filter: blur(6px);
  font-size: 13px;
  cursor: pointer;
  opacity: 0.55;
  transition: opacity 140ms ease, color 140ms ease, border-color 140ms ease, transform 140ms ease;
}
.card:hover .fav-btn,
.fav-btn.is-fav {
  opacity: 1;
}
.fav-btn.is-fav {
  color: #d9ff52;
  border-color: rgb(217 255 82 / 55%);
  box-shadow: 0 0 0 1px rgb(217 255 82 / 18%);
}
.fav-btn:hover {
  color: #d9ff52;
  border-color: rgb(217 255 82 / 60%);
  transform: scale(1.06);
}

.del-btn {
  position: absolute;
  top: 8px;
  left: 46px;          /* 与左上角「设计」按钮左右并排 */
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 50%;
  background: rgb(0 0 0 / 65%);
  color: #ff8a80;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  display: none;
  z-index: 2;
}
.card:hover .del-btn { display: grid; place-items: center; }
.del-btn:hover { background: #ff5252; color: #fff; }
.subj-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 8px;
  border-radius: 99px;
  color: #11140c;
  background: #d9ff52;
  font: 700 10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  box-shadow: 0 2px 8px rgb(0 0 0 / 40%);
}

.retry-btn {
  position: absolute;
  left: 8px;
  bottom: 8px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 26px;
  min-width: 26px;
  padding: 0;
  border: 1px solid rgb(255 255 255 / 22%);
  border-radius: 50%;
  color: #cfd6dd;
  background: rgb(10 12 14 / 62%);
  backdrop-filter: blur(6px);
  font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  cursor: pointer;
  opacity: 0.55;
  transition: opacity 140ms ease, color 140ms ease, border-color 140ms ease, transform 140ms ease;
}
.card:hover .retry-btn,
.retry-btn.is-queued,
.retry-btn.is-running,
.retry-btn.is-compare {
  opacity: 1;
}
.retry-btn.is-queued {
  color: #7dd3fc;
  border-color: rgb(125 211 252 / 55%);
  cursor: progress;
}
.retry-btn.is-running {
  color: #d9ff52;
  cursor: progress;
}
.retry-btn.is-compare {
  padding: 0 8px;
  border-radius: 99px;
  border-color: rgb(217 255 82 / 45%);
  color: #d9ff52;
}
.retry-btn:hover {
  color: #d9ff52;
  border-color: rgb(217 255 82 / 60%);
  transform: scale(1.06);
}
.retry-btn:disabled {
  cursor: progress;
  transform: none;
}

.card .meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}
.card .title {
  overflow: hidden;
  color: #eef2f5;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card .row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.card .cat {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border: 1px solid rgb(217 255 82 / 20%);
  border-radius: 6px;
  color: #d9ff52;
  background: rgb(217 255 82 / 7%);
  font: 600 9px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.style-tag {
  overflow: hidden;
  color: #d9ff52;
  font: 500 9px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.85;
}

/* 重新分析版本对比浮层 */
.compare-pop {
  position: fixed;
  z-index: 110;
  width: min(820px, calc(100vw - 16px));
  max-height: min(640px, calc(100vh - 16px));
  overflow-y: auto;
  padding: 12px 14px;
  border: 1px solid #39414b;
  border-radius: 12px;
  background: #14171c;
  box-shadow: 0 16px 40px rgb(0 0 0 / 60%);
}
.cmp-switch {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}
.cmp-switch button {
  flex: 1;
  padding: 7px 8px;
  border: 1px solid #2f5f78;
  border-radius: 99px;
  color: #8fd3ef;
  background: #0a1116;
  font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  cursor: pointer;
}
.cmp-switch button.active {
  border-color: #7dd3fc;
  color: #05141b;
  background: #7dd3fc;
}
.cmp-head {
  margin-bottom: 8px;
  color: #d9ff52;
  font: 600 10px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.06em;
}
.cmp-head span {
  color: #8f969f;
  font-weight: 400;
}
.cmp-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.cmp-grid.is-mobile {
  grid-template-columns: 1fr;
}
.cmp-col {
  min-width: 0;
  padding: 10px;
  border: 1px solid #2b323b;
  border-radius: 10px;
  background: #0e1116;
}
.cmp-col.is-new {
  border-color: rgb(217 255 82 / 35%);
  background: #10150d;
}
.cmp-col h4 {
  margin: 0 0 6px;
  color: #eef2f5;
  font-size: 11px;
}
.cmp-cat {
  margin: 0 0 5px;
  color: #d9ff52;
  font: 600 9px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.cmp-summary {
  margin: 0 0 7px;
  color: #c8d0d8;
  font-size: 10.5px;
  line-height: 1.5;
}
.cmp-row {
  margin: 0 0 6px;
  color: #9aa3ad;
  font-size: 10px;
  line-height: 1.5;
  word-break: break-word;
}
.cmp-row b {
  display: block;
  margin-bottom: 1px;
  color: #6f7680;
  font: 600 9px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.06em;
}
.cmp-btn {
  width: 100%;
  margin-top: 8px;
  padding: 7px;
  border: 1px solid #39414b;
  border-radius: 8px;
  color: #dfe5ea;
  background: transparent;
  font: 600 10.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  cursor: pointer;
}
.cmp-btn.primary {
  border-color: #d9ff52;
  color: #11140c;
  background: #d9ff52;
}
.cmp-btn:hover {
  border-color: #d9ff52;
}
.cmp-btn:disabled {
  opacity: 0.55;
  cursor: progress;
}
.cmp-hint {
  margin: 8px 0 0;
  color: #6f7680;
  font-size: 9.5px;
}

/* 全局边界感应浮层 */
.vocab-pop {
  position: fixed;
  z-index: 100;
  width: min(360px, calc(100vw - 16px));
  max-height: min(560px, calc(100vh - 16px));
  overflow-y: auto;
  padding: 12px 14px;
  border: 1px solid #39414b;
  border-radius: 12px;
  background: #14171c;
  box-shadow: 0 16px 40px rgb(0 0 0 / 60%);
}
</style>
