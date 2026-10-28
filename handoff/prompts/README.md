# 提示词导出说明

这些 `.md` **不是手写的**，而是由脚本从源码里抓出来的真实提示词，保证「文档 = 实现」。

```bash
# 必须在原仓库根目录执行（脚本要 import backend/src 与 node_modules 里的依赖）
cd backend
pnpm tsx ../handoff/prompts/export-prompts.mts    # → 01 / 02
pnpm tsx ../handoff/prompts/export-catalogs.mts   # → 03 / 04 / 05
```

| 文件 | 内容 | 生成方式 |
|---|---|---|
| `01-scene-analysis.prompt.md` | 画面理解（视觉）提示词全文 | 拦截 `DeepSeekDesignAssistant.complete()` 捕获 messages |
| `02-design-layout.prompt.md` | L2 设计师提示词全文（含动效目录 / 文案正反例 / 输出要求） | 同上 |
| `03-motion-catalog.prompt.md` | 动效目录（id + 参数范围 + 枚举） | `buildMotionCatalogPrompt()` |
| `04-copy-rules.prompt.md` | 文案三条禁令 + 18 反例 + 18 正例 + 10 组改写对照 | `buildCopyRulesPrompt()` |
| `05-design-language.prompt.md` | 旧版一次性出图的设计语言参考（可作知识库种子） | 直接导出常量 |

> 提示词里出现的示例数据（如「南锣鼓巷」那段资料）是为了导出而临时构造的，不是真实业务数据；
> 真实运行产物见 `../samples/real-run/`。
