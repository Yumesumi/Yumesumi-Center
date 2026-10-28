// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

/**
 * Yumesumi Center · Astro 配置
 *
 * 部署目标：GitHub 用户主页仓库（<username>.github.io）
 *   - 用户主页仓库天然位于域名根路径，因此 base 保持 '/'
 *   - site 用于生成 canonical / sitemap 中的绝对 URL
 *   - 若后续改用普通项目仓库（子路径部署），只需把 base 改为 '/<仓库名>/'
 *
 * 换域名或仓库类型时，只需改动下面两行，无需触碰业务代码。
 */
export default defineConfig({
  site: 'https://yumesumi.github.io',
  base: '/',

  // 静态输出，直接产出可部署到 GitHub Pages 的纯静态文件
  output: 'static',
  trailingSlash: 'always',
  build: {
    // 压缩 HTML / CSS / JS，减少传输体积
    inlineStylesheets: 'auto',
  },

  integrations: [
    react({
      // React 组件仅在明确标注 client:* 时才注水，其余页面保持纯静态
      experimentalIncludeChildren: true,
    }),
  ],

  devToolbar: {
    enabled: false,
  },

  vite: {
    build: {
      rollupOptions: {
        output: {
          // Astro 7 使用 Rolldown 作为打包器，分包配置走 codeSplitting.groups。
          // three.js 体积较大，单独拆包，让应用代码可以与之并行加载。
          codeSplitting: {
            groups: [
              { name: 'three', test: /node_modules[\\/]three[\\/]/ },
              { name: 'motion', test: /node_modules[\\/]gsap[\\/]/ },
            ],
          },
        },
      },
    },
  },
});
