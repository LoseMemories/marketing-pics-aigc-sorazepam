# models/ —— Python 分析链路的依赖与权重

本目录存放 `resources/deepseek/crawl/workflow-analyze.py` 运行所需的本地资源。
权重体积大且不入库（见 `.gitignore`），只保留本说明文件。

## 目录结构

```text
models/
  pylibs39/           Python 依赖包（torch、easyocr、segment_anything、opencv 等），通过 sys.path 注入
  sam_vit_b.pth       SAM ViT-B 权重（约 375MB）
  easyocr-model/      EasyOCR 识别模型权重
  easyocr-network/    EasyOCR 自定义网络目录（首次运行自动创建）
  florence2-base/     Florence-2 base 模型（仅 florence-*.py 使用）
```

## 默认解析顺序

代码默认从仓库根目录的 `models/` 读取，无需设置任何环境变量：

| 资源 | 默认值 | 覆盖变量 |
| --- | --- | --- |
| Python 依赖 | `models/pylibs39` | `WORKFLOW_PYTHONPATH` |
| SAM 权重 | `models/sam_vit_b.pth` | `SAM_CHECKPOINT` |
| EasyOCR 模型 | `models/easyocr-model` | `EASYOCR_MODEL_DIR` |
| EasyOCR 网络 | `models/easyocr-network` | `EASYOCR_NETWORK_DIR` |
| Florence-2 | `models/florence2-base` | `FLORENCE2_MODEL_DIR` |
| 以上全部 | — | `WORKFLOW_MODELS_DIR`（整体切换到另一个 models 根目录） |

## 重建方式

```bash
# Python 依赖（与开发环境一致使用 Python 3.9）
python3 -m pip install --target models/pylibs39 \
  numpy opencv-python-headless pillow easyocr segment-anything

# SAM ViT-B 权重
curl -L -o models/sam_vit_b.pth \
  https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth

# EasyOCR 权重：首次运行 workflow-analyze.py 会自动下载到 models/easyocr-model
```

Florence-2 只有 `florence-batch.py`、`florence-viz.py` 需要，可用
`python3 -c "from transformers import AutoModelForCausalLM; AutoModelForCausalLM.from_pretrained('microsoft/Florence-2-base', trust_remote_code=True).save_pretrained('models/florence2-base')"`
生成，或直接从其他机器拷贝。
