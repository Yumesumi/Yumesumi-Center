# Yumesumi Center · 梦澄中心

沉浸式个人数字门户 —— 聚合梦澄博客、梦澄指数、Minecraft 服务器与模组工坊、Yumesumi Labs 与 Yumesumi Studio 的统一数字空间。

> **接手开发请先读 [`docs/HANDOVER.md`](docs/HANDOVER.md)** —— 里面有未完成事项盘点、
> 技术债清单、必须知道的坑，以及生产环境验证工具链的说明。

## 技术栈

| 领域 | 选型                                              | 说明                               |
| ---- | ------------------------------------------------- | ---------------------------------- |
| 框架 | Astro 7.4.2                                       | 静态生成与路由，输出纯静态 HTML    |
| 类型 | TypeScript 6.0.3                                  | `astro check` 严格模式             |
| 样式 | 原生 CSS + CSS 变量                               | 无 CSS 框架，变量集中在 tokens.css |
| 部署 | GitHub Pages（gh-pages 分支发布，不使用 Actions） | 项目仓库，路径 `/Yumesumi-Center/` |

> **没有前端框架依赖**：站点为纯静态 HTML + CSS，无 React/Vue 等运行时。
> 构建产物为 0 个 JS 文件；导航的滚动状态、移动菜单与首屏文字扫光由少量内联脚本实现。
> 首屏不下载 JS 文件，禁用 JavaScript 时内容与样式依然完整（由 `tools/verify-nojs.mjs` 验证）。
>
> 动效依赖（GSAP / Lenis）尚未安装——按项目约定「不安装没有实际用途的依赖」，
> 需要时在 Phase 3 再装。

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
npm run deploy         # 构建并发布到 GitHub Pages（gh-pages 分支）
npm run format         # Prettier 格式化
npm run assets:logo    # 从 logo矢量图.ai 重新生成 public/brand/logo.svg
npm run assets:fonts   # 重新生成字体子集 public/fonts/*
```

## 目录结构

```
src/
├── components/
│   ├── sections/     # 首页 A–F 六章节
│   └── ui/           # 通用 UI 组件（含 BrandLogo、HomeAmbience、StarField）
├── data/             # 项目清单、导航、站点元信息（结构化数据源）
├── layouts/          # 页面布局
├── pages/            # 路由
└── styles/           # 设计变量与全局样式
public/
├── brand/            # Logo（SVG）
└── fonts/            # MiSans 子集（自动生成，勿手工修改）
tools/                # 资产管线与验证脚本（非业务代码）
scripts/              # 字体子集化脚本
docs/                 # HANDOVER.md（交接）、deployment.md（部署）
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

### 品牌标记的呈现

`public/brand/logo.svg` 是从 `logo矢量图.ai` 精确提取的真实路径，
经像素级校验与原 `logo.png` 完全一致（容差 IoU = 1.00000）。

全站所有品牌标记一律通过 `src/components/ui/BrandLogo.astro` 呈现，
**禁止**在任何位置用 CSS 方框、边框、`rotate` 等自造「几何占位」——
那些图形缺少四芒星与装饰弧线，观感上只是空心几何体，无法传达品牌识别。

首页使用固定环境层 `HomeAmbience`：品牌标记按 `92vmin` 缩放，
完整呈现整枚标记，以 `position: fixed` 固定在视口上，页面滚动时作为水印持续存在；
透明度在 0.03–0.07 之间缓慢呼吸，若隐若现。
各章节底色是半透明薄纱（`--ys-veil-*`），水印与粒子因此能贯穿整个滚动过程。
尺寸与透明度经实际截图调参，改动前先看 `tools/shoot.mjs` 的产物。

### 星空粒子层

`src/components/ui/StarField.astro` 在固定环境层内铺一层全屏星点，
粒子在各自不同的闭合轨迹上缓慢漂移。
粒子形状**取自 Logo 的小四芒星路径**（归一化后作为 CSS mask 复用），
因此背景星点与品牌标记同源，不是随手画的替代图形。

- 32 颗星形粒子 + 38 颗尘埃点，位置/大小/周期/相位/漂移幅度各不相同
- 漂移与闪烁只改变 `transform` / `opacity`，粒子不叠加 `filter`；
  移动端不渲染尘埃层，减少同时参与合成的元素数量
- 两枚低频流星间歇划过，为画面提供少量高光
- 关键帧不等分，且最低亮度保留一个底数——星星不会真正消失，
  避免出现「整片天空同时熄灭」的信号灯感
- 边缘渐隐遮罩让星点与页面边界自然衔接
- `prefers-reduced-motion` 下停止闪烁与漂移，保留静态低亮度
- **纯 CSS 实现**，不引入额外的运行时 JavaScript

## 验证

> `tools/` 下是**验证工具链**，不是业务代码。它比业务代码还长是刻意的——
> 这个项目的大部分 bug 只有在真实浏览器里才能暴露（见 `docs/HANDOVER.md` §7）。

```bash
npm run check && npm run build
node tools/smoke.mjs             # 逐路由浏览器冒烟：控制台报错、资源加载、4 断点横向溢出
node tools/shoot.mjs             # 多视口截图，产物在 .shots/
node tools/verify-logo.mjs       # Logo 像素级校验（几何与原 PNG 一致性）
node tools/verify-nojs.mjs       # 禁用 JavaScript 时的内容完整性验证
node tools/verify-production.mjs # 生产环境端到端验证
node tools/shoot-particles.mjs   # 粒子亮度多时刻采样（验证闪烁不同步）
node tools/zoom-particles.mjs    # 粒子层放大 4 倍（核对四芒星形状）
```

冒烟与截图工具会读取 `astro.config.mjs` 的 `base`，
把 `dist` 挂载到该子路径下，精确模拟 GitHub Pages 的部署环境——
若页面残留任何未加前缀的绝对路径，会立刻 404 并被抓出来。

`verify-nojs.mjs` 会在禁用 JavaScript 的环境下检查内容与样式是否完整。
站点没有前端框架与外部 JS 文件，这项验证确保首屏不依赖任何脚本即可正常阅读。

## 部署

仓库为 GitHub **项目仓库** `Yumesumi/Yumesumi-Center`，站点位于
`https://yumesumi.github.io/Yumesumi-Center/`，
因此 `astro.config.mjs` 中 `base` 设为 `'/Yumesumi-Center/'`。

> 所有站内链接与 `public/` 静态资源都必须带 base 前缀。
> 组件内用 `import.meta.env.BASE_URL` 拼接，不要硬编码 `/` 开头的路径。

采用**分支发布**模式，不使用 GitHub Actions——本地构建后把产物提交到 `gh-pages` 分支，
Pages 随即重新发布。发布时机完全可控，不占用 CI 配额，也不需要仓库里的 workflow 文件。

```bash
npm run deploy    # 构建 → 提交到 gh-pages 分支 → 推送
```

Pages 的 Source 需设为 **Deploy from a branch** → `gh-pages` / root（已配置好）。
完整说明与排查清单见 [`docs/deployment.md`](docs/deployment.md)。

## 内容约定

- **不虚构数据**：不编造在线人数、发布日期、文章、K 线或版本号。
  尚未接通真实数据源的板块一律标注为「建设中」。
- 项目与更新的结构化数据分别维护在 `src/data/projects.ts` 与 `src/data/updates.ts`。
- 接入真实数据源后，只需替换数据文件，组件无需改动。
