// @ts-check
import { defineConfig } from 'astro/config';

/**
 * Yumesumi Center · Astro 配置
 *
 * 部署目标：GitHub 仓库 Yumesumi/Yumesumi-Center（普通项目仓库）
 *   - 项目仓库的站点位于 https://yumesumi.github.io/Yumesumi-Center/
 *   - 因此 base 必须为 '/Yumesumi-Center/'，否则所有静态资源与路由都会 404
 *   - 若后续迁移到用户主页仓库（Yumesumi.github.io），把 base 改回 '/' 即可
 *
 * 换域名或仓库类型时，只需改动下面两行，无需触碰业务代码。
 */
export default defineConfig({
  site: 'https://yumesumi.github.io',
  base: '/Yumesumi-Center/',

  // 静态输出，直接产出可部署到 GitHub Pages 的纯静态文件
  output: 'static',
  trailingSlash: 'always',
  build: {
    // 压缩 HTML / CSS / JS，减少传输体积
    inlineStylesheets: 'auto',
  },

  devToolbar: {
    enabled: false,
  },

  vite: {
    build: {
      rollupOptions: {
        output: {
          // Astro 7 使用 Rolldown 作为打包器，分包配置走 codeSplitting.groups。
          // GSAP 体积较大且只在动效相关代码里用到，单独拆包便于并行加载。
          codeSplitting: {
            groups: [{ name: 'motion', test: /node_modules[\\/]gsap[\\/]/ }],
          },
        },
      },
    },
  },
});
