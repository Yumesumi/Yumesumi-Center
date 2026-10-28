# Yumesumi Center · 交接文档

> 面向下一位开发者 / Agent。阅读顺序建议：本文件 → `README.md` → `docs/deployment.md`。
> 文中所有结论都经过实际运行验证，不是推测。

**最后更新**：2026-10-28
**线上地址**：https://yumesumi.github.io/Yumesumi-Center/
**仓库**：https://github.com/Yumesumi/Yumesumi-Center

---

## 1. 一分钟概览

| 项     | 现状                                                                |
| ------ | ------------------------------------------------------------------- |
| 形态   | 纯静态站点，**产物 0 个 JavaScript 文件**                           |
| 依赖   | 仅 `astro`（+ 4 个 devDependencies）                                |
| 构建   | `npm run build`，约 4 秒，产出 9 个页面                             |
| 部署   | `npm run deploy` → 推送 `gh-pages` 分支 → GitHub Pages 自动发布     |
| 代码量 | 组件 2357 行 / 样式 363 行 / 工具脚本 2326 行                       |
| 已完成 | 首页 A–F 六章节 + 9 条路由框架 + 设计系统 + 品牌资产管线 + 部署链路 |
| 未完成 | 6 个子页面的实际内容、动效系统、内容集合、SEO 设施                  |

**一句话**：骨架、视觉语言、资产管线、部署链路都已就位且可验证；剩下的是把真实内容填进已有的框架。

---

## 2. 现在能跑起来

```bash
# 1. 准备 Node（Astro 7 需要 >= 22.23.4）
#    本机已装便携版：~/.local/node/node-v24.22.1-win-x64
export PATH="$HOME/.local/node/node-v24.22.1-win-x64:$PATH"

# 2. 安装并启动
npm install
npm run dev            # http://localhost:4321

# 3. 提交前自检
npm run check          # 类型检查
npm run build          # 生产构建
npm run format:check   # 格式检查
```

**代理注意**：环境变量指向的 `127.0.0.1:14813` 已失效，**可用的是 `10808`**。
仓库已配 `git config --local http.proxy/https.proxy http://127.0.0.1:10808`（仅影响本仓库）。
若 `git push` 报 `CONNECT tunnel failed 502`，就是这个原因。

**Python 依赖**：`scripts/subset_fonts.py` 需要 `fonttools` + `brotli`（`pip install fonttools brotli`）。
只有重新生成字体子集时才需要；`npm run build` 不依赖它。

---

## 3. 目录地图

```
src/
├── components/
│   ├── sections/          首页 A–F 六章节
│   │   ├── IntroSection.astro      B 段：定位说明
│   │   ├── ProjectsSection.astro   C 段：重点项目（四种构图）
│   │   ├── WorldsSection.astro     D 段：项目之间的关系
│   │   ├── UpdatesSection.astro    E 段：最近动态（数据为空时显示空状态）
│   │   └── AboutSection.astro      F 段：个人简介与时间线
│   └── ui/
│       ├── BaseLayout...           （在 layouts/）
│       ├── BrandLogo.astro         ★ 品牌标记的唯一入口
│       ├── Hero.astro              首屏（背景大 Logo + 星空粒子）
│       ├── StarField.astro         ★ 四芒星粒子层
│       ├── SiteNav.astro           顶部导航（含移动端全屏菜单）
│       ├── SiteFooter.astro        页脚
│       └── PlaceholderSection.astro  子页面统一占位框架
├── data/                  结构化数据源 —— ★ 改内容只动这里
│   ├── site.ts            站点元信息
│   ├── navigation.ts      导航结构
│   ├── projects.ts        6 个项目清单
│   └── updates.ts         最近动态（当前为空数组）
├── layouts/BaseLayout.astro
├── pages/                 9 条路由
└── styles/
    ├── tokens.css         ★ 全站唯一的设计变量来源
    └── global.css         reset + 基础排版 + 工具类

public/
├── brand/logo.svg         从 .ai 精确提取的品牌标记
├── fonts/                 MiSans 子集（自动生成，勿手改）
└── (logo.png, logo矢量图.ai 在仓库根目录，是品牌资产源)

tools/                     资产管线与验证脚本（见 §6）
scripts/subset_fonts.py    字体子集化
docs/deployment.md         部署说明
```

