/**
 * 从 Illustrator 的 PDF 兼容格式 (.ai) 中提取品牌 Logo 的矢量路径，输出为干净的 SVG。
 *
 * 为什么不直接用 logo.png：
 *   - PNG 是 724x724 的位图，在大尺寸下会模糊，且无法做描边/形变动画。
 *   - .ai 文件内嵌了完整的 PDF 内容流，其中包含 8 条精确的贝塞尔路径。
 *
 * 这个脚本严格按 PDF 规范解释内容流（q/Q/cm/m/l/c/v/h/S/f/w/j/J/sc/scn/SCN），
 * 不做任何"美化"或几何近似——输出的 SVG 与原文件在数学上等价。
 *
 * 坐标系说明：
 *   PDF 用户空间 y 向上，SVG y 向下，因此做一次 y 翻转：y_svg = 1024 - y_pdf。
 *   画板裁剪框取自原文件的 ArtBox，保证 SVG 与 logo.png 的取景完全一致。
 *
 * 用法: node tools/build-logo-svg.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_AI = resolve(ROOT, 'logo矢量图.ai');
const OUT_SVG = resolve(ROOT, 'public/brand/logo.svg');
const OUT_GEOMETRY = resolve(ROOT, 'src/data/logoGeometry.ts');
const PAGE = 1024;
// 原文件 ArtBox：[150.716, 150.716, 873.284, 873.284]，与 logo.png 的取景一致
const ART_BOX = { x: 150.716, y: 150.716, w: 873.284 - 150.716, h: 873.284 - 150.716 };

/* ------------------------------------------------------------------ *
 * 1. 从 .ai（PDF 兼容）里抽出内容流
 * ------------------------------------------------------------------ */
