# resources

本目录整合了原先散落在 `deepseek-harness/handoff` 的分析脚本、提示词文档和原始抓取素材。

## deepseek/

| 目录 | 内容 |
| --- | --- |
| `crawl/` | `workflow-analyze.py`、`design_fill.py`、`runlog.py`、主体提示词、批处理脚本 |
| `docs/` | 00–14 设计/分析/交接文档，含 `12-设计语汇分析提示词-v3.2-代码回填版.md` |
| `prompts/` | 提示词片段与导出脚本 |
| `samples/` | 真实运行样例 |
| `tools/` | 设计语汇工具 |
| `deploy/` | 原部署配置备份 |

未包含（体积大或可重新生成）：

- `crawl/weights/`
- `crawl/*.pt`
- `crawl/node_modules/`
- `logs/`（运行后生成，已在 `.gitignore` 中排除）

运行分析链路需要：

- Python 3.9
- `models/pylibs39` 中的 Python 依赖（可用 `WORKFLOW_MODELS_DIR` 整体切换）
- SAM checkpoint `models/sam_vit_b.pth`
- `backend/.env.local` 中的 `DEEPSEEK_API_KEY`

`workflow-analyze.py` 会根据自身位置推导仓库根目录，默认读取 `backend/.env.local`、`resources/deepseek/docs/12-设计语汇分析提示词-v3.2-代码回填版.md` 和 `resources/deepseek/crawl/ds-subject-prompt.md`，不需要再改绝对路径。

## crawl-raw/

原始抓取素材：

```text
crawl-raw/
  manifest.json
  inspiration/
    3d/
    creative/
    ecommerce/
    landingpage/
    magazine/
    technology/
    travel/
```

这些素材用于重新分析或补充 `backend/data/inspiration/` 图库。该目录连同 `backend/data/` 不进 Git，本地与远程 Linux 服务器各保留一份。
