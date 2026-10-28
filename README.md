# Yumesumi Center · 梦澄中心

沉浸式个人数字门户 —— 聚合梦澄博客、梦澄指数、Minecraft 服务器与模组工坊、Yumesumi Labs 与 Yumesumi Studio 的统一数字空间。

## 技术栈

| 领域 | 选型                                                     | 说明                                |
| ---- | -------------------------------------------------------- | ----------------------------------- |
| 框架 | Astro 7.4.2                                              | 静态生成与路由，默认输出纯静态 HTML |
| 交互 | React 19.3.1                                             | 仅用于需要客户端注水的复杂组件      |
| 类型 | TypeScript 6.0.3                                         | `astro check` 严格模式              |
| 3D   | Three.js 0.182.0 + React Three Fiber 9.8.2 + Drei 10.7.9 | 独立可卸载的场景组件                |
| 动效 | GSAP 3.15.0（含 ScrollTrigger）                          | 时间轴与滚动叙事                    |
| 滚动 | Lenis 1.3.27                                             | 平滑滚动增强（Phase 3 接入）        |
| 部署 | GitHub Actions → GitHub Pages                            | 项目仓库，路径 `/Yumesumi-Center/`  |

> **为什么 three 锁定 0.182.0**：three 自 0.183 起弃用 `THREE.Clock`，
> 而 R3F 9.8.2 内部仍在使用它，会在控制台留下警告。
> 0.182.0 是最后一个不含该弃用警告的版本，因此锁定为精确版本（不加 `^`）。

## 环境要求

- **Node.js ≥ 22.23.4**（Astro 7 的硬性要求，推荐 Node 24 LTS，见 `.nvmrc`）

```bash
nvm use        # 读取 .nvmrc
npm install
```

## 常用命令

```bash
npm run dev            # 本地开发服务器
npm run check          # 类型检查（astro check）
npm run build          # 生产构建，输出到 dist/
npm run preview        # 预览构建产物
npm run format         # Prettier 格式化
npm run assets:logo    # 从 logo矢量图.ai 重新生成 public/brand/logo.svg
npm run assets:fonts   # 重新生成字体子集 public/fonts/*
```

## 目录结构

```
src/
├── components/
│   ├── 3d/           # Three.js / R3F 场景（独立可卸载）
│   ├── motion/       # GSAP 时间轴与滚动叙事
│   ├── sections/     # 首页各章节
│   └── ui/           # 通用 UI 组件
├── data/             # 项目清单、导航、站点元数据（结构化数据源）
├── layouts/          # 页面布局
├── pages/            # 路由
└── styles/           # 设计变量与全局样式
public/
├── brand/            # Logo（SVG + PNG）
└── fonts/            # MiSans 子集（自动生成，勿手工修改）
tools/                # 资产管线与验证脚本
scripts/              # 字体子集化脚本
```

## 设计系统

所有颜色、字号、字距、间距、圆角、阴影、动效时长与缓动曲线集中在
`src/styles/tokens.css`，组件中不允许硬编码这些值。

品牌基调：深紫为核心，午夜蓝与近黑承担背景层次，冷白承担主要文字，低饱和薰衣草紫用于重点信息。

## 品牌资产

### Logo

`public/brand/logo.svg` 由 `tools/build-logo-svg.mjs` 从 `logo矢量图.ai`（PDF 兼容格式）逆向提取，
严格按 PDF 规范解释内容流，**未做任何几何近似或美化**。

提取结果经 `tools/verify-logo.mjs` 校验：以 PyMuPDF 直接渲染原始 `.ai` 作为第三方基准，
SVG 与原 `logo.png` 的容差 IoU = 1.00000，严格 IoU 与面积比均落在渲染器固有差异基线内。

```bash
npm run assets:logo && node tools/verify-logo.mjs
```

### 字体

MiSans 原始素材约 259MB。`scripts/subset_fonts.py` 使用可变字体 `MiSansVF.ttf`
（保留 wght 150-700 字重轴）做子集化，按字符集切分为拉丁片 + 4 个简体一级片，
配合 `unicode-range` 按需加载，仓库内合计约 2.2MB（缩减 99.1%）。

`public/fonts/fonts.css` 由脚本自动生成，`unicode-range` 与分片内容始终同步，
字体文件使用相对路径以适配子路径部署。

**生僻字分片不入库**：GB2312 二级汉字（1.8MB）超出 GitHub 单文件 1MB 限制，
且承载的字符极低频。该分片由脚本输出到仓库外的 `../yumesumi-fonts-outside/`，
需要时可本地部署或放到自建 CDN；未部署时这些字符自动回落到系统中文字体，
正文阅读不受影响。

### 3D 场景

`src/components/3d/` 下的场景**直接复用 Logo 的几何路径**建模，
而不是另画一套形状：

| Logo 构成 | 三维角色 |
| --- | --- |
| 圆角菱形外框 | 半透明棱镜骨架（ExtrudeGeometry，带厚度与倒角） |
| 四芒星 | 发光核心晶体（外层光环 + 内层实体） |
| 装饰弧线 | 环绕轨道（沿曲线生成的管体） |
| 底部叶形 | 承载基座 |

路径数据由 `tools/build-logo-svg.mjs` 从 `logo矢量图.ai` 解析后，
同时输出到 `public/brand/logo.svg` 与 `src/data/logoGeometry.ts`，两者严格同源。

降级策略：`tools/verify-fallback.mjs` 会模拟 WebGL 不可用的环境，
验证页面仍完整可用（字标、正文、导航、CSS 占位几何体均正常，且无控制台错误）。

## 验证

```bash
npm run check && npm run build
node tools/smoke.mjs            # 逐路由浏览器冒烟：控制台报错、资源加载、4 断点横向溢出
node tools/shoot.mjs            # 多视口截图，产物在 .shots/
node tools/verify-logo.mjs      # Logo 像素级校验（几何与原 PNG 一致性）
node tools/verify-fallback.mjs  # WebGL 不可用时的降级路径验证
```

冒烟与截图工具会读取 `astro.config.mjs` 的 `base`，
把 `dist` 挂载到该子路径下，精确模拟 GitHub Pages 的部署环境——
若页面残留任何未加前缀的绝对路径，会立刻 404 并被抓出来。

## 部署

仓库为 GitHub **项目仓库** `Yumesumi/Yumesumi-Center`，站点位于
`https://yumesumi.github.io/Yumesumi-Center/`，
因此 `astro.config.mjs` 中 `base` 设为 `'/Yumesumi-Center/'`。

> 所有站内链接与 `public/` 静态资源都必须带 base 前缀。
> 组件内用 `import.meta.env.BASE_URL` 拼接，不要硬编码 `/` 开头的路径。

GitHub Actions 在每次推送到 `main` 时自动构建并部署到 GitHub Pages
（见 `.github/workflows/deploy.yml`）。首次部署需在仓库 Settings → Pages 中
将 Source 设为 **GitHub Actions**。

## 内容约定

- **不虚构数据**：不编造在线人数、发布日期、文章、K 线或版本号。
  尚未接通真实数据源的板块一律标注为「建设中」。
- 项目与更新的结构化数据分别维护在 `src/data/projects.ts` 与 `src/data/updates.ts`。
- 接入真实数据源后，只需替换数据文件，组件无需改动。
