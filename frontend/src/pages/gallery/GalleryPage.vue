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
  /** 后端扫描时标记：重分析执行失败，任务仍在队列里可重试/放弃 */
  retryFailed?: boolean;
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
  /** 批次内正在重试 / 已有候选可更新的数量（由后端扫描得出） */
  retrying?: number;
  pending?: number;
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
  // 文件夹详情走后端按批次查询，不能靠已加载的几分页本地过滤
  void resetFeed();
}
function closeFolder() {
  history.pushState({}, "", "/inspiration");
  folderId.value = null;
  void resetFeed();
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

function selectStatus(status: "favorite" | "retrying" | "needs-update" | "failed") {
  if (folderId.value) closeFolder();
  statusFilter.value = statusFilter.value === status ? "" : status;
  if (statusFilter.value) selected.value = "all";
  window.scrollTo({ top: 0 });
  // 状态筛选同样要走后端查询，而不是只过滤已加载的几分页
  void resetFeed();
}

function onMobileFilterChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  if (value.startsWith("status:")) {
    if (folderId.value) closeFolder();
    statusFilter.value = value.slice(7) as "favorite" | "retrying" | "needs-update" | "failed";
    selected.value = "all";
    window.scrollTo({ top: 0 });
    void resetFeed();
    return;
  }
  selectCategory(value.slice(4));
}
const currentFolder = computed(() =>
  folderId.value ? folders.value.find((f) => f.id === folderId.value) ?? null : null
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
  // 文件夹详情与状态筛选都已由后端返回，这里不再二次过滤（否则会漏掉未加载的卡片）
  if (folderId.value || statusFilter.value) return all;
  // 「全部」用随机穿插顺序；批次素材也打散，不在全部分类下以文件夹出现
  if (selected.value === "all") return ordered.value;
  if (selected.value === "uploads") {
    // 后端已只返回 uploads 分类；这里只需把批次素材收进文件夹，不散落
    const batchIds = new Set(folders.value.map((f) => f.id));
    return all.filter((x) => !(x.batchId && batchIds.has(x.batchId)));
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
  carton: "二次元",
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
type FolderCard = { folder: GalleryFolder; w: number };
type JRow = { h: number; cards: Array<RowCard | FolderCard> };

/** 文件夹卡片在行内的固定宽高比（接近 3/4 的卡片） */
const FOLDER_AR = 0.78;

/** 「上传」视图下参与混排的文件夹 */
const uploadsFolders = computed(() =>
  !folderId.value && !statusFilter.value && selected.value === "uploads"
    ? folders.value
    : []
);

const rows = computed<JRow[]>(() => {
  const W = gridW.value || 1310;
  const out: JRow[] = [];
  type Entry = { kind: "item"; item: GalleryItem } | { kind: "folder"; folder: GalleryFolder };
  // 文件夹与单图同一条序列，参与同一套行高计算
  const feed: Entry[] = [
    ...uploadsFolders.value.map((folder): Entry => ({ kind: "folder", folder })),
    ...filtered.value.map((item): Entry => ({ kind: "item", item }))
  ];
  let cur: Entry[] = [];
  let sumAr = 0;
  let normalH = 0;

  const arOfEntry = (entry: Entry): number =>
    entry.kind === "folder" ? FOLDER_AR : arOf(entry.item);

  const flush = () => {
    if (!cur.length) return;
    const usable = W - (cur.length - 1) * GAP;
    const h = Math.max(FLOOR_H, Math.min(MAX_H, usable / sumAr));
    // 记录第一行真正「排满但不触顶」的高度，作为末行的正常尺寸
    if (!normalH && h > FLOOR_H && h < MAX_H) normalH = h;
    out.push({
      h,
      cards: cur.map((entry) =>
        entry.kind === "folder"
          ? { folder: entry.folder, w: h * FOLDER_AR }
          : { item: entry.item, w: h * arOf(entry.item) }
      )
    });
    cur = [];
    sumAr = 0;
  };

  for (const entry of feed) {
    const ar = arOfEntry(entry);
    if (cur.length > 0) {
      // 并入这张会让行高跌破 MIN_H → 先收行
      const h = (W - cur.length * GAP) / (sumAr + ar);
      if (h < MIN_H) flush();
    }
    cur.push(entry);
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
      for (const c of last.cards) {
        c.w = cap * ("folder" in c ? FOLDER_AR : arOf(c.item));
      }
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
  connectStatsSocket();
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
  window.clearTimeout(statsReconnectTimer);
  window.clearTimeout(bumpTimer);
  statsSocket?.close();
  statsSocket = null;
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
  /** 重分析执行失败的数量 */
  failed?: number;
  /** WebSocket 推送时附带：排队 + 运行中的重分析任务数 */
  retrying?: number;
  uploads: { folders: number; folderItems: number; singles: number };
} | null>(null);
const sentinelRef = ref<HTMLElement | null>(null);
let feedObserver: IntersectionObserver | null = null;

/** 当前分类参数：全部 / 上传 传空，由后端兜底；其余传具体分类。 */
function categoryParam(): string {
  // 「上传」也是个真实目录分类，走后端查才能拿全（不靠已加载分页）
  if (selected.value === "all") return "";
  return selected.value;
}

/** 状态参数：已收藏 / 重试中 / 需更新 都交给后端筛选 */
function statusParam(): string {
  return statusFilter.value;
}

/** 批次参数：文件夹详情只看该批次 */
function batchParam(): string {
  return folderId.value ?? "";
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

/** 拉取筛选区统计：只在首屏、收藏/删除、批次进度变化时调用；bump=true 时触发标签跳动 */
async function loadStats(options: { bump?: boolean } = {}): Promise<void> {
  try {
    const res = await fetch("/api/v1/gallery/stats");
    if (!res.ok) return;
    const data = (await res.json()) as NonNullable<typeof stats.value>;
    const prev = stats.value ?? null;
    // /stats 不含 retrying（只由 WebSocket 推送），保留当前值避免数字回退
    const next = { ...data, retrying: prev?.retrying };
    stats.value = next;
    // 主动刷新（收藏）也触发跳动，与 WebSocket 推送的视觉反馈保持一致
    if (options.bump) flashBumps(changedStatKeys(prev, next));
  } catch {
    /* 统计失败不阻塞图库 */
  }
}

/* ---------- 实时统计：WebSocket 单次推送，纯响应式更新标签 ---------- */
/**
 * 重试队列在服务端变化（入队/开跑/完成/采纳）时，后端推一次最新统计。
 * 这里只替换计数对象并给「哪些数字变了」的标签加跳动动画，
 * 不重新请求图库列表、不刷新页面。
 */
const bumpKeys = ref<Set<string>>(new Set());
let statsSocket: WebSocket | null = null;
let statsReconnectTimer = 0;
let bumpTimer = 0;

type StatsPayload = NonNullable<typeof stats.value>;

/** 对比前后两次统计，返回数量发生变化的标签 key。 */
function changedStatKeys(prev: StatsPayload | null, next: StatsPayload): string[] {
  const changed: string[] = [];
  if ((prev?.total ?? -1) !== next.total) changed.push("all");
  const prevCats = new Map((prev?.categories ?? []).map((c) => [c.name, c.total]));
  for (const category of next.categories ?? []) {
    if (prevCats.get(category.name) !== category.total) changed.push(category.name);
  }
  if ((prev?.favorite ?? -1) !== next.favorite) changed.push("favorite");
  if ((prev?.needsUpdate ?? -1) !== next.needsUpdate) changed.push("needs-update");
  if ((prev?.failed ?? 0) !== (next.failed ?? 0)) changed.push("failed");
  if ((prev?.retrying ?? 0) !== (next.retrying ?? 0)) changed.push("retrying");
  const uploadTotal = (value: StatsPayload | null): number =>
    (value?.uploads?.folderItems ?? 0) + (value?.uploads?.singles ?? 0);
  if (uploadTotal(prev) !== uploadTotal(next)) changed.push("uploads");
  return changed;
}

/** 标签跳动两下（动画在 CSS 里跑 2 次），结束后移除 class。 */
function flashBumps(keys: string[]): void {
  if (!keys.length) return;
  bumpKeys.value = new Set(keys);
  window.clearTimeout(bumpTimer);
  bumpTimer = window.setTimeout(() => {
    bumpKeys.value = new Set();
  }, 900);
}

function connectStatsSocket(): void {
  if (statsSocket) return;
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  try {
    statsSocket = new WebSocket(`${protocol}://${location.host}/ws/stats`);
  } catch {
    statsSocket = null;
    return;
  }
  statsSocket.onmessage = (event) => {
    try {
      const payload = JSON.parse(String(event.data)) as { type?: string; stats?: StatsPayload };
      if (payload.type !== "stats" || !payload.stats) return;
      const prev = stats.value;
      const changed = changedStatKeys(prev, payload.stats);
      stats.value = payload.stats;
      flashBumps(changed);
      // 文件夹卡片的「有 x 条在重试 / 可更新」也要跟着变（轻量接口，不重查列表）
      void refreshFolders();
      // 正在看「重试中 / 需更新」列表时，数量变了就要重查，否则数字变了卡片不变
      const viewingRetrying = statusFilter.value === "retrying";
      const viewingNeedsUpdate = statusFilter.value === "needs-update";
      const viewingFailed = statusFilter.value === "failed";
      const retryingChanged = (prev?.retrying ?? 0) !== (payload.stats.retrying ?? 0);
      const needsUpdateChanged = (prev?.needsUpdate ?? 0) !== payload.stats.needsUpdate;
      const failedChanged = (prev?.failed ?? 0) !== (payload.stats.failed ?? 0);
      if (
        (viewingRetrying && retryingChanged) ||
        (viewingNeedsUpdate && needsUpdateChanged) ||
        (viewingFailed && failedChanged)
      ) {
        void resetFeed();
      }
    } catch {
      /* 非法消息直接忽略 */
    }
  };
  statsSocket.onerror = () => {
    statsSocket?.close();
  };
  statsSocket.onclose = () => {
    statsSocket = null;
    window.clearTimeout(statsReconnectTimer);
    statsReconnectTimer = window.setTimeout(connectStatsSocket, 3000);
  };
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
      `/api/v1/gallery/feed/meta?categories=${encodeURIComponent(categoryParam())}&status=${encodeURIComponent(statusParam())}&batch=${encodeURIComponent(batchParam())}`,
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
/** 重试中：优先用服务端推送的全量值，未连上时回退到本地队列状态 */
const retryingCount = computed(
  () => stats.value?.retrying ?? Object.keys(retryStates.value).length
);
/** 需更新：后端按「存在 rerun 候选文件」全量统计，与已加载卡片数无关 */
const needsUpdateCount = computed(
  () =>
    stats.value?.needsUpdate ??
    items.value.filter((x) => x.pendingRerun || Boolean(compareByKey.value[keyOf(x)])).length
);
/** 失败：重分析执行出错、任务仍留在队列里的数量 */
const failedCount = computed(
  () => stats.value?.failed ?? items.value.filter((x) => x.retryFailed).length
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
const statusFilter = ref<"" | "favorite" | "retrying" | "needs-update" | "failed">("");
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
    // 收藏数属于筛选区统计，单独刷新接口，并让标签跳动一次
    void loadStats({ bump: true });
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

function retryStateOf(item: GalleryItem): "" | "queued" | "running" | "compare" | "failed" {
  const key = keyOf(item);
  // 重试中优先于「对比」，否则点重试后卡片仍显示对比按钮
  if (retryStates.value[key]) return retryStates.value[key];
  if (reanalyzing.value[key]) return "running";
  // pendingRerun 由后端扫描磁盘得出：有候选就该显示「对比」，即使内存里还没拉过对比数据
  if (compareByKey.value[key] || item.pendingRerun) return "compare";
  if (item.retryFailed) return "failed";
  return "";
}

/** 放弃：从失败队列剔除，卡片回到普通状态（原识别结果不动）。 */
async function discardRetry(item: GalleryItem): Promise<void> {
  try {
    const res = await fetch("/api/v1/workflow/reanalyze/discard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: item.category, base: item.image.replace(/\.[^.]+$/, "") })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (statusFilter.value === "failed") await resetFeed();
  } catch (err) {
    flash(`放弃失败：${(err as Error).message}`);
  }
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
  if (hasCompare(item) || item.pendingRerun) {
    void openCompareFor(e, item);
    return;
  }
  void reanalyze(item);
}

/** 对比数据按需拉取：磁盘上有候选但内存没有时先补齐，避免误触重分析。 */
async function openCompareFor(e: MouseEvent, item: GalleryItem): Promise<void> {
  const anchor = e.currentTarget as HTMLElement | null;
  const key = keyOf(item);
  if (!compareByKey.value[key]) {
    await loadCompare(item.category, item.image.replace(/\.[^.]+$/, ""));
  }
  const entry = compareByKey.value[key];
  if (!entry || !anchor) return;
  showCompareAt(anchor, entry);
}

function showCompare(e: MouseEvent, item: GalleryItem): void {
  const entry = compareByKey.value[keyOf(item)];
  if (!entry) return;
  const anchor = e.currentTarget as HTMLElement | null;
  if (!anchor) return;
  showCompareAt(anchor, entry);
}

function showCompareAt(anchor: HTMLElement, entry: CompareEntry): void {
  const el = (anchor.closest(".card") as HTMLElement) || anchor;
  window.clearTimeout(compareHideTimer);
  compareSide.value = "new";
  compareHover.value = { entry, ...positionFloat(el, 820, 640) };
  closePop();
}

function onCompareEnter(e: MouseEvent, item: GalleryItem): void {
  if (hasCompare(item)) {
    showCompare(e, item);
    return;
  }
  // 悬浮时也补拉一次，省得必须先点一下
  if (item.pendingRerun) void openCompareFor(e, item);
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
        <button :class="{ active: selected === 'all' && !statusFilter, bump: bumpKeys.has('all') }" @click="selectCategory('all')">全部 · {{ stats?.total ?? data?.total ?? items.length }}</button>
        <button v-for="c in categories" :key="c" :class="{ active: selected === c && !statusFilter, bump: bumpKeys.has(c) }" @click="selectCategory(c)">
          {{ catLabel(c) }} · {{ categoryCount(c) }}
        </button>
        <span class="tab-sep" aria-hidden="true"></span>
        <button class="status" :class="{ active: statusFilter === 'favorite', bump: bumpKeys.has('favorite') }" @click="selectStatus('favorite')">
          已收藏 · {{ favoriteCount }}
        </button>
        <button v-if="retryEnabled" class="status" :class="{ active: statusFilter === 'retrying', bump: bumpKeys.has('retrying') }" @click="selectStatus('retrying')">
          重试中 · {{ retryingCount }}
        </button>
        <button v-if="retryEnabled" class="status" :class="{ active: statusFilter === 'needs-update', bump: bumpKeys.has('needs-update') }" @click="selectStatus('needs-update')">
          需更新 · {{ needsUpdateCount }}
        </button>
        <button v-if="retryEnabled" class="status failed" :class="{ active: statusFilter === 'failed', bump: bumpKeys.has('failed') }" @click="selectStatus('failed')">
          失败 · {{ failedCount }}
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
          <option v-if="retryEnabled" value="status:failed">失败 · {{ failedCount }}</option>
        </optgroup>
      </select>
    </nav>

    <div v-if="loading" class="loading">加载中…</div>

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
        <template v-for="c in row.cards" :key="'item' in c ? c.item.imageUrl : c.folder.id">
        <button
          v-if="'folder' in c"
          class="folder in-row"
          :style="{ width: c.w + 'px' }"
          @click="openFolder(c.folder.id)"
        >
          <div class="folder-stack" aria-hidden="true">
            <span class="fplate fplate-back" />
            <span class="fplate fplate-mid" />
            <span class="fplate fplate-front" />
            <div class="fcover">
              <StaticImage v-if="c.folder.cover" :src="c.folder.cover" :alt="c.folder.title" />
              <span v-else class="fempty">分析中</span>
              <span class="fcount" :class="{ analyzing: c.folder.status !== 'done' }">
                {{ c.folder.status === "done" ? c.folder.total : `${c.folder.done}/${c.folder.total}` }}
              </span>
            </div>
          </div>
          <div class="fmeta">
            <b>{{ c.folder.title }}</b>
            <small v-if="c.folder.status !== 'done'">分析中 {{ c.folder.done }}/{{ c.folder.total }}</small>
            <small v-else>
              {{ c.folder.total }} 张 ·
              <template v-if="c.folder.retrying && c.folder.pending">
                有 {{ c.folder.retrying }} 条重试 · {{ c.folder.pending }} 条可更新
              </template>
              <template v-else-if="c.folder.retrying">有 {{ c.folder.retrying }} 条在重试</template>
              <template v-else-if="c.folder.pending">{{ c.folder.pending }} 条可更新</template>
              <template v-else>已完成</template>
            </small>
          </div>
        </button>
        <article
          v-else
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
                'is-compare': retryStateOf(c.item) === 'compare',
                'is-failed': retryStateOf(c.item) === 'failed'
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
              v-if="c.item.pendingRerun"
              class="rerun-btn"
              title="重新分析"
              @click.stop.prevent="reanalyze(c.item)"
            ><ReloadOutlined /> 重试</button>
            <button
              v-if="c.item.retryFailed"
              class="giveup-btn"
              title="放弃这次重分析（保留原识别结果）"
              @click.stop.prevent="discardRetry(c.item)"
            >放弃</button>
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
        </template>
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

/* 数量变化提示：跳动两下（由 WebSocket 推送触发） */
@keyframes tab-bump {
  0% { transform: scale(1); }
  35% { transform: scale(1.16); }
  100% { transform: scale(1); }
}
.tab-list button.bump,
.tab-list button.status.bump,
.tab-list button.active.bump {
  animation: tab-bump 0.42s cubic-bezier(0.34, 1.56, 0.64, 1) 2;
  border-color: #d9ff52;
  color: #eaffb0;
}
@media (prefers-reduced-motion: reduce) {
  .tab-list button.bump { animation: none; border-color: #d9ff52; }
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
/* 行内混排的文件夹：高度由宽高比推出，明细放在封面下方（与图片卡同构） */
.folder.in-row {
  width: auto;
  height: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.folder.in-row .folder-stack {
  width: 100%;
  height: auto;
  aspect-ratio: 0.78;
}
.folder.in-row .fmeta {
  position: static;
  padding: 0;
  margin: 0;
  background: none;
  border-radius: 0;
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
  transform: translate(6px, 0);
}
.fplate-mid {
  border: 1px solid #4b5765;
  background: #232d39;
  transform: translate(4px, 0);
}
.fplate-front {
  border: 1px solid #5d6a7a;
  background: #2b3644;
  transform: translate(2px, 0);
}

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

/* 失败态：淡红主题（状态胶囊 + 卡片按钮） */
.tab-list button.status.failed {
  border-color: rgb(255 138 138 / 42%);
  color: #ffb8b8;
}
.tab-list button.status.failed.active {
  border-color: #ff8a8a;
  background: #ff8a8a;
  color: #1a1113;
}
.tab-list button.status.failed.bump {
  border-color: #ff8a8a;
  color: #ffd0d0;
}
.retry-btn.is-failed {
  opacity: 1;
  color: #ff9b9b;
  border-color: rgb(255 138 138 / 45%);
}
.rerun-btn {
  position: absolute;
  left: 66px;
  bottom: 8px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 9px;
  border: 1px solid rgb(255 255 255 / 22%);
  border-radius: 99px;
  color: #cfd6dd;
  background: rgb(10 12 14 / 62%);
  backdrop-filter: blur(6px);
  font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  cursor: pointer;
  transition: color 140ms ease, border-color 140ms ease;
}
.rerun-btn:hover {
  color: #d9ff52;
  border-color: rgb(217 255 82 / 60%);
}
.giveup-btn {
  position: absolute;
  right: 42px;
  bottom: 8px;
  z-index: 2;
  height: 22px;
  padding: 0 8px;
  border: 1px solid rgb(255 138 138 / 45%);
  border-radius: 6px;
  background: rgb(255 138 138 / 14%);
  color: #ffb8b8;
  font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}
.giveup-btn:hover {
  background: #ff8a8a;
  color: #1a1113;
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
  justify-content: flex-start;
  gap: 6px;
  min-width: 0;
}
.card .cat {
  flex: 0 0 auto;
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
  min-width: 0;
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
