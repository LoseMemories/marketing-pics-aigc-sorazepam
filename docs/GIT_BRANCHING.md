# Git 分支管理规范

本文约定本仓库的分支类型、命名、合并与保留规则。目标：`master` 始终可运行、可发布，同时每个改动都能追溯到独立分支。

## 核心原则

1. **一个改动一个分支**：任何修改（功能、修复、文档、重构）都从最新 `master` 切出新分支，不直接在 `master` 上提交。
2. **合并后保留开发分支**：合并进 `master` 后**不删除**分支，便于回溯与二次修改。
3. **分支类型由任务性质决定**：不是所有任务都是 `feature`，按下面表格判断。
4. **`master` 只接受完整改动**：提交前至少保证 `pnpm typecheck`、相关测试通过。

## 分支类型

| 类型前缀 | 适用场景 | 示例 | 是否合入 `master` |
| --- | --- | --- | --- |
| `feature/` | 新功能、页面改版、交互重做 | `feature/user-edit-page-redesign` | ✅ 是 |
| `fix/` | 修 bug（非紧急） | `fix/gallery-empty-state` | ✅ 是 |
| `hotfix/` | 线上紧急修复，从 `master` 切出 | `hotfix/upload-500` | ✅ 是（优先合并并打标签） |
| `refactor/` | 重构，不改变外部行为 | `refactor/composition-schema` | ✅ 是 |
| `perf/` | 性能优化 | `perf/font-lazy-load` | ✅ 是 |
| `docs/` | 文档、README、注释 | `docs/branch-guideline` | ✅ 是 |
| `chore/` | 构建、依赖、配置、脚本 | `chore/drop-unused-deps` | ✅ 是 |
| `test/` | 只增改测试 | `test/font-kb-coverage` | ✅ 是 |
| `experiment/` | 试验性验证，结论未定 | `experiment/sam2-mask` | ❌ 否（验证完即弃） |
| `spike/` | 技术预研（时间盒） | `spike/onnx-runtime` | ❌ 否 |
| `wip/` | 临时保存未完成工作 | `wip/partial-layout` | ❌ 否（只推远端备份） |
| `gh-pages` | GitHub Pages 部署产物 | — | ❌ 禁止（特殊分支，合并会污染 `master`） |
| `release/` | 发布前冻结、只接受修复 | `release/0.2.0` | 按发布流程处理 |

### 关于「有些分支不能合并」

技术上 Git 不限制任何分支之间的合并，所谓「不能合并」是**约定限制**：

- `gh-pages` 存放的是构建产物，与源码不同源，合并会造成大量无意义冲突；
- `experiment/`、`spike/`、`wip/` 的产出常常不可运行，允许不合并而直接弃用；
- 其余类型都应当合并回 `master`，并保留分支本身。

## 命名规则

```text
<type>/<kebab-case-英文简述>
```

- 全小写，单词用 `-` 连接，例如 `feature/user-edit-page-redesign`；
- 有 issue 时追加编号：`fix/42-upload-timeout`；
- 避免中文、空格、下划线与大写。

## 标准流程

```bash
# 1. 从最新 master 切出
git switch master && git pull
git switch -c feature/user-edit-page-redesign

# 2. 正常开发与提交
git add -A
git commit -m "feat(workbench): 用户编辑页改版"

# 3. 推送开发分支（保留在远端）
git push -u origin feature/user-edit-page-redesign

# 4. 合并回 master（--no-ff 保留分支历史）
git switch master && git pull
git merge --no-ff feature/user-edit-page-redesign
git push origin master

# 5. 保留分支：不执行 git branch -d
```

## 提交信息

采用 `type(scope): 摘要` 形式，`type` 与分支前缀保持一致（`feature` 对应 `feat`）：

```text
feat(workbench): 用户编辑页改版
fix(gallery): 空图库时不再报错
docs(branching): 新增分支管理规范
chore(deps): 移除未使用的 onnxruntime-node
```

## 历史分支

| 分支 | 说明 | 状态 |
| --- | --- | --- |
| `docs/branch-guideline` | 本文档 | 已合并，保留 |
