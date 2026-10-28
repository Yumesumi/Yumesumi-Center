/**
 * 项目清单。
 *
 * 重要约定：这里只记录**已确定存在**的项目及其定位描述。
 * 不包含任何虚构的访问量、在线人数、发布日期或版本号——
 * 真实的动态数据（服务器状态、文章列表、K 线）应由各自的独立数据源提供，
 * 在真正接通之前，一律以 `status: 'planned'` 呈现，不伪装成已完成。
 */

export type ProjectStatus = 'live' | 'planned';

export interface Project {
  /** 路由 key，用于匹配当前页面 */
  key: string;
  /** 英文名 */
  name: string;
  /** 中文名 */
  nameZh: string;
  /** 站内路径 */
  href: string;
  /** 一句话定位 */
  summary: string;
  /** 该项目在首页展示区块中的顺序 */
  order: number;
  status: ProjectStatus;
  /**
   * 视觉重心：每个项目区块的色彩重心不同，但共享全局设计规范。
   * 取值为 CSS 自定义属性名。
   */
  accentVar: string;
  /**
   * 区块构图方式。刻意避免所有项目都渲染成相同的卡片网格——
   * 每种构图对应不同的比例与空间关系。
   */
  layout: 'feature' | 'split' | 'wide' | 'offset';
}

export const PROJECTS: Project[] = [
  {
    key: 'ysi',
    name: 'Yumesumi Index',
    nameZh: '梦澄指数',
    href: '/ysi/',
    summary: '模拟金融市场指数，记录时间、波动与趋势的实验性可视化。',
    order: 1,
    status: 'planned',
    accentVar: '--ys-purple-bright',
    layout: 'feature',
  },
  {
    key: 'blog',
    name: 'Yumesumi Blog',
    nameZh: '梦澄博客',
    href: '/blog/',
    summary: '技术文章、个人思考与创作记录。',
    order: 2,
    status: 'planned',
    accentVar: '--ys-lavender',
    layout: 'split',
  },
  {
    key: 'minecraft',
    name: 'Minecraft World',
    nameZh: '梦澄 Minecraft 服务器',
    href: '/minecraft/',
    summary: '服务器介绍、游戏世界、入服指南与运行状态。',
    order: 3,
    status: 'planned',
    accentVar: '--ys-purple',
    layout: 'wide',
  },
  {
    key: 'mods',
    name: 'Minecraft Mods',
    nameZh: 'Minecraft 模组工坊',
    href: '/mods/',
    summary: '模组介绍、版本兼容性、下载与更新日志。',
    order: 4,
    status: 'planned',
    accentVar: '--ys-lavender-soft',
    layout: 'offset',
  },
  {
    key: 'labs',
    name: 'Yumesumi Labs',
    nameZh: '梦澄实验室',
    href: '/labs/',
    summary: '软件、开源项目与实验性技术作品。',
    order: 5,
    status: 'planned',
    accentVar: '--ys-purple-bright',
    layout: 'split',
  },
  {
    key: 'studio',
    name: 'Yumesumi Studio',
    nameZh: '梦澄工作室',
    href: '/studio/',
    summary: '视频、音乐及其他创意作品。',
    order: 6,
    status: 'planned',
    accentVar: '--ys-lavender',
    layout: 'wide',
  },
];

export const PROJECT_BY_KEY = Object.fromEntries(PROJECTS.map((p) => [p.key, p])) as Record<
  string,
  Project
>;

export const SORTED_PROJECTS = [...PROJECTS].sort((a, b) => a.order - b.order);
