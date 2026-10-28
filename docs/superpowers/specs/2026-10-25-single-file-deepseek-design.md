# Marketing Photo AIGC：严格单文件导入与 DeepSeek 设计

## 1. 决策

V1 上传入口改为严格单文件模式。用户只选择一个动态照片文件，后端必须从该文件中识别并提取静态主图和真实视频轨。

如果文件中不存在可验证的视频轨，任务直接失败。页面不显示双文件上传，不提供补充 MOV 的降级入口，也不把普通静态图交给视频生成模型伪造为实况。

同时接入 DeepSeek Flash，用于派生主图的场景理解和受约束的 Canvas 动效编排。DeepSeek 不参与视频轨提取，不修改原视频，也不生成任意 JavaScript。

## 2. 成功标准

1. 前端只显示一个文件选择区域。
2. 接口只接收一个 multipart 文件字段 `livePhoto`。
3. 后端保存完整原始单文件并计算 SHA-256。
4. 后端从文件中找到内嵌或追加的视频容器，提取后必须通过 ffprobe 解码验证。
5. 后端从原始文件生成 JPEG 主图预览，从提取视频生成 H.264 MP4 预览。
6. 不含真实视频轨的 JPEG、HEIC、HEIF 或 AVIF 返回明确错误，不创建成功资产。
7. 上传成功后可选择把 JPEG 预览主图发送给 DeepSeek 进行画面分析。
8. DeepSeek 只返回经过 Schema 校验的场景分析和 CompositionSpec。
9. Canvas 模块渲染 CompositionSpec，不执行模型生成的代码。
10. 原有类型检查、测试和构建继续通过，并增加单文件提取测试。

## 3. 支持边界

### 3.1 接受的单文件

- JPEG Motion Photo：图片数据后追加 MP4/MOV 的 Android 或鸿蒙动态照片。
- HEIC/HEIF/AVIF Motion Photo：容器内存在可定位、可提取并通过 ffprobe 验证的视频资源。

### 3.2 明确拒绝

- 普通 JPEG、PNG、HEIC、HEIF、AVIF。
- 仅包含静态图的 Apple HEIC。
- Apple Live Photo 的静态资源和 paired MOV 被分开后，只上传其中一份的情况。
- ZIP、目录、多选文件和独立 MOV/MP4。
- 虽然包含 `ftyp` 字节，但提取结果不能被 ffprobe 识别的视频候选。

Apple Live Photo 在系统中虽然表现为一个资产，但常规文件层仍由静态图与 paired video 组成。严格单文件 Web 模式不会宣称兼容仅包含静态部分的 Apple Live Photo。

## 4. 总体数据流

```text
单个动态照片文件
  → 文件签名与大小校验
  → 保存不可变 original 文件
  → 读取 Motion Photo 元数据与容器结构
  → 定位候选视频起点和长度
  → 提取候选视频
  → ffprobe 验证
  → 生成 JPEG poster 与 H.264 preview
  → 建立 LiveAsset
  → 前端实况预览
  → 用户主动点击 AI 分析
  → DeepSeek 场景理解
  → 用户输入营销主题
  → DeepSeek 生成 CompositionSpec
  → Canvas 确定性渲染
```

## 5. 后端模块调整

### 5.1 Live Asset 输入模型

旧模型：

```ts
{ still: IncomingUploadFile; motion: IncomingUploadFile }
```

新模型：

```ts
interface ImportLiveAssetInput {
  livePhoto: IncomingUploadFile;
}
```

来源平台不再由用户手动选择。解析器根据 XMP、容器品牌和结构输出 `platformHint`，无法可靠识别时使用 `unknown`。

### 5.2 MotionPhotoExtractor Port

应用层新增接口：

```ts
interface MotionPhotoExtractor {
  inspect(path: string): Promise<MotionPhotoInspection>;
  extract(
    sourcePath: string,
    inspection: MotionPhotoInspection,
    destination: ExtractedResourcePaths
  ): Promise<ExtractedMotionPhoto>;
}
```

`MotionPhotoInspection` 至少包含：

- 静态容器格式；
- 视频候选偏移；
- 视频候选长度；
- XMP Motion Photo 标记；
- 推断平台；
- 使用的定位策略；
- 诊断信息。

应用用例只依赖 Port，不依赖具体 XMP 或字节扫描实现。

### 5.3 单文件解析策略

解析顺序：

