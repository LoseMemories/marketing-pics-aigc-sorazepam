# Marketing Photo AIGC：macOS 相册导入与远程演示双模式

## 1. 背景与产品判断

Apple Live Photo 在系统相册中表现为一个资产，但原始资源通常由静态图片和 paired video 两部分组成。普通 Web 文件选择器只能取得文件，不能直接访问 macOS PhotoKit，也无法从一个独立 HEIC 中恢复不存在的运动数据。

本项目是面试用途的产品演示，同时需要满足两个场景：

1. 创作者在自己的 Mac 上从系统“照片”图库选择真实 Live Photo，保留原始运动和声音。
2. 面试官通过远程网址直接体验产品，不安装助手、不准备测试素材，也不经过上传步骤。

因此产品从“严格单文件上传”调整为“一个实况资产”。资产可以由 HEIC 与 MOV 两个底层资源组成，但用户只执行一次系统相册选择。

## 2. 本期范围

本期优先保证本机开发链路可运行，并同时准备可部署的演示模式。

包含：

- macOS PhotoKit Helper 的本机开发版本；
- Vue 创作者模式中的“从 Mac 相册选择”入口；
- Node 后端接收 Apple 静态资源与 paired video 的统一导入用例；
- 项目内置的完整实况演示样例；
- 远程演示模式隐藏上传，直接进入样例体验；
- 现有实况预览、DeepSeek 分析、CompositionSpec 和 Canvas 动效链路复用。

本期不包含：

- iPhone App；
- macOS Helper 的签名、公证、DMG 或自动更新；
- 公网用户上传自己的 Live Photo；
- 账号、计费、多租户、对象存储和生产级任务队列；
- Android、鸿蒙适配；
- SAM2、视频动态分层、最终 Live Photo 回写。

## 3. 运行模式

### 3.1 Creator 模式

用于本机开发与创作者准备演示素材。

- 页面显示“从 Mac 相册选择”。
- 页面探测本机 Helper 是否运行。
- Helper 不可用时显示启动说明，不伪装成普通 HEIC 上传。
- Helper 打开系统照片选择器，用户选择一个 Live Photo 资产。
- Helper 导出静态资源和 paired video，一次提交给本地 Node 后端。
- 后端生成浏览器预览并返回 `LiveAssetDto`。
- 页面进入现有预览、AI 分析和 Canvas 动效流程。

原有 Android/Harmony 单文件 Motion Photo 解析器可以保留为内部兼容能力，但不再作为 macOS 主入口。

### 3.2 Demo 模式

用于远程部署和面试官独立体验。

- 页面隐藏文件上传和 PhotoKit Helper 入口。
- 页面展示内置实况案例列表，或默认加载第一条案例。
- 文案为：“已为你准备完整的实况照片样例，无需上传，即可体验 AI 画面理解与营销动效设计。”
- 面试官选择样例后直接进入预览、AI 分析和 Canvas 动效。
- 面试官不需要安装 Helper，也不需要拥有 Live Photo。

模式通过构建或运行时配置选择，不允许根据请求失败自动切换，以免掩盖错误。

## 4. 总体架构

```text
Creator 模式

Vue Web
  → GET http://127.0.0.1:<helper-port>/health
  → POST /pick
  → macOS PhotoKit Helper
  → 系统照片选择器
  → PHAssetResourceManager 导出 photo + pairedVideo
  → POST Node /api/v1/live-assets/apple-pair
  → ffprobe / FFmpeg 生成预览
  → LiveAssetDto
  → Vue 预览与设计

Demo 模式

Vue Web
  → GET Node /api/v1/demo-assets
  → 选择预置 LiveAssetDto
  → Vue 预览与设计
```

## 5. macOS PhotoKit Helper

### 5.1 工程位置与技术

```text
native/macos-photo-helper/
├── Package.swift
├── Sources/
│   ├── App/
│   ├── PhotoLibrary/
│   ├── LocalBridge/
│   └── Upload/
├── Resources/
│   └── Info.plist
└── scripts/
    └── build-app.sh
```

- Swift + SwiftUI；
- PhotoKit / PhotosUI；
- 最低目标 macOS 13；
- 使用应用包承载 `NSPhotoLibraryUsageDescription`，确保照片权限归属明确；
- 本期本地编译运行，不做 Developer ID 签名和公证。

### 5.2 Helper 职责

Helper 只负责：

1. 请求或检查照片库权限；
2. 展示系统照片选择器，并限制为 Live Photo；
3. 根据选中资产读取原始 photo 与 `pairedVideo` 资源；
4. 将资源发送给 Node 后端；
5. 把后端返回的 `LiveAssetDto` 交还网页；
6. 清理 Helper 自己产生的临时文件。

Helper 不执行 FFmpeg、AI 分析和 Canvas 渲染，不长期保存照片资源。

### 5.3 本地桥协议

Helper 绑定固定 loopback 地址，不监听局域网网卡。

```text
GET  /health
POST /pick
```

`/health` 返回版本与权限状态。`/pick` 只启动一次显式的系统选择流程；如果已有选择窗口，返回冲突状态，禁止并发弹窗。

本地演示阶段允许来源：

- `http://127.0.0.1:5173`
- `http://localhost:5173`
- 配置中明确列出的本地开发端口

Helper 必须在主线程展示 UI。取消选择、权限拒绝、非 Live Photo、资源导出失败和后端不可达都返回稳定错误码。

## 6. 后端资产输入模型

应用层统一使用一个实况资产包，而不是一个物理文件：

