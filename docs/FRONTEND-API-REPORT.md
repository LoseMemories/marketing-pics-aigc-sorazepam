# 前端接口情况报告

> 生成时间：2026-10-29（Asia/Shanghai）
> 适用对象：接手本项目的 agent / 工程师
> 范围：`frontend/` 如何调用后端、全部后端路由清单、代理与切换机制、错误约定

---

## 1. 一句话结论

前端**全部使用相对路径**请求（`/api/...`、`/media/...`、`/gallery/...`、`/health`），
没有硬编码后端地址；请求由 webpack dev-server 代理转发，代理目标可在运行时切换（本地 ⇄ 远程）。

---

## 2. 代理与切换机制

### 2.1 代理覆盖

`frontend/webpack.config.cjs`：

```js
proxy: [
  {
    context: ["/api", "/media", "/health", "/gallery"],
    target: backendOptions[activeBackend],
    router: () => backendOptions[activeBackend],   // 每次请求求值 → 无需重启
    changeOrigin: true
  }
]
```

后端**所有**路由都在上述 4 个前缀之下，因此代理即完整覆盖，不存在"只有图片能访问"的缺口。

### 2.2 切换接口（开发期专用）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/__backend` | 返回 `{ active: "local"\|"remote", options: { local, remote } }` |
| `POST` | `/__backend?name=local\|remote` | 切换代理目标；未知名字返回 400 |

- 由 `devServer.setupMiddlewares` 注册，仅开发服务器存在；生产构建下 `BackendSwitcher` 组件自动隐藏。
- 切换后前端整页 `location.reload()`，避免两个后端的图库/任务数据混用。

### 2.3 环境变量

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| `LOCAL_BACKEND_TARGET` | `http://127.0.0.1:3000` | 本地后端地址 |
| `REMOTE_BACKEND_TARGET` | `http://39.106.168.207:3000` | 远程后端地址 |
| `DEFAULT_BACKEND` | `local` | 启动时默认选中项 |
| `API_PROXY_TARGET` | — | 兼容旧用法：设置后视为远程目标并直接选中 |
| `FRONTEND_PORT` | `5173` | dev-server 端口 |

### 2.4 UI 入口

`frontend/src/shared/components/BackendSwitcher.vue` 挂载在 `App.vue` 页头右侧（`margin-left: auto`），
显示为 `后端 [本地] [远程]` 胶囊控件，`title` 提示目标地址。

---

## 3. 后端路由全清单

按前缀分组，全部经代理转发。`:param` 为路径参数。

### 3.1 `/health`

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/health` | 健康检查，返回 `apiVersion`、`deepSeekConfigured`、`tools{ffmpeg,ffprobe,sips,heifConvert}` |

### 3.2 `/api/v1/gallery`

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/v1/gallery/config` | 图库运行开关（实际只返回 `{ retryEnabled }`） |
| GET | `/api/v1/gallery/stats` | **筛选区全量统计**（与分页完全解耦）：`{ total, categories[{name,total}], favorite, analyzed, needsUpdate, uploads{folders,folderItems,singles} }` |
| GET | `/api/v1/gallery/motionsites` | **全量**扫描（兼容保留，前端已改用 feed） |
| GET | `/api/v1/gallery/folders` | 轻量批次文件夹列表（供进度轮询，不重建会话） |
| GET | `/api/v1/gallery/feed/meta?categories=` | 第一步：返回 `{ sessionId, categories[{name,total}], allCounts, total, allCategories, folders }`；`categories` 为空/非法时后端兜底为全部 |
| GET | `/api/v1/gallery/feed?session=&vw=&vh=` | 第二步：按各分类剩余量等比分配配额，返回 `{ session, items, counts[{name,returned,total,taken}], returned, exhausted }`；`vw`/`vh` 为容器宽与视口高，后端据此估算 **1.5 倍窗口量**（列数 = vw/206，行数 = vh/206，上限 120）；也可用 `limit` 显式覆盖。会话过期返回 `410 FEED_EXPIRED` |
| POST | `/api/v1/gallery/motionsites/:category/:file/favorite` | 收藏/取消收藏单张素材 |

**懒加载协议**：前端只传容器宽 `vw` 与视口高 `vh`，由后端 `estimateBatchSize` 推算一屏卡片数 × 1.5（列宽按 190+16 计算，上限 120），也可用 `limit` 显式覆盖；后端为每个分类维护「已乱序队列 + 前进式游标」（偏移只增不减），因此同一次浏览不会重复返回同一张图；游标状态按 `sessionId` 缓存在内存（TTL 10 分钟，`/feed/meta` 会顺带清理过期会话）。

