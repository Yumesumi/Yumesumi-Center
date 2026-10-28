/**
 * 最近动态数据。
 *
 * 约定：
 *   · 只登记**真实发生过**的更新条目；
 *   · `date` 留空表示暂不展示日期，而不是填一个编造的日期；
 *   · 内容全部未发布前，保持空数组——空状态由组件负责呈现。
 *
 * 接入真实数据源（RSS / GitHub Releases / 服务器状态 API）后，
 * 只需替换本文件的导出内容，组件无需改动。
 */

export interface UpdateEntry {
  title: string;
  summary: string;
  /** 条目类型，例如「博客」「发布」「日志」 */
  kind: string;
  /** 站内链接；未发布前留空 */
  href?: string;
  /** 真实日期（YYYY-MM-DD）；无确切日期时留空 */
  date?: string;
}

export const UPDATES: UpdateEntry[] = [];