---

## 4. 未完成的部分（按优先级）

### P0 — 阻塞内容上线

| #   | 事项                          | 现状                                                                                            | 建议做法                                                                                                                             |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **6 个子页面的实际内容**      | 全部是 `PlaceholderSection` 占位（`/blog/` `/ysi/` `/minecraft/` `/mods/` `/labs/` `/studio/`） | 每个板块建一个 section 组件，替换占位；数据从 `src/data/` 取                                                                         |
| 2   | **博客内容源**                | 无内容集合，无 `src/content/`                                                                   | 用 Astro Content Collections（`src/content.config.ts` + `src/content/blog/*.md`）；文章详情页需新建 `src/pages/blog/[...slug].astro` |
| 3   | **`/projects/` 的项目详情页** | 只有总览页，点进去是 `/projects/` 本身                                                          | 新建 `src/pages/projects/[key].astro`，从 `src/data/projects.ts` 取数据                                                              |
| 4   | **动态数据源**                | `src/data/updates.ts` 的 `UPDATES` 是空数组                                                     | 接入真实来源（RSS / GitHub Releases / 服务器状态 API）；组件已就绪，填数据即可                                                       |

### P1 — 影响品质与可发现性

| #   | 事项         | 说明                                                                                        |
| --- | ------------ | ------------------------------------------------------------------------------------------- |
| 5   | **404 页面** | 不存在。GitHub Pages 对不存在的路径返回默认 404 页面，破坏沉浸感                            |
| 6   | **sitemap**  | 未装 `@astrojs/sitemap`。9 条路由都是公开页面，应该有                                       |
| 7   | **RSS**      | 博客上线后需要 `/rss.xml`                                                                   |
| 8   | **OG 图**    | 当前 `ogImage` 指向 `logo.svg`（正方形 logo，不是 1200×630 的分享卡）。社交平台通常不认 SVG |
| 9   | **动效系统** | 无 GSAP / Lenis（依赖已清理，见 §5）。Brief 第 4.4 节的滚动叙事尚未实现                     |

### P2 — 打磨

| #   | 事项                                                                         |
| --- | ---------------------------------------------------------------------------- |
| 10  | 移动端菜单的 `Esc` 关闭与焦点陷阱已实现，但**没有焦点可见性回归测试**        |
| 11  | `PlaceholderSection` 的 `upcoming` 列表是硬编码在页面里的，应移到数据层      |
| 12  | 无 `prefers-reduced-motion` 的自动化验证（目前是代码里处理，但没有测试守护） |

---

## 5. 技术债清单

### 5.1 已清理（本轮）

| 项                                    | 处理                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `tools/diagnose-3d.mjs`               | 删除。3D 移除后的死代码，探测的是已不存在的 `.scene-root`                                                                      |
| `gsap` / `lenis` 依赖                 | 删除。**零引用**，且 `astro.config` 里还配着 gsap 分包规则。Brief 第 11 节要求「不安装没有实际用途的依赖」——Phase 3 需要时再装 |
| `astro.config.mjs` 的 `codeSplitting` | 删除。唯一的分组规则指向已移除的 gsap                                                                                          |
| 8 处硬编码颜色                        | 全部改为 `var(--ys-*)` + `color-mix()`。Brief 第 4.1 节要求颜色不得硬编码                                                      |
| `.gitignore`                          | 重写。原有重复段落且引用了已删除的文件                                                                                         |
| README 遗漏                           | 补上 `deploy-pages.mjs` / `shoot-particles.mjs` / `zoom-particles.mjs` 等工具说明                                              |

### 5.2 仍然存在（下一位可处理）