```ts
interface ImportLivePhotoAssetInput {
  source: "apple-photo-library" | "embedded-motion-photo" | "demo";
  still: IncomingUploadFile;
  motion: IncomingUploadFile;
  platform: "apple" | "android" | "harmony" | "unknown";
  sourceAssetIdentifier?: string;
}
```

接口适配层可以有两条入口：

- `POST /api/v1/live-assets/apple-pair`：接收 Helper 提交的 photo + pairedVideo；
- `POST /api/v1/live-assets`：保留内嵌视频的 Motion Photo 单文件入口。

两条入口最终调用同一个资产规范化用例：

1. 保存不可变原始资源；
2. 校验静态图、视频时长、尺寸、编解码和音频；
3. Apple 来源保存 `sourceAssetIdentifier`；
4. 生成 JPEG poster 与 H.264 MP4 preview；
5. 写入统一 `LiveAssetRecord`；
6. 返回现有 `LiveAssetDto`。

原视频轨不得由生成模型替换。Helper 取得的 paired video 是 Apple 原始运动内容。

## 7. 内置演示资产

内置资产不是单张静态图片，而是已经规范化的完整实况案例：

```text
backend/demo-assets/<slug>/
├── manifest.json
├── preview/
│   ├── poster.jpg
│   └── motion.mp4
└── analysis/
    └── scene-analysis.json
```

`manifest.json` 使用固定 UUID，并包含媒体时长、尺寸、音频、来源说明和展示文案。后端启动时以幂等方式注册内置资产，避免前端伪造 `LiveAssetDto`，并保证 DeepSeek/Composition 接口仍能按资产 ID 工作。

演示二进制资源应短小、可公开展示、不包含隐私信息。第一版提供 1～2 个案例即可。

新增接口：

```text
GET /api/v1/demo-assets
```

返回案例标题、封面和对应 `LiveAssetDto`。Demo 模式加载失败时显示明确错误，不回退到上传页。

## 8. 前端模块

```text
frontend/src/features/photo-library-import/
├── api/
│   ├── photo-helper.api.ts
│   └── demo-assets.api.ts
├── components/
│   ├── MacPhotoLibraryPicker.vue
│   └── DemoAssetPicker.vue
├── composables/
│   └── usePhotoLibraryImport.ts
└── model/
    └── import-source.types.ts
```

工作台只负责组合模块：

- Creator 模式挂载 `MacPhotoLibraryPicker`；
- Demo 模式挂载 `DemoAssetPicker`；
- 两者都只向工作台发出 `LiveAsset`；
- `LivePhotoPreview`、`AiDesignPanel`、Canvas 时间轴不感知资源来源。

运行模式使用显式配置：

```ts
type AppMode = "creator" | "demo";
```

本地开发默认为 `creator`。远程构建显式设置为 `demo`。

## 9. 错误处理

稳定错误至少包括：

- `PHOTO_HELPER_UNAVAILABLE`：Helper 未启动；
- `PHOTO_LIBRARY_PERMISSION_DENIED`：用户拒绝照片权限；
- `PHOTO_PICKER_CANCELLED`：用户取消，不显示为红色系统故障；
- `NOT_A_LIVE_PHOTO`：选择项没有 paired video；
- `PHOTO_RESOURCE_EXPORT_FAILED`：PhotoKit 导出资源失败；
- `APPLE_PAIR_INVALID`：后端无法验证静态或视频资源；
- `DEMO_ASSET_UNAVAILABLE`：内置案例缺失或损坏。

任何失败都不能用 AI 生成视频冒充原始实况。

## 10. 本地优先实施顺序

1. 把后端领域模型从“单物理文件”扩展为“实况资产包”，增加 Apple pair 导入接口。
2. 加入一个体积可控的完整演示案例和 `/api/v1/demo-assets`。
3. 前端加入显式 `creator/demo` 模式和演示案例入口。
4. 创建 macOS Helper 最小应用包，完成权限、Live Photo 选择与资源导出。
5. Helper 调用本地 Node 接口，网页获取 `LiveAssetDto`。
6. 验证现有预览、DeepSeek 和 Canvas 功能不回归。
7. 增加远程 demo 构建命令，但不在本期执行生产级部署。

## 11. 验收标准

### 本机 Creator 模式

1. `pnpm dev` 启动现有 Web 与 Node 服务。
2. Helper 可由项目脚本编译和启动。
3. 首次使用出现 macOS 照片权限请求。
4. 网页点击一次即可打开系统照片选择器。
5. 选择 Live Photo 后，后端收到真实 photo 与 paired video。
6. 页面显示原主图，交互时播放原视频和音频。
7. DeepSeek 与 Canvas 动效仍可使用。

### 远程 Demo 模式

1. 页面不显示上传或 Helper 安装要求。
2. 页面显示内置样例提示与案例选择。
3. 无本地照片资源也能进入完整预览与设计流程。
4. 内置视频、封面和元数据随部署产物提供。

### 工程质量

1. Swift、后端、前端分别保持 UI、运行时、类型和适配层边界。
2. 原始 Apple 资源不被覆盖。
3. 临时文件在成功、失败与取消路径均被清理。
4. TypeScript 类型检查、测试和构建通过。
5. Helper 资源导出、并发限制和错误映射具备自动化测试或可重复的本地验证步骤。

## 12. 后续但非本期

- Helper 签名、公证、DMG 与自动更新；
- `marketing-photo://` 自定义协议；
- 公网 Import Session 和预签名上传；
- iOS App 的 PhotosPicker/PhotoKit 适配器；
- 对象存储、任务队列和权限系统；
- Android/Harmony 系统相册适配。