**计数来源**：筛选区所有数字（全部/各分类/上传/收藏/已解析/需更新）一律取自 `/api/v1/gallery/stats`，不随分页变化；`/feed` 的 `counts` 仅用于调试，前端不据此渲染标签。

### 3.3 `/api/v1/live-assets`

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/api/v1/live-assets` | 上传单个实况文件（multipart） |
| POST | `/api/v1/live-assets/apple-pair` | 上传 Apple `HEIC + MOV` 配对（字段 `still`、`motion`） |
| GET | `/api/v1/live-assets/:id` | 资产详情 |
| POST | `/api/v1/live-assets/:id/scene-analysis` | DeepSeek 画面理解 |
| POST | `/api/v1/live-assets/:id/layout-plan` | L1 构图层 |
| POST | `/api/v1/live-assets/:id/design-layout` | L2 设计师层 |
| POST | `/api/v1/live-assets/:id/composition` | L3 合成数据 |
| POST | `/api/v1/live-assets/:id/compose` | Canvas 合成 |
| GET | `/api/v1/live-assets/:id/design` | 读取已保存设计 |
| GET | `/api/v1/live-assets/:id/copy-source` | 读取文案源 |

### 3.4 `/api/v1/workflow`

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/api/v1/workflow/analyze` | 单张上传 → 后台分析，返回 `{ jobId }` |
| GET | `/api/v1/workflow/jobs/:id` | 轮询任务状态与 `steps[]` |
| POST | `/api/v1/workflow/batch` | 创建批量分析任务 |
| GET | `/api/v1/workflow/batches` | 批量任务列表 |
| GET | `/api/v1/workflow/batches/:id` | 批量任务详情 |
| POST | `/api/v1/workflow/save` | 落库（确认写入图库） |
| POST | `/api/v1/workflow/reanalyze` | 重新分析单张 |
| GET | `/api/v1/workflow/reanalyze/status` | 重试队列状态 |
| POST | `/api/v1/workflow/reanalyze/compare` | 新旧分析对比 |
| POST | `/api/v1/workflow/reanalyze/apply` | 应用新分析 |
| DELETE | `/api/v1/workflow/uploads/:base` | 删除已落库素材（**仅 DELETE**，无 GET） |

### 3.5 其他

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/v1/demo-assets` | 内置演示实况资产 |
| GET | `/api/v1/photo-library` | 本机自拍/照片库扫描结果（支持 query 过滤） |

### 3.6 媒体资源（非 `/api`）

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/media/:id/preview/:filename` | 资产预览：`poster.jpg`、`thumb.jpg`、`motion.mp4`（定义在 `live-asset.routes.ts`） |
| GET | `/gallery/motionsites/:category/:file` | 图库静态图片 |

> 资产详情返回 `posterUrl` / `thumbUrl` / `videoUrl` 均为 `/media/...` 相对路径，前端直接 `<img src>` / `<video src>` 使用。

---

## 4. 前端调用点映射

| 前端文件 | 调用接口 |
| --- | --- |
| `entities/live-asset/api/live-asset.api.ts` | `POST /api/v1/live-assets`、`POST /api/v1/live-assets/apple-pair`（`sendForm`，带上传进度） |
| `features/design-assistant/api/design-assistant.api.ts` | `POST .../scene-analysis`、`.../layout-plan`、`.../composition`、`.../design-layout`、`.../compose`；`GET .../design`、`.../copy-source` |
| `features/photo-library/api/photo-library.api.ts` | `GET /api/v1/photo-library${query}` |
| `features/photo-library-import/api/demo-assets.api.ts` | `GET /api/v1/demo-assets` |
| `pages/gallery/GalleryPage.vue` | `GET /api/v1/gallery/config`、`GET /api/v1/gallery/motionsites`、`POST .../favorite`、`GET /api/v1/workflow/jobs/:id`、`POST /api/v1/workflow/reanalyze`、`.../reanalyze/compare`、`.../reanalyze/apply`、`GET /api/v1/workflow/reanalyze/status`、`DELETE /api/v1/workflow/uploads/:base` |
| `pages/workflow/WorkflowPage.vue` | `POST /api/v1/workflow/analyze`、`POST /api/v1/workflow/batch`、`GET /api/v1/workflow/batches/:id`、`GET /api/v1/workflow/jobs/:id`、`POST /api/v1/workflow/save` |
| `shared/components/BackendSwitcher.vue` | `GET/POST /__backend`（仅开发期） |
| `pages/live-workbench/*` | 通过上述 assets / design-assistant api 间接调用 |