| #   | 债                                                            | 影响                                                        | 建议                                                                                                              |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| D1  | **`src/data/projects.ts` 里 6 个项目的 `summary` 是占位描述** | 内容看似真实，实则非最终文案                                | 接入真实内容时替换；或标注 `status: 'planned'`（已有）并在 UI 上明示                                              |
| D2  | **`/projects/` 页的 `build_type` 与 `source` 冗余**           | `astro.config` 只声明 `site` + `base`，仓库类型判断是隐式的 | 建议在 `astro.config` 加注释说明「项目仓库 → base 必须带路径」，避免有人误改                                      |
| D3  | **子页面 7 个文件内容几乎相同**                               | 都是 22 行的占位壳，改一处要改七处                          | 内容落地时抽成数据驱动的通用页面；`PlaceholderSection` 已为此预留                                                 |
| D4  | **`tools/` 下 9 个脚本共 2300 行**，占代码量的 1/3            | 验证工具比业务代码还多，维护成本不低                        | 都是实用的（每个解决一类真问题），但新人可能被吓到。建议在 README 顶部加一句「tools/ 是验证工具链，不是业务代码」 |
| D5  | **`scripts/subset_fonts.py` 依赖 Python**                     | 与 Node 工具链割裂                                          | 可接受（fonttools 无 JS 等价物）。若要统一，可改用 `subset-font`（npm，harfbuzz wasm）                            |
| D6  | **`theme-color` meta 是硬编码色值**                           | HTML 属性无法用 CSS 变量，改配色时需手工同步                | 已在代码里加注释说明与 `--ys-void` 保持一致                                                                       |
| D7  | **`mask-composite: intersect` 的浏览器支持**                  | Safari 15.4+ / Firefox 53+ 支持，IE 不支持                  | 可接受（现代浏览器全覆盖）。若要更保险可拆成两层元素                                                              |
| D8  | **`SiteNav.astro` 419 行**，是最大的组件                      | 单文件职责偏多（品牌区 + 桌面导航 + 移动菜单 + 全部样式）   | 拆成 `SiteNav.astro` / `SiteMenu.astro` / `SiteNav.css` 三份                                                      |
| D9  | **无 CI**                                                     | 推送后不会自动跑 check/build                                | Brief 的「不使用 Actions」是用户明确要求，不建议改。但可以加 `pre-commit` 钩子本地兜底                            |
| D10 | **无 `src/components/motion/` 目录**                          | Brief 第 4.4 节的动效系统未开始                             | Phase 3 创建                                                                                                      |

---

## 6. 验证工具链

**这是本项目最有价值的部分**。所有工具都不依赖 Playwright/Puppeteer，直接用 CDP 驱动本机 Chrome。

| 工具                               | 作用                                                                | 何时用                              |
| ---------------------------------- | ------------------------------------------------------------------- | ----------------------------------- |
| `node tools/smoke.mjs`             | 逐路由浏览器冒烟：控制台报错、资源加载失败、4 个断点的横向溢出      | **每次改动后必跑**                  |
| `node tools/verify-nojs.mjs`       | 禁用 JavaScript 环境下的内容与样式完整性                            | 涉及静态渲染的改动                  |
| `node tools/verify-production.mjs` | 直接测生产环境 `https://yumesumi.github.io/Yumesumi-Center/`        | **部署后必跑**——本地通过 ≠ 线上可用 |
| `node tools/verify-logo.mjs`       | Logo 与原 `logo.png` 的像素级一致性（容差 IoU / 严格 IoU / 面积比） | 改动品牌资产时                      |
| `node tools/shoot.mjs`             | 多视口截图 → `.shots/`                                              | 视觉改动后人工核对                  |
| `node tools/shoot-particles.mjs`   | 粒子亮度多时刻采样，验证闪烁不同步                                  | 调整粒子参数时                      |
| `node tools/zoom-particles.mjs`    | 粒子层放大 4 倍并暂停动画                                           | 核对粒子形状细节                    |
| `node tools/build-logo-svg.mjs`    | 从 `logo矢量图.ai` 重新生成 `logo.svg`                              | 修改 `.ai` 后                       |
| `python scripts/subset_fonts.py`   | 重新生成字体子集                                                    | 修改字符集后                        |
| `npm run deploy`                   | 构建并发布到 `gh-pages` 分支                                        | 发布时                              |

**关键约定**：冒烟与截图工具会读取 `astro.config.mjs` 的 `base`，把 `dist` 挂载到该子路径下，
精确模拟 GitHub Pages 的部署环境。**若页面残留任何未加前缀的绝对路径，会立刻 404 并被抓出来。**

---

## 7. 必须知道的坑

这几条都是实际踩过的，改动前请先读。

### 7.1 子路径部署：资源不会自动加 base