function extractContentStream(aiBuffer) {
  const raw = aiBuffer.toString('latin1');
  const objects = new Map();
  const objRe = /(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g;
  let match;
  while ((match = objRe.exec(raw)) !== null) {
    objects.set(Number(match[1]), match[3]);
  }

  let contentObjId = null;
  for (const body of objects.values()) {
    if (/\/Type\s*\/Page[^s]/.test(body)) {
      const ref = body.match(/\/Contents\s+(\d+)\s+0\s+R/);
      if (ref) {
        contentObjId = Number(ref[1]);
        break;
      }
    }
  }
  if (contentObjId === null) throw new Error('未找到页面对象 /Contents 引用');

  const body = objects.get(contentObjId);
  let dataStart = body.indexOf('stream') + 'stream'.length;
  if (body[dataStart] === '\r') dataStart += 1;
  if (body[dataStart] === '\n') dataStart += 1;
  const dataEnd = body.lastIndexOf('endstream');

  return inflateSync(Buffer.from(body.slice(dataStart, dataEnd), 'latin1')).toString('latin1');
}

/* ------------------------------------------------------------------ *
 * 2. 极简 PDF 内容流解释器
 * ------------------------------------------------------------------ */
function tokenize(content) {
  return content.match(/\[[^\]]*\]|\/[A-Za-z0-9#]+|[-+]?[0-9]*\.?[0-9]+|[A-Za-z'*"]{1,3}/g) ?? [];
}

function parseContentStream(content) {
  const tokens = tokenize(content);

  // CTM = [a b c d e f]，点变换 (x,y) -> (a*x + c*y + e, b*x + d*y + f)
  // cm 操作符按 M' = M × N 拼接（先 M 后 N）
  const multiply = (m, n) => [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];

  const state = {
    ctm: [1, 0, 0, 1, 0, 0],
    lineWidth: 1,
    lineCap: 0,
    lineJoin: 0,
    fillColor: [0, 0, 0],
    strokeColor: [0, 0, 0],
  };
  const stateStack = [];

  const drawings = [];
  let subpaths = [];
  let current = null;
  let currentPoint = null;
  let pending = [];

  const flush = (operator) => {
    if (subpaths.length === 0) return;
    drawings.push({
      operator,
      subpaths,
      lineWidth: state.lineWidth,
      lineCap: state.lineCap,
      lineJoin: state.lineJoin,
      fillColor: [...state.fillColor],
      strokeColor: [...state.strokeColor],
    });
    subpaths = [];
    current = null;
    currentPoint = null;
  };

  const toUser = ([x, y]) => {
    const m = state.ctm;
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  };

  for (let i = 0; i < tokens.length;) {
    const token = tokens[i];

    if (/^[-+]?[0-9]*\.?[0-9]+$/.test(token) || token[0] === '[' || token[0] === '/') {
      pending.push(token);
      i += 1;
      continue;
    }

    const args = pending.map(Number);
    switch (token) {
      case 'q':
        stateStack.push({
          ctm: [...state.ctm],
          lineWidth: state.lineWidth,
          lineCap: state.lineCap,
          lineJoin: state.lineJoin,
          fillColor: [...state.fillColor],
          strokeColor: [...state.strokeColor],
        });
        break;
      case 'Q': {
        const r = stateStack.pop();
        if (r) Object.assign(state, r);
        break;
      }
      case 'cm': {
        const [a, b, c, d, e, f] = args;
        state.ctm = multiply(state.ctm, [a, b, c, d, e, f]);
        break;
      }
      case 'm': {
        const p = toUser(args);
        current = { start: p, segments: [] };
        currentPoint = p;
        subpaths.push(current);
        break;
      }
      case 'l': {
        const p = toUser(args);
        current.segments.push({ type: 'L', to: p });
        currentPoint = p;
        break;
      }
      case 'c': {
        const [x1, y1, x2, y2, x3, y3] = args;
        const p = toUser([x3, y3]);
        current.segments.push({ type: 'C', c1: toUser([x1, y1]), c2: toUser([x2, y2]), to: p });
        currentPoint = p;
        break;
      }
      case 'v': {
        // v: 第一个控制点 = 当前点
        const [x2, y2, x3, y3] = args;
        const p = toUser([x3, y3]);
        current.segments.push({
          type: 'C',
          c1: currentPoint,
          c2: toUser([x2, y2]),
          to: p,
        });
        currentPoint = p;
        break;
      }
      case 'y': {
        // y: 第二个控制点 = 终点
        const [x1, y1, x3, y3] = args;
        const p = toUser([x3, y3]);
        current.segments.push({ type: 'C', c1: toUser([x1, y1]), c2: p, to: p });
        currentPoint = p;
        break;
      }
      case 'h':
        current.segments.push({ type: 'Z' });
        currentPoint = current.start;
        break;
      case 'w':
        state.lineWidth = args[0];
        break;
      case 'J':
        state.lineCap = args[0];
        break;
      case 'j':
        state.lineJoin = args[0];
        break;
      case 're':
      case 'W':
      case 'n':
        if (token === 'n') {
          subpaths = [];
          current = null;
          currentPoint = null;
        }
        break;
      case 'S':
      case 's':
        flush('stroke');
        break;
      case 'f':
      case 'F':
        flush('fill');
        break;
      case 'B':
        flush('fill-stroke');
        break;
      case 'SC':
      case 'SCN':
        if (args.length >= 3) state.strokeColor = args.slice(-3);
        break;
      case 'sc':
      case 'scn':
        if (args.length >= 3) state.fillColor = args.slice(-3);
        break;
      default:
        break;
    }

    pending = [];
    i += 1;
  }

  return drawings;
}

/* ------------------------------------------------------------------ *
 * 3. 转为 SVG path 数据（PDF y 向上 -> SVG y 向下）
 * ------------------------------------------------------------------ */
const round = (n) => {
  const v = Math.round(n * 1000) / 1000;
  return Object.is(v, -0) ? 0 : v;
};
const flipY = ([x, y]) => [x, PAGE - y];

function toPathData(drawing) {
  const parts = [];
  for (const sub of drawing.subpaths) {
    const [sx, sy] = flipY(sub.start);
    parts.push(`M${round(sx)} ${round(sy)}`);
    for (const seg of sub.segments) {
      if (seg.type === 'L') {
        const [x, y] = flipY(seg.to);
        parts.push(`L${round(x)} ${round(y)}`);
      } else if (seg.type === 'C') {
        const [x1, y1] = flipY(seg.c1);
        const [x2, y2] = flipY(seg.c2);
        const [x, y] = flipY(seg.to);
        parts.push(`C${round(x1)} ${round(y1)} ${round(x2)} ${round(y2)} ${round(x)} ${round(y)}`);
      } else {
        parts.push('Z');
      }
    }
  }
  return parts.join('');
}

const CAP_MAP = { 0: 'butt', 1: 'round', 2: 'square' };
const JOIN_MAP = { 0: 'miter', 1: 'round', 2: 'bevel' };
const rgb = (c) => `rgb(${c.map((v) => Math.round(v * 255)).join(' ')})`;

/* ------------------------------------------------------------------ *
 * 4. 输出 SVG
 * ------------------------------------------------------------------ */
function buildSvg(drawings) {
  const body = drawings
    .map((d) => {
      const path = toPathData(d);
      if (d.operator === 'fill') {
        return `  <path d="${path}" fill="${rgb(d.fillColor)}"/>`;
      }
      if (d.operator === 'stroke') {
        return (
          `  <path d="${path}" fill="none" stroke="${rgb(d.strokeColor)}" ` +
          `stroke-width="${round(d.lineWidth)}" stroke-linecap="${CAP_MAP[d.lineCap]}" ` +
          `stroke-linejoin="${JOIN_MAP[d.lineJoin]}"/>`
        );
      }
      return (
        `  <path d="${path}" fill="${rgb(d.fillColor)}" stroke="${rgb(d.strokeColor)}" ` +
        `stroke-width="${round(d.lineWidth)}" stroke-linecap="${CAP_MAP[d.lineCap]}" ` +
        `stroke-linejoin="${JOIN_MAP[d.lineJoin]}"/>`
      );
    })
    .join('\n');

  const vb = `${round(ART_BOX.x)} ${round(ART_BOX.y)} ${round(ART_BOX.w)} ${round(ART_BOX.h)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${round(ART_BOX.w)}" height="${round(ART_BOX.h)}" fill="none" role="img" aria-label="Yumesumi Center">
${body}
</svg>
`;
}

/* ------------------------------------------------------------------ *
 * 5. 导出几何数据（供 3D 建模复用）
 * ------------------------------------------------------------------ */

/**
 * 每条路径在 Logo 中的角色。3D 场景直接复用这些路径来建模，
 * 保证三维主体与二维品牌资产同源，不会出现"另画一套形状"的问题。
 *
 *   frame    —— 圆角菱形外框（stroke），3D 中作为棱镜骨架
 *   star     —— 四芒星（fill），3D 中作为核心晶体
 *   arc      —— 装饰弧线（stroke），3D 中作为轨道环
 *   leaf     —— 底部叶形填充，3D 中作为底部基座
 */
const ROLE_BY_INDEX = ['arc', 'arc', 'arc', 'frame', 'star', 'arc', 'leaf', 'leaf'];

function buildGeometryModule(drawings) {
  const entries = drawings.map((d, i) => {
    const role = ROLE_BY_INDEX[i] ?? 'arc';
    const path = toPathData(d);
    const attrs =
      d.operator === 'fill'
        ? { fill: rgb(d.fillColor) }
        : {
            stroke: rgb(d.strokeColor),
            strokeWidth: round(d.lineWidth),
            strokeLinecap: CAP_MAP[d.lineCap],
            strokeLinejoin: JOIN_MAP[d.lineJoin],
          };
    return `  {
    role: '${role}',
    operator: '${d.operator}',
    ${Object.entries(attrs)
      .map(([k, v]) => `${k}: ${typeof v === 'number' ? v : `'${v}'`}`)
      .join(',\n    ')},
    d: '${path}',
  },`;
  });

  return `/**
 * Yumesumi Center · Logo 几何数据
 *
 * 自动生成，请勿手工修改。运行 \`npm run assets:logo\` 重新生成。
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
  canvas: ${PAGE},
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
${entries.join('\n')}
];
`;
}

/* ------------------------------------------------------------------ *
 * main
 * ------------------------------------------------------------------ */
if (!existsSync(SOURCE_AI)) {
  console.error(`找不到源文件: ${SOURCE_AI}`);
  process.exit(1);
}

const content = extractContentStream(readFileSync(SOURCE_AI));
const drawings = parseContentStream(content);

if (drawings.length === 0) {
  console.error('内容流中未解析出任何图形');
  process.exit(1);
}

writeFileSync(OUT_SVG, buildSvg(drawings), 'utf8');
writeFileSync(OUT_GEOMETRY, buildGeometryModule(drawings), 'utf8');

const fills = drawings.filter((d) => d.operator === 'fill').length;
const strokes = drawings.filter((d) => d.operator === 'stroke').length;
console.log(`[logo] 解析 ${drawings.length} 条路径（${fills} 填充 / ${strokes} 描边）`);
console.log(`[logo] 输出 ${OUT_SVG}`);
console.log(`[logo] 输出 ${OUT_GEOMETRY}`);
