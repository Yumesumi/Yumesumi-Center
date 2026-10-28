/**
 * 站点级元数据。
 *
 * 所有对外可见的站点名称、描述、默认分享图都以此为唯一来源。
 */
export const SITE = {
  name: 'Yumesumi Center',
  nameZh: '梦澄中心',
  /** 首屏与 <title> 使用的英文标识 */
  wordmark: 'YUMESUMI CENTER',
  tagline: '连接技术世界、数字边界与个人创作的空间',
  description:
    'Yumesumi Center 是 Yumesumi 的个人数字门户，聚合梦澄博客、梦澄指数、Minecraft 服务器与模组工坊、Yumesumi Labs 与 Yumesumi Studio 等项目。',
  locale: 'zh-CN',
  lang: 'zh-CN',
  /** GitHub 用户主页仓库部署，路径位于域名根 */
  url: 'https://yumesumi.github.io',
  ogImage: '/brand/logo.svg',
  author: 'Yumesumi',
  email: 'yumesumi@outlook.com',
} as const;

export type SiteMeta = typeof SITE;