仓库是**普通项目仓库** `Yumesumi/Yumesumi-Center`，站点在 `/Yumesumi-Center/` 子路径下。

- `public/` 下的文件与硬编码的站内路由**不会**自动加前缀 → 必须用 `import.meta.env.BASE_URL` 拼接
- 站内链接用 `const withBase = (href) => \`${base}${href.replace(/^\//, '')}\``
- **绝不要硬编码 `/` 开头的路径**

> 若将来迁移到用户主页仓库（`Yumesumi.github.io`），把 `astro.config.mjs` 的 `base` 改回 `'/'` 即可，
> 其余代码无需改动。

### 7.2 品牌标记只能用 BrandLogo 组件

全站品牌标记**只能**通过 `src/components/ui/BrandLogo.astro` 呈现。

**禁止**用 CSS 方框、边框、`rotate` 等自造「几何占位」——那些图形缺少四芒星与装饰弧线，
观感上只是空心几何体，无法传达品牌识别。（这是实际发生过的问题。）

### 7.3 CSS mask 的 viewBox 陷阱

`StarField.astro` 的粒子遮罩用 Logo 的小四芒星路径，以**星心为原点**跨 ±50，
所以 viewBox 必须是 `-50 -50 100 100`。用 `0 0 100 100` 只框住右下四分之一 → 渲染出半个星。

**另外**：不要用 `<style define:vars>` 注入 data URI —— 它会做 HTML 转义，
破坏引号与 `%23` 编码，mask 整体失效、元素退回实心方块。

### 7.4 不要用 Astro 的 `client:*` 指令

其注水依赖内联脚本同步派发的 `astro:load` / `astro:only` 事件。
这些事件在 HTML 解析早期即触发，而 `<astro-island>` 元素可能在事件之后才被解析
（生产环境 HTML 大、网络慢时尤其明显）→ 组件静默不挂载且**不产生任何报错**。

本项目已无客户端组件需求。若将来必须引入，需改用显式 `createRoot` 挂载。

### 7.5 视觉问题的根因常常在放大后才暴露

第一版粒子「几乎看不见」，直觉是调暗，实际是 mask 裁掉了一半。
**用 `tools/zoom-particles.mjs` 把局部放大 4 倍再看**。

判断动画是否真的在动，看 `tools/shoot-particles.mjs` 的「可见数」指标：
若它单调暴涨，说明元素同涨同落、没有随机感。

### 7.6 Hero 背景大 Logo 的尺寸与位置是调参结果

- 太大（如 720px）→ 菱形框的边会跑出画面，只剩中央四芒星，反而认不出是 Logo
- 位置不下移 → 四芒星实心区正好压住「梦澄中心」

当前值：520px / opacity 0.16 / 位置 53%。改动前先看 `tools/shoot.mjs` 的截图。

---

## 8. 不可违背的约定

来自原始 brief，**这些不是建议，是硬约束**：

1. **不得虚构数据**——不编造在线人数、发布日期、文章、K 线、版本号。未接通的板块标注「建设中」
2. **不得擅自改动 Logo 与字体规范**——品牌资产是既有事实，不是设计素材
3. **样式值不得硬编码**——所有颜色/字号/间距/圆角/阴影/动效参数走 `src/styles/tokens.css`
4. **所有页面属于同一设计系统**——不接受不同模板拼接
5. **尊重 `prefers-reduced-motion`**
6. **每个阶段都要实际运行检查**，不能只报告「完成」
7. **本地验证通过 ≠ 线上可用**——涉及资源路径时必须用 `tools/verify-production.mjs` 实测

另外两条项目内的约定：

8. **品牌标记只能用 `BrandLogo.astro`**（见 §7.2）
9. **不安装没有实际用途的依赖**——gsap/lenis 已因此被清理

---

## 9. 品牌资产

| 文件                    | 说明                                            |
| ----------------------- | ----------------------------------------------- |
| `logo矢量图.ai`         | 品牌资产源文件（PDF 兼容格式），**不要修改**    |
| `logo.png`              | 724×724 参考图，校验基准                        |
| `public/brand/logo.svg` | 由 `tools/build-logo-svg.mjs` 从 `.ai` 精确提取 |

