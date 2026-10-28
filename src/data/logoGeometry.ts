/**
 * Yumesumi Center · Logo 几何数据
 *
 * 自动生成，请勿手工修改。运行 `npm run assets:logo` 重新生成。
 *
 * 来源：logo矢量图.ai（PDF 兼容格式）内容流的精确解析结果，
 * 与 public/brand/logo.svg 完全同源。
 *
 * 坐标系与 SVG 一致（y 向下，单位为 SVG viewBox 的 1/1024 倍）。
 * 3D 场景用这些路径直接构建几何体，保证三维主体与二维品牌资产同源。
 *
 * role 含义：
 *   frame —— 圆角菱形外框，3D 棱镜骨架
 *   star  —— 四芒星，3D 核心晶体
 *   arc   —— 装饰弧线，3D 轨道环
 *   leaf  —— 底部叶形，3D 基座
 */

export type LogoPathRole = 'frame' | 'star' | 'arc' | 'leaf';

export interface LogoPath {
  role: LogoPathRole;
  operator: 'fill' | 'stroke';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeLinecap?: string;
  strokeLinejoin?: string;
  d: string;
}

/** Logo 在 1024 单位画布中的几何信息 */
export const LOGO_METRICS = {
  /** 原始画布尺寸 */
  canvas: 1024,
  /** 菱形外框的边界框（Logo 在画布中的实际占据范围） */
  frameBounds: { minX: 160, minY: 160, maxX: 864, maxY: 864 },
  /** 四芒星中心 */
  starCenter: { x: 512, y: 512 },
  /** 四芒星外尖角半径（大星）与内尖角半径（小星） */
  starOuterRadius: 185,
  starInnerRadius: 113.284,
  /** 品牌色 */
  color: 'rgb(255 255 255)',
} as const;

/** 全部 Logo 路径，按绘制顺序 */
export const LOGO_PATHS: LogoPath[] = [
  {
    role: 'arc',
    operator: 'stroke',
    stroke: 'rgb(255 255 255)',
    strokeWidth: 22,
    strokeLinecap: 'round',
    strokeLinejoin: 'bevel',
    d: 'M250.747 411.215C248.82 537.246 438.939 538.681 463 690',
  },
  {
    role: 'arc',
    operator: 'stroke',
    stroke: 'rgb(255 255 255)',
    strokeWidth: 22,
    strokeLinecap: 'butt',
    strokeLinejoin: 'bevel',
    d: 'M512 850C512 547 152 607 230 520C295 445 461 425 512 164C527 252 691 459 795.551 433.513',
  },
  {
    role: 'arc',
    operator: 'stroke',
    stroke: 'rgb(255 255 255)',
    strokeWidth: 22,
    strokeLinecap: 'butt',
    strokeLinejoin: 'bevel',
    d: 'M645 511C705 531 798 530 827 561C827 561 553 527 512 850',
  },
  {
    role: 'frame',
    operator: 'stroke',
    stroke: 'rgb(255 255 255)',
    strokeWidth: 25,
    strokeLinecap: 'square',
    strokeLinejoin: 'miter',
    d: 'M851.411 534.627L534.627 851.411C522.13 863.908 501.869 863.908 489.372 851.411L172.588 534.627C160.092 522.13 160.092 501.869 172.588 489.372L489.372 172.588C501.869 160.092 522.13 160.092 534.627 172.588L851.411 489.372C863.908 501.869 863.908 522.13 851.411 534.627Z',
  },
  {
    role: 'star',
    operator: 'fill',
    fill: 'rgb(255 255 255)',
    d: 'M512 697L512 697ZM697 512L697 512ZM512 327C496.361 421.946 421.945 496.361 327 512L327 512L327 512C421.945 527.639 496.361 602.055 512 697C527.639 602.055 602.055 527.639 697 512C602.055 496.361 527.639 421.946 512 327M512 327L512 327ZM512 398.716C536.066 448.01 575.99 487.934 625.284 512C575.99 536.066 536.066 575.99 512 625.284C487.934 575.99 448.01 536.066 398.716 512C448.01 487.934 487.934 448.01 512 398.716',
  },
  {
    role: 'arc',
    operator: 'stroke',
    stroke: 'rgb(255 255 255)',
    strokeWidth: 16,
    strokeLinecap: 'butt',
    strokeLinejoin: 'miter',
    d: 'M570.215 806.058L570.215 806.058L570.215 806.058',
  },
  {
    role: 'leaf',
    operator: 'fill',
    fill: 'rgb(255 255 255)',
    d: 'M355 658C361.559 666.536 369.576 672.373 376.645 680C389.009 693.266 402.284 704.801 414.423 718.507C429.836 735.332 444.611 753.642 456.993 774.865C469.066 795.542 477.852 819.636 483.79 844.75L512 855C505.73 823.543 484.723 775.274 469.77 749.835C458.66 731.494 445.79 715.221 431.771 701.302C417.492 687.433 401.778 676.612 385.563 668.093C375.548 663.845 365.508 658.58 355 658',
  },
  {
    role: 'leaf',
    operator: 'fill',
    fill: 'rgb(255 255 255)',
    d: 'M669 658C658.492 658.58 648.452 663.845 638.437 668.093C622.222 676.612 606.508 687.433 592.229 701.302C578.21 715.221 565.34 731.494 554.23 749.835C539.277 775.274 518.27 823.543 512 855L540.21 844.75C546.148 819.636 554.934 795.542 567.007 774.865C579.389 753.642 594.164 735.332 609.577 718.507C621.716 704.801 634.991 693.266 647.355 680C654.424 672.373 662.441 666.536 669 658',
  },
];
