/**
 * Logo 几何 → Three.js 几何体的转换。
 *
 * 核心思路：**不自建一套形状**。
 * 直接复用 logoGeometry.ts 里与 SVG 同源的路径数据来构建三维主体，
 * 因此三维形象与二维品牌资产在数学上同源，不会出现"另画了一套"的问题。
 *
 * 母题拆解（取自 Logo 的构成）：
 *   · 圆角菱形外框 → 棱镜骨架（ExtrudeGeometry，带厚度与倒角）
 *   · 四芒星       → 核心晶体（星形挤出 + 内层小星）
 *   · 装饰弧线     → 环绕轨道（沿曲线生成的管体）
 */

import * as THREE from 'three';
import { LOGO_METRICS, LOGO_PATHS, type LogoPath } from '@/data/logoGeometry';

/** 画布坐标 → 世界坐标的缩放：让 Logo 恰好占约 2 个世界单位 */
const SCALE = 2 / (LOGO_METRICS.frameBounds.maxX - LOGO_METRICS.frameBounds.minX);

/** Logo 几何中心（画布坐标 512,512）对应的世界原点 */
const CENTER = LOGO_METRICS.starCenter;

interface PathCommand {
  op: 'M' | 'L' | 'C' | 'Z';
  points: number[];
}

/** 解析 SVG path 的 M/L/C/Z 子集（本项目的路径只含这四种命令） */
function parsePath(d: string): PathCommand[] {
  const tokens = d.match(/[MLCZ]|-?[\d.]+/g) ?? [];
  const commands: PathCommand[] = [];
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];
    if (token === 'M' || token === 'L' || token === 'C' || token === 'Z') {
      i += 1;
      if (token === 'Z') {
        commands.push({ op: 'Z', points: [] });
        continue;
      }
      const count = token === 'C' ? 6 : 2;
      const points = tokens.slice(i, i + count).map(Number);
      i += count;
      commands.push({ op: token, points });
    } else {
      i += 1;
    }
  }
  return commands;
}

/** 画布坐标 → 世界坐标 */
const toWorld = (x: number, y: number): [number, number] => [
  (x - CENTER.x) * SCALE,
  // SVG y 向下，Three.js y 向上，需要翻转
  -(y - CENTER.y) * SCALE,
];

/**
 * 把一条 Logo 路径转换成若干 THREE.Shape。
 *
 * 一个 path 里可能包含多个子路径。四芒星尤其特殊：
 * 它由「两个退化点 + 大星轮廓 + 一个退化点 + 小星轮廓」组成，
 * 退化点（M x y L x y Z）是为填充规则准备的零面积子路径，
 * 在三维里没有意义，必须先过滤掉。
 */
function toShapes(path: LogoPath): THREE.Shape[] {
  const commands = parsePath(path.d);
  const shapes: THREE.Shape[] = [];
  let current: THREE.Shape | null = null;

  for (const cmd of commands) {
    switch (cmd.op) {
      case 'M': {
        const [x, y] = toWorld(cmd.points[0]!, cmd.points[1]!);
        current = new THREE.Shape();
        current.moveTo(x, y);
        shapes.push(current);
        break;
      }
      case 'L': {
        if (!current) break;
        const [x, y] = toWorld(cmd.points[0]!, cmd.points[1]!);
        current.lineTo(x, y);
        break;
      }
      case 'C': {
        if (!current) break;
        const [x1, y1] = toWorld(cmd.points[0]!, cmd.points[1]!);
        const [x2, y2] = toWorld(cmd.points[2]!, cmd.points[3]!);
        const [x, y] = toWorld(cmd.points[4]!, cmd.points[5]!);
        current.bezierCurveTo(x1, y1, x2, y2, x, y);
        break;
      }
      case 'Z': {
        current?.closePath();
        break;
      }
    }
  }

  // 过滤退化子路径（零面积，Logo 用它们来控制填充规则）
  return shapes.filter((s) => Math.abs(polygonArea(s.getPoints(16))) > 1e-6);
}