**提取方式**：严格按 PDF 规范解释内容流（`q/Q/cm/m/l/c/v/h/S/f/w/j/J/sc/SCN`），
不做任何几何近似或美化。

**校验基线**（`tools/verify-logo.mjs`）：

| 指标               | 数值    | 含义                           |
| ------------------ | ------- | ------------------------------ |
| 容差 IoU（1px）    | 1.00000 | 形状与位置完全一致             |
| 严格 IoU（0 容差） | 0.97851 | 优于原 `.ai` 渲染基线 0.96563  |
| 面积比             | 0.9815  | 与 AI 基线 0.97686 偏差 0.467% |

> 那 1.8% 的面积差是**渲染器抗锯齿的固有差异**，不是提取误差。
> 基线来自「PyMuPDF 直接渲染原始 `.ai` vs `logo.png`」的对比。

---

## 10. 字体

MiSans 原始素材 259MB（仓库根目录 `MiSans/`，已 gitignore）。
`scripts/subset_fonts.py` 用可变字体 `MiSansVF.ttf`（保留 wght 150-700 字重轴）子集化：

| 分片                   | 字符集                             | 体积        |
| ---------------------- | ---------------------------------- | ----------- |
| `misans-latin.woff2`   | 拉丁 + 数字 + 符号                 | 133 KB      |
| `misans-sc-1..4.woff2` | GB2312 一级汉字（按拼音序分 4 片） | 各约 540 KB |
| `misans-sc-rare.woff2` | GB2312 二级汉字                    | 1.8 MB      |

**仓库内只保留前 5 个（共 2.23MB）**。生僻字分片超出 GitHub 单文件 1MB 限制，
输出到仓库外的 `../yumesumi-fonts-outside/`，未部署时这些字符回落到系统中文字体。

`public/fonts/fonts.css` 由脚本自动生成，`unicode-range` 与分片内容始终同步（**勿手改**）。

---

## 11. 建议的接手路径

### 如果要做 Phase 3（动效系统）

1. `npm install gsap lenis`（依赖已清理，需重新装）
2. 建 `src/components/motion/` 目录
3. Hero 的星空粒子层已经是很好的落点——粒子亮度可随滚动变化
4. **注意**：引入 JS 后 `tools/verify-nojs.mjs` 会开始失败，需要重新定义
   「无 JS 时应保留什么」的验收标准

### 如果要做 Phase 4（内容填充）

1. 先建 `src/content.config.ts` 定义博客集合
2. `src/data/updates.ts` 的空数组填入真实动态
3. 逐个替换 6 个 `PlaceholderSection` 占位页
4. 补 404 页、sitemap、RSS
5. 每完成一个板块跑一次 `tools/smoke.mjs`

### 无论做什么

改动后至少跑：

```bash
npm run check && npm run build && node tools/smoke.mjs
```

发布后跑：

```bash
npm run deploy && node tools/verify-production.mjs
```

---

## 12. 提交历史

```
6c19b4b  feat: 修正 Hero 背景标记倾斜，新增四芒星粒子星空层
048aa43  refactor: 移除 3D 场景，Hero 改为纯静态品牌标记
20bc6ba  docs: 部署说明改为 gh-pages 分支发布模式
d510ebb  refactor: 改用 gh-pages 分支部署，移除 GitHub Actions
46137ed  fix: 统一全站品牌标记呈现，修复 Logo 显示不正确
d159a7a  docs: 补充部署说明与线上验证工具
8060f0c  fix: 3D 场景改用显式挂载，修复线上场景静默消失
a5a548e  feat: Phase 2 3D 场景与 GitHub Pages 部署接入
32f2724  feat: Phase 1 工程初始化与品牌资产管线
```

**为什么有「移除 3D」这个提交**：Phase 2 引入过 React + Three.js + R3F 做首屏 3D 场景，
但装饰弧线的贝塞尔控制点被误当作曲线上的点，渲染成交叉乱线。
考虑到站点不需要 3D 即可成立，按用户要求整体移除，改为纯 CSS 星空粒子层。

> 教训：为一个纯装饰的首屏背景引入四个运行时包 + 一套挂载机制 + 一套降级逻辑，
> 最终因为一个曲线参数错误而产出乱线。**能用 CSS + SVG 解决的，不要引入运行时框架。**