1. 校验 JPEG、HEIC、HEIF 或 AVIF 文件签名；PNG 不再接受，因为标准 PNG 不承载目标动态照片结构。
2. 读取前部元数据，识别 Google/Samsung/Android Motion Photo XMP 字段、Container ItemLength 和 MicroVideoOffset 等线索。
3. 按元数据计算视频候选范围。
4. 如果元数据不足，流式扫描 ISO BMFF `ftyp` box 候选，不把整个大文件读入内存。
5. JPEG 忽略静态图内部数据，只接受位于 JPEG 图像主体之后的视频候选。
6. HEIC/AVIF 忽略文件开头的图像容器 `ftyp`，只检查后续候选资源。
7. 候选按可信度排序，逐个切片到临时文件并交给 ffprobe。
8. 第一个包含有效视频流、正时长和有效尺寸的候选才可作为动态轨。
9. 所有候选失败时返回 `MOTION_TRACK_NOT_FOUND`。

仅搜索字节串不足以判定成功；ffprobe 验证是硬门槛。

### 5.4 文件布局

```text
backend/data/live-assets/<asset-id>/
├── source/
│   └── original.<ext>       # 用户上传的完整单文件，只读
├── derived/
│   ├── still.<ext>          # 提取或引用的静态部分
│   └── motion.mp4|mov       # 提取的视频轨
├── preview/
│   ├── poster.jpg
│   └── motion.mp4
├── analysis/
│   ├── scene-analysis.json
│   └── composition.json
└── metadata.json
```

`source/original` 是唯一原始输入。`derived` 和 `preview` 都可以重建，禁止覆盖原文件。

### 5.5 新数据字段

`LiveAssetRecord` 增加：

- `source.original`；
- `derived.still` 与 `derived.motion`；
- `containerExtraction.strategy`；
- `containerExtraction.videoOffset`；
- `containerExtraction.videoLength`；
- `containerExtraction.xmpDetected`。

API DTO 不暴露服务器绝对路径、原文件下载地址或 DeepSeek 密钥。

## 6. API 调整

### `POST /api/v1/live-assets`

Multipart 字段：

- `livePhoto`：唯一必填文件。

成功仍返回现有 `LiveAssetDto`，因此预览组件无需了解容器提取细节。

### `POST /api/v1/live-assets/:id/scene-analysis`

行为：

1. 读取已生成的 `preview/poster.jpg`；
2. 以 JPEG Base64 `image_url` 发送给 DeepSeek；
3. 默认 `detail: low`，降低图像 Token 成本；
4. 要求 JSON 输出；
5. 使用 Zod 校验后保存为 `analysis/scene-analysis.json`。

输出包括主体描述、环境描述、主色、建议文字安全区、营销语气和画面风险。模型判断只用于设计建议，不成为主体蒙版或视频分层依据。

### `POST /api/v1/live-assets/:id/composition`

请求：

```json
{
  "brief": "新品上市，突出轻盈与户外感"
}
```

后端把场景分析、视频时长、画布尺寸、允许的组件类型和用户 brief 发送给 DeepSeek。返回结果必须通过 CompositionSpec Schema；解析或校验失败时不写入工程。

## 7. DeepSeek 模块

新增：

```text
backend/src/modules/design-assistant/
├── domain/
│   ├── scene-analysis.types.ts
│   └── composition-spec.types.ts
├── application/
│   ├── analyze-scene.ts
│   ├── generate-composition.ts
│   └── design-assistant.ports.ts
├── infrastructure/
│   └── deepseek-design-assistant.ts
└── interfaces/http/
    └── design-assistant.routes.ts
```

DeepSeek 适配器使用参考项目相同的 OpenAI 兼容方式：

- Base URL：默认 `https://api.deepseek.com`；
- 模型：默认 `deepseek-flash`；
- 超时：默认 60 秒；
- 重试：默认 1 次；
- 密钥：仅从后端环境读取。

环境变量：

```text
DEEPSEEK_API_KEY
DEEPSEEK_BASE_URL
DEEPSEEK_MODEL
MODEL_GATEWAY_TIMEOUT_MS
MODEL_GATEWAY_MAX_RETRIES
DEEPSEEK_IMAGE_DETAIL
```

`.env.example` 只写占位符。真实值放入 Git 忽略的 `backend/.env.local`，不得进入接口、日志、测试快照或前端 bundle。

## 8. CompositionSpec 边界

第一版只允许：

- `text`：标题或短标签；
- `pulse`：圆形强调光晕。

