/**
 * 导航结构。
 *
 * 顶部导航保持极简：四个主要入口 + 一个菜单触发器。
 * `key` 用于匹配当前路由以高亮，`external` 表示站外地址。
 */
export interface NavItem {
  label: string;
  href: string;
  key: string;
  external?: boolean;
}

export const PRIMARY_NAV: NavItem[] = [
  { label: 'HOME', href: '/', key: 'home' },
  { label: 'PROJECTS', href: '/projects/', key: 'projects' },
  { label: 'INDEX', href: '/ysi/', key: 'ysi' },
  { label: 'STUDIO', href: '/studio/', key: 'studio' },
  { label: 'ABOUT', href: '/about/', key: 'about' },
];

/** 页脚导航：比顶部更完整，覆盖全部子板块 */
export const FOOTER_NAV: NavItem[] = [
  ...PRIMARY_NAV,
  { label: 'BLOG', href: '/blog/', key: 'blog' },
  { label: 'LABS', href: '/labs/', key: 'labs' },
  { label: 'MINECRAFT', href: '/minecraft/', key: 'minecraft' },
  { label: 'MODS', href: '/mods/', key: 'mods' },
];

/** 移动端菜单中的分组标题 */
export const MENU_SECTIONS = [
  { title: '空间', items: PRIMARY_NAV.filter((i) => i.key !== 'home') },
  { title: '项目', items: FOOTER_NAV.filter((i) => !PRIMARY_NAV.includes(i)) },
] as const;