/** 计算多边形的有向面积，用于判断绕向与筛选退化形状 */
function polygonArea(points: THREE.Vector2[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

/**
 * 构建菱形棱镜骨架。
 *
 * Logo 的菱形是描边（stroke）而非填充，这里用"外轮廓 + 缩放内轮廓"合成一个
 * 带厚度的框，再挤出成立体棱镜——既保留了 Logo 的圆角菱形语言，
 * 又具备建筑感与体积。
 */
export function buildPrismGeometry(): THREE.BufferGeometry {
  const frame = LOGO_PATHS.find((p) => p.role === 'frame');
  if (!frame) throw new Error('Logo 几何中缺少 frame 路径');

  const shapes = toShapes(frame);
  if (shapes.length === 0) throw new Error('Logo 菱形外框解析为空');

  const outer = shapes[0]!;
  const outerPoints = outer.getPoints(160);

  // 内轮廓：把外轮廓朝中心缩放，缩进量对应 Logo 的描边宽度（25/704 ≈ 3.55%）
  const inset = 0.0355;
  const innerPoints = outerPoints.map(
    (p) => new THREE.Vector2(p.x * (1 - inset), p.y * (1 - inset)),
  );

  // 孔洞的绕向必须与外轮廓相反，否则三角化会失败
  const outerArea = polygonArea(outerPoints);
  const innerArea = polygonArea(innerPoints);
  if (Math.sign(innerArea) === Math.sign(outerArea)) {
    innerPoints.reverse();
  }

  const shape = new THREE.Shape(outerPoints);
  shape.holes.push(new THREE.Path(innerPoints));

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.022,
    bevelSegments: 4,
    curveSegments: 32,
  });

  geometry.center();
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * 构建核心四芒星晶体。
 *
 * Logo 的四芒星由两个子路径组成：外层大星（半径 185）挖孔，
 * 内层小星（半径 113）实心。这里大星作为发光环、小星作为实体核心。
 */
export function buildStarGeometries(): {
  halo: THREE.BufferGeometry;
  core: THREE.BufferGeometry;
} {
  const star = LOGO_PATHS.find((p) => p.role === 'star');
  if (!star) throw new Error('Logo 几何中缺少 star 路径');

  const shapes = toShapes(star);
  if (shapes.length < 2) throw new Error('Logo 四芒星解析出的子路径不足');

  // 按面积排序：最大的为外轮廓（大星），次之为内轮廓（小星）
  const sorted = [...shapes].sort(
    (a, b) => Math.abs(polygonArea(b.getPoints(64))) - Math.abs(polygonArea(a.getPoints(64))),
  );
  const outer = sorted[0]!;
  const inner = sorted[1]!;

  const outerPoints = outer.getPoints(96);
  const innerPoints = inner.getPoints(96);

  // 大星带小星孔洞 → 形成环形光晕；小星单独作为核心晶体
  const haloShape = new THREE.Shape(outerPoints);
  const holePoints = [...innerPoints];
  if (Math.sign(polygonArea(holePoints)) === Math.sign(polygonArea(outerPoints))) {
    holePoints.reverse();
  }
  haloShape.holes.push(new THREE.Path(holePoints));

  const halo = new THREE.ExtrudeGeometry(haloShape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.014,
    bevelSegments: 3,
    curveSegments: 48,
  });
  halo.center();
  halo.computeVertexNormals();

  const core = new THREE.ExtrudeGeometry(new THREE.Shape(innerPoints), {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.024,
    bevelSegments: 3,
    curveSegments: 48,
  });
  core.center();
  core.computeVertexNormals();

  return { halo, core };
}

/**
 * 构建环绕轨道。
 *
 * 取 Logo 的三条装饰弧线，沿其曲线生成管体（TubeGeometry），
 * 让三维场景与二维标志共享同一套"流动"的形态语言。
 */
export function buildOrbitGeometries(): THREE.BufferGeometry[] {
  const arcs = LOGO_PATHS.filter((p) => p.role === 'arc' && p.operator === 'stroke');
  const geometries: THREE.BufferGeometry[] = [];

  for (const arc of arcs) {
    const commands = parsePath(arc.d);
    const points: THREE.Vector3[] = [];

    for (const cmd of commands) {
      if (cmd.op === 'M') {
        const [x, y] = toWorld(cmd.points[0]!, cmd.points[1]!);
        points.push(new THREE.Vector3(x, y, 0));
      } else if (cmd.op === 'C') {
        const [x1, y1] = toWorld(cmd.points[0]!, cmd.points[1]!);
        const [x2, y2] = toWorld(cmd.points[2]!, cmd.points[3]!);
        const [x, y] = toWorld(cmd.points[4]!, cmd.points[5]!);
        points.push(
          new THREE.Vector3(x, y, 0),
          new THREE.Vector3(x1, y1, 0),
          new THREE.Vector3(x2, y2, 0),
        );
      }
    }

    if (points.length < 2) continue;

    // 用 CatmullRom 让曲线穿过控制点，得到平滑轨道
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
    const geometry = new THREE.TubeGeometry(curve, 96, 0.008, 8, false);
    geometry.computeVertexNormals();
    geometries.push(geometry);
  }

  return geometries;
}

/**
 * 构建底部基座。
 *
 * Logo 底部两片对称的叶形填充，在三维中作为承载主体的基座结构。
 */
export function buildPedestalGeometries(): THREE.BufferGeometry[] {
  const leaves = LOGO_PATHS.filter((p) => p.role === 'leaf');
  const geometries: THREE.BufferGeometry[] = [];

  for (const leaf of leaves) {
    const shapes = toShapes(leaf);
    const geometry = new THREE.ExtrudeGeometry(shapes[0]!, {
      depth: 0.08,
      bevelEnabled: true,
      bevelThickness: 0.01,
      bevelSize: 0.012,
      bevelSegments: 3,
      curveSegments: 32,
    });
    geometry.center();
    geometry.computeVertexNormals();
    geometries.push(geometry);
  }

  return geometries;
}