每个 Layer 必须包含：

- 唯一 ID；
- `startMs` 与 `endMs`，且不超过视频时长；
- 归一化坐标 `x`、`y`，范围 0～1；
- 白名单颜色；
- 文本长度上限；
- 固定的效果类型。

模型不能输出脚本、HTML、CSS、Shader、网络 URL 或文件路径。Canvas Renderer 继续使用现有确定性采样接口绘制。

## 9. 前端调整

### 9.1 上传模块

`LiveAssetUploader` 改为：

- 一个大尺寸单文件选择区；
- 接受 `.jpg,.jpeg,.heic,.heif,.avif`；
- 不显示来源平台；
- 不显示视频选择器；
- 上传文案明确说明“文件内部必须包含动态轨”。

### 9.2 预览与 AI 设计

上传成功后：

1. 继续使用 `LivePhotoPreview` 播放派生视频；
2. 显示“AI 分析画面”按钮；
3. 按钮旁说明派生 JPEG 会发送至 DeepSeek；
4. 分析完成后显示摘要和营销主题输入框；
5. 点击“生成动效方案”获取 CompositionSpec；
6. 把 CompositionSpec 转换为 EffectTimeline，并交给已有 `CanvasStage`；
7. DeepSeek 失败时保留上传和实况预览，不清除资产。

上传、预览、AI 设计、动效时间轴和 Canvas 渲染仍保持独立组件。

## 10. 错误码

- `UNSUPPORTED_LIVE_PHOTO_CONTAINER`：不是支持的照片容器。
- `MOTION_TRACK_NOT_FOUND`：文件中没有可验证的视频轨。
- `MOTION_TRACK_CORRUPTED`：找到候选资源但无法完整解码。
- `LIVE_PHOTO_EXTRACTION_FAILED`：容器或文件读取失败。
- `MODEL_GATEWAY_NOT_CONFIGURED`：没有可用密钥。
- `MODEL_GATEWAY_AUTH_ERROR`：DeepSeek 鉴权失败。
- `MODEL_GATEWAY_RATE_LIMITED`：DeepSeek 限流。
- `MODEL_GATEWAY_TIMEOUT`：DeepSeek 超时。
- `MODEL_OUTPUT_INVALID`：模型响应不符合业务 Schema。

前端对 `MOTION_TRACK_NOT_FOUND` 的提示必须明确：当前严格单文件模式不接受独立 Apple HEIC，不能要求用户继续上传 MOV。

## 11. 隐私与安全

- 上传动作只传至用户本机后端。
- 只有用户点击“AI 分析画面”时，poster JPEG 才发送给 DeepSeek。
- 发送前显示用途说明；不发送原始 Motion Photo、原视频、音频、EXIF 或 GPS。
- 默认在 poster 生成阶段移除不必要元数据。
- DeepSeek 请求和错误日志不得记录 Base64 图片、Authorization Header 或 API Key。
- 参考项目中的密钥不复制到示例文件；现有明文密钥应轮换。

## 12. 测试

### 自动化测试

- JPEG Motion Photo 候选定位；
- HEIC/AVIF 开头图像 `ftyp` 排除；
- 普通 JPEG 返回 `MOTION_TRACK_NOT_FOUND`；
- 伪造 `ftyp` 但 ffprobe 失败时不接受；
- 大文件使用流式扫描而不是整文件读取；
- 严格单文件 multipart 接口；
- DeepSeek 未配置、鉴权、限流、超时和非法 JSON；
- CompositionSpec 时间、坐标和类型约束；
- 前端单文件上传状态；
- EffectTimeline 正确消费 CompositionSpec。

### 联调验收

1. 使用真实 Android Motion Photo 上传并预览；
2. 使用已经验证的鸿蒙动态照片上传并预览；
3. 上传普通 JPEG，确认明确拒绝；
4. 上传独立 Apple HEIC，确认明确说明不支持；
5. 点击 AI 分析，确认只发送 JPEG poster；
6. 生成动效后，确认 Canvas 叠加不改变底层视频。

## 13. 非目标

- 不恢复缺失的 Apple paired MOV；
- 不从静态图片生成视频；
- 不接入 SAM2 或动态主体分层；
- 不把 DeepSeek 场景理解当作像素级分割；
- 不生成或执行自由 JavaScript；
- 不在本轮重新封装 Apple Live Photo、Android Motion Photo 或鸿蒙动态照片。
