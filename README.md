# Marketing Photo AIGC

实况照片营销增强工程的第一个可运行版本：严格上传一个实况照片文件，后端保留原文件、自动拆出主图与内嵌视频轨并生成浏览器预览；DeepSeek Flash 理解主图并编排受控的 Canvas 动效。

> 这是整合版仓库：前后端源码、DeepSeek 执行脚本与提示词文档都已纳入本仓库。模型权重、图库数据、字体与原始素材等大体积资源只保存在本地 / 远程 Linux 服务器，不进 Git。

## 整合版目录

```text
backend/                     Fastify 后端、图库/上传/分析队列、Python 分析调用
frontend/                    Vue 3 前端（public/fonts 字体不进 Git）
native/macos-photo-helper    macOS 原生辅助
deploy/                      部署配置
docs/                        项目设计与计划文档
resources/
  deepseek/crawl/            workflow-analyze.py、design_fill.py、runlog.py 等执行脚本
  deepseek/docs/             DeepSeek / 设计语汇提示词与交接文档（00–14）
  deepseek/prompts/          提示词片段与导出脚本
  deepseek/samples/          真实运行样例
  deepseek/tools/            设计语汇工具
  crawl-raw/                 原始灵感素材（仅本地/服务器，不进 Git）
models/                      Python 依赖与权重（仅本地/服务器，见 models/README.md）
backend/data/                图库与运行时数据（仅本地/服务器，不进 Git）
backend/assets/fonts/        后端字体（仅本地/服务器，不进 Git）
backend/selfies/             演示实况照片（二进制不进 Git，.md 说明入库）
```

`resources/deepseek/crawl/workflow-analyze.py` 会从 `backend/.env.local` 读取密钥，并读取 `resources/deepseek/docs/12-设计语汇分析提示词-v3.2-代码回填版.md` 与 `resources/deepseek/crawl/ds-subject-prompt.md`；脚本内路径均相对仓库根目录，不需要再改绝对路径。

## 当前范围

- 接口只接受一个 `livePhoto` 文件，不保留双文件兼容入口
- 支持含内嵌/尾随视频轨的 JPEG、HEIC、HEIF、AVIF
- 原文件、拆轨结果与浏览器预览分开保存
- MOV/MP4 统一生成 H.264 MP4 预览
- HEIC/HEIF 在 macOS 使用 `sips` 生成 JPEG 预览
- 前端按模块分离上传、预览、动效时间轴和 Canvas 渲染
- DeepSeek 只接收派生的主图 JPEG，返回经过 Schema 校验的画面分析和声明式动效数据，不执行模型生成代码

普通静态图和独立的 Apple `HEIC + MOV` 文件对会在严格单文件模式下被拒绝。当前版本不包含 SAM2、动态分层、正式视频合成和实况文件重新封装。

## 目录

```text
backend/src/runtime                         进程启动与依赖组装
backend/src/modules/live-asset/domain       领域类型与资源规则
backend/src/modules/live-asset/application  上传与查询用例
backend/src/modules/live-asset/infrastructure 文件、ffprobe、FFmpeg 适配器
backend/src/modules/live-asset/interfaces   HTTP 接口
backend/src/modules/design-assistant        DeepSeek 网关、画面分析与动效编排
frontend/src/features/live-upload           上传组件与状态
frontend/src/features/live-preview          实况预览与交互
frontend/src/features/design-assistant      AI 分析与编排面板
frontend/src/features/motion-effects        独立动效时间轴
frontend/src/features/canvas-renderer       Canvas 生命周期与绘制
```

## 环境

- Node.js 20 或更高
- pnpm 10 或更高
- macOS 推荐；项目依赖会提供 FFmpeg/ffprobe 开发二进制

可通过 `FFMPEG_PATH` 和 `FFPROBE_PATH` 改用部署环境中的系统二进制。

将 `.env.example` 复制为 `backend/.env.local`，填入 `DEEPSEEK_API_KEY`。该文件已被 Git 忽略。

## 启动

```bash
pnpm install
pnpm dev
```

- 前端：<http://127.0.0.1:5173>
- 后端：<http://127.0.0.1:3000>
- 健康检查：<http://127.0.0.1:3000/health>

Python 分析链路的依赖与权重默认放在仓库内 `models/`（结构见 `models/README.md`），无需额外配置：
`models/pylibs39` 提供 Python 依赖，`models/sam_vit_b.pth` 是 SAM ViT-B 权重，
`models/easyocr-model` 提供 OCR 权重。该目录体积约 1.8GB 且不入库，需按文档重建或从已有环境拷贝。

如需使用其他位置，可用以下环境变量覆盖：

```bash
WORKFLOW_PYTHON=/usr/bin/python3
WORKFLOW_MODELS_DIR=/absolute/path/to/models          # 整体切换 models 根目录
WORKFLOW_PYTHONPATH=/absolute/path/to/models/pylibs39
SAM_CHECKPOINT=/absolute/path/to/models/sam_vit_b.pth
WORKFLOW_ANALYZE_SCRIPT=/absolute/path/to/resources/deepseek/crawl/workflow-analyze.py
```

## 数据与资源

Git 只保存源码、README、产品文档与项目环境配置；以下大体积资源**不进 Git**，本地与远程 Linux 服务器各保留一份：

| 目录 | 内容 | 说明 |
| --- | --- | --- |
| `models/` | Python 依赖 + SAM/EasyOCR/Florence2 权重 | 按 `models/README.md` 重建或从已有环境拷贝 |
| `backend/data/` | 图库数据 `inspiration` 与运行时数据 | 直接拷贝整个目录 |
| `backend/assets/fonts/` | 后端字体 | 直接拷贝目录 |
| `frontend/public/fonts/` | 前端字体 | 直接拷贝目录 |
| `resources/crawl-raw/` | 原始爬取素材 | 直接拷贝目录 |
| `backend/selfies/`（媒体文件） | 演示实况照片 | 拷贝媒体文件，`.md` 说明仍入库 |

- `backend/.env.local` 保存本地密钥，不提交到 Git；提交时用 `.env.example` 作为模板。
- `backend/data/` 已整体忽略，`live-assets/`、`incoming/` 等运行时生成目录无需单独配置。

## 检查

```bash
pnpm check
```

上传成功后的本地数据保存在 `backend/data/live-assets/<asset-id>`。`source` 保存不可变原文件，`derived` 保存拆出的主图和视频轨，浏览器只能访问 `preview` 内的派生文件。
