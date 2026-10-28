# Yumesumi Center · GitHub Pages 部署说明

## 部署架构

```
push to main
   │
   ├─→ .github/workflows/deploy.yml  ← 唯一有效的部署通道
   │      check → build → upload artifact → deploy
   │
   └─→ pages-build-deployment (legacy)  ← GitHub 自动生成，需保持禁用
```

## 为什么必须停用 legacy 工作流

GitHub 在仓库首次启用 Pages 时会自动生成 `pages-build-deployment.yml`，
它使用 **Jekyll** 构建整个仓库根目录。由于本项目是 Astro 应用，
Jekyll 会把 `src/**/*.astro` 当作带 front matter 的 Markdown/YAML 解析并报错：

```
Invalid YAML front matter in src/components/sections/IntroSection.astro
```

该工作流每次 push 都会失败。它不会覆盖 Actions 的部署产物（Pages 的 Source
已设为 **GitHub Actions**），但持续失败的检查会干扰 CI 状态判断。

## 当前配置

| 项           | 值                                          |
| ------------ | ------------------------------------------- |
| Pages Source | GitHub Actions（`build_type: workflow`）    |
| 站点地址     | https://yumesumi.github.io/Yumesumi-Center/ |
| `base`       | `/Yumesumi-Center/`                         |

### 停用 legacy 工作流

由于它不在仓库文件里，`gh workflow disable` 无法按文件名操作（返回 404），
需通过 API 按 workflow **id** 操作：

```bash
# workflow id 可用 gh workflow list --all 查到
gh api -X PUT repos/Yumesumi/Yumesumi-Center/actions/workflows/<workflow-id>/disabled -f enabled=false
```

若 API 仍不可用，可在仓库 Settings → Actions → 对应工作流 → 手动 Disable。

## 深层链接

GitHub Pages 对静态站点的深链默认返回 404。本项目使用 `trailingSlash: 'always'`，
每个路由都会生成对应目录下的 `index.html`（如 `/about/index.html`），
因此 `/about/` 等深层路径可直接访问，无需 404 回退页。

## 排查清单

部署异常时依次检查：

```bash
# 1. Actions 运行状态
gh run list --limit 5

# 2. 某个 run 的详细日志
gh run view <run-id> --log-failed

# 3. Pages 配置与状态
gh api repos/Yumesumi/Yumesumi-Center/pages --jq '{html_url, build_type, status}'

# 4. 线上站点逐路由验证（含 3D 场景与降级路径）
node tools/verify-production.mjs
```