---

## 5. 错误约定

后端错误体（`backend/src/runtime/build-server.ts` 的 `setErrorHandler`）：

```json
{ "error": { "code": "INVALID_REQUEST", "message": "…", "details": {} } }
```

前端（`shared/api/http-client.ts`）统一转成：

```ts
class ApiClientError extends Error {
  readonly code: string;    // 后端 error.code，或 "PHOTO_HELPER_OFFLINE" 等本地码
  readonly status: number;  // HTTP 状态码，网络失败为 0
}
```

常见 code：`INVALID_REQUEST`(400)、`INVALID_MOTION_VIDEO`(422)、`PHOTO_HELPER_OFFLINE`(0，本机相册助手未启动)。

---

## 6. 长任务协议

`POST /api/v1/workflow/analyze` 立即返回 `{ jobId }`，前端轮询 `GET /api/v1/workflow/jobs/:jobId`：

```json
{
  "status": "running | done | error",
  "steps": [ { "step": "主体探查", "status": "done", "detail": "2332 tokens" } ],
  "result": { "...": "分析结果" }
}
```

典型步骤序列：`主体探查` → `SAM 分割` / `色块探查` → `文字探查` → `语汇分析` → `代码回填` → `写入结果`。
远程 CPU 环境下单张约 1–3 分钟，轮询间隔建议 ≥1s。

---

## 7. 本地与远程后端差异

同一套接口，工具链能力不同（`/health.tools` 可判断）：

| 能力 | 本地（macOS） | 远程（Linux 容器） |
| --- | --- | --- |
| `ffmpeg` / `ffprobe` | ✅ | ✅ |
| `sips` | ✅ | ❌（macOS 专有） |
| `heifConvert` | ❌ | ✅ heif-convert 1.23.6 |

对前端透明：HEIC 两种环境都能生成预览，只是实现路径不同（sips vs heif-convert）。

---

## 8. 验证记录

以下均通过 dev-server（`127.0.0.1:5174`）代理实测：

| 接口 | 本地后端 | 远程后端 |
| --- | --- | --- |
| `/health` | 200（`sips:true, heifConvert:false`） | 200（`sips:false, heifConvert:true`） |
| `/api/v1/gallery/config` | 200 | 200 |
| `/api/v1/demo-assets` | 200 | 200 |
| `/api/v1/photo-library` | 200 | 200 |
| `/api/v1/gallery/motionsites` | 200 | 200 |
| `/api/v1/workflow/batches` | 200 | 200 |
| `/api/v1/workflow/reanalyze/status` | 200 | 200 |
| 图片 `/gallery/motionsites/...` | 200 | 200 |
| `/__backend` 切换 | local → remote → local 均生效 | 同左 |

---

## 9. 给 agent 的操作要点

1. **改接口别改地址**：新增调用一律用相对路径（`/api/v1/...`），否则切换后端会失效。
2. **新增前缀要动代理**：若新接口不以 `/api`、`/media`、`/gallery`、`/health` 开头，必须同步加入 `webpack.config.cjs` 的 `proxy.context`。
3. **判断当前后端**：`GET /__backend`，或看 `/health.tools`（`sips` 是本地特征）。
4. **切换后需重载**：切换器已自动 `location.reload()`；脚本化切换时请自行刷新页面。
5. **生产构建无切换器**：`/__backend` 不存在，组件会自动隐藏，不要依赖它做业务逻辑。

---

## 10. 相关文件

| 文件 | 作用 |
| --- | --- |
| `frontend/webpack.config.cjs` | 代理、`/__backend` 控制接口、环境变量 |
| `frontend/src/shared/components/BackendSwitcher.vue` | 切换器组件 |
| `frontend/src/app/App.vue` | 页头挂载点 |
| `frontend/src/shared/api/http-client.ts` | 请求封装与 `ApiClientError` |
| `backend/src/runtime/build-server.ts` | 路由注册与错误处理 |
| `docs/DEPLOY-REPORT.md` | 后端部署报告（配套文档） |
