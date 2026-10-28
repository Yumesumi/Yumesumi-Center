# Yumesumi Center · GitHub Pages 部署说明

## 部署架构：分支发布（不使用 Actions）

```
本地修改
   │
   └─→ npm run deploy
          1. astro build          → dist/
          2. 准备发布目录          → 加 .nojekyll
          3. 独立 git index 提交    → commit-tree
          4. push 到 gh-pages 分支
                │
                └─→ GitHub Pages 自动发布
                       https://yumesumi.github.io/Yumesumi-Center/
```

## 为什么不用 Actions

1. **发布要排队**：曾出现 `queued` 11 分钟仍未执行的情况。分支发布由你决定何时推送，
   推送完立刻进入发布队列，没有等待。
2. **有个无法停用的 legacy 工作流**：GitHub 首次启用 Pages 时会自动生成
   `pages-build-deployment.yml`，用 Jekyll 构建仓库根目录。平台不允许通过 API 停用它
   （返回 422），它会持续失败并干扰 CI 状态判断。
3. **不占用 CI 配额**，仓库里也不需要额外的 workflow 文件。

## 一次性配置

仓库当前已完成配置，无需重复执行：

| 项           | 值                                          |
| ------------ | ------------------------------------------- |
| Pages Source | Deploy from a branch → `gh-pages` / root    |
| `build_type` | `legacy`                                    |
| 站点地址     | https://yumesumi.github.io/Yumesumi-Center/ |
| `base`       | `/Yumesumi-Center/`                         |

如需重建，用下面的命令：

```bash
gh api -X PUT repos/Yumesumi/Yumesumi-Center/pages \
  -f 'build_type=legacy' \
  -f 'source[branch]=gh-pages' \
  -f 'source[path]=/'
```

## 日常发布

```bash
npm run deploy
```

这条命令完成：构建 → 准备发布目录 → 提交到 gh-pages → 推送。
发布通常在 1–2 分钟内生效。

### gh-pages 分支的性质

该分支**只存放构建产物**，不存源码。因此每次发布都用 force 推送覆盖（`tools/deploy-pages.mjs`
里的 `--force` 是预期行为，不会影响 `main` 分支）。

### 为什么需要 .nojekyll

缺少 `.nojekyll` 时 GitHub Pages 会用 Jekyll 处理静态文件，可能因解析 CSS/JS 而报错。
发布脚本会自动写入这个空文件。

### 深层链接

`trailingSlash: 'always'` 让每个路由都生成对应目录下的 `index.html`（如 `/about/index.html`），
因此 `/about/` 等深层路径可直接访问。

## 排查清单

发布异常时依次检查：

```bash
# 1. Pages 配置与状态
gh api repos/Yumesumi/Yumesumi-Center/pages --jq '{build_type, html_url, status, source}'

# 2. gh-pages 分支是否有最新提交
git ls-remote --heads origin gh-pages
git log origin/gh-pages --oneline -1

# 3. 分支内容是否完整（应有 .nojekyll 与 index.html）
git ls-tree --name-only origin/gh-pages

# 4. 线上逐路由验证（含 3D 场景、字体、控制台错误）
node tools/verify-production.mjs
```

## 遗留说明

仓库里仍可能存在 GitHub 自动生成的 `pages-build-deployment`（Jekyll）工作流条目。
它不受本项目控制、也无法通过 API 停用，但因 Pages Source 已指向 `gh-pages` 分支，
它不会覆盖本项目的发布产物。
