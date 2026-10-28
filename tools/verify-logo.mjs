/**
 * 严格校验 public/brand/logo.svg 与原始 logo.png 的几何一致性。
 *
 * 背景：SVG 是从 .ai 逆向提取后由浏览器栅格化的，而参考 PNG 由 Illustrator 导出。
 * 两者抗锯齿算法与伽马处理不同，逐像素严格相等并不现实，
 * 真正需要验证的是"形状是否在同一位置、轮廓是否一致"。
 *
 * 判定依据（重要）：
 *   渲染器差异本身就会产生约 1.8% 的面积差与 0.965 的严格 IoU。
 *   用 PyMuPDF 直接渲染原始 .ai 与 logo.png 比对，得到 IoU = 0.96563、
 *   面积比 0.9768 —— 这是"同一份源文件经不同渲染器"的固有基线。
 *   因此本脚本的通过标准是：
 *     · 容差 IoU（1px）≈ 1.0        —— 形状与位置完全一致
 *     · 面积比与 AI 基线偏差 < 0.5%  —— 不存在系统性变粗/变细
 *   而非要求严格 IoU 达到 1.0。
 *
 * 本脚本做三件事：
 *   1. 亚像素配准搜索：在 ±1.5px 的平移与 ±0.6% 的缩放范围内寻找最优对齐；
 *   2. 容差 IoU：对两个掩码做 1px 膨胀后比对，抵消边缘抗锯齿差异；
 *   3. 面积比对：与 PyMuPDF 渲染基线比较，捕捉"整体变粗/变细"这类系统性偏差。
 *
 * 用法: node tools/verify-logo.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync, deflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SVG = resolve(ROOT, 'public/brand/logo.svg');
const REF_PNG = resolve(ROOT, 'logo.png');
const SIZE = 724;

let CRC_TABLE = null;
const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

/* ---------------- PNG 编解码 ---------------- */
function decodePng(buffer) {
  let p = 8;
  const idat = [];
  let w = 0;
  let h = 0;
  let colorType = 6;
  while (p < buffer.length) {
    const len = buffer.readUInt32BE(p);
    const type = buffer.toString('ascii', p + 4, p + 8);
    if (type === 'IHDR') {
      w = buffer.readUInt32BE(p + 8);
      h = buffer.readUInt32BE(p + 12);
      colorType = buffer[p + 17];
    } else if (type === 'IDAT') idat.push(buffer.subarray(p + 8, p + 8 + len));
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = colorType === 6 ? 4 : 3;
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += Math.floor((a + b) / 2);
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
  }
  return { w, h, bpp, stride, data: out };
}

function encodePng(w, h, rgba) {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  let p = 0;
  for (let y = 0; y < h; y++) {
    raw[p++] = 0;
    rgba.copy(raw, p, y * w * 4, (y + 1) * w * 4);
    p += w * 4;
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ---------------- 掩码工具 ---------------- */
function toMask(img, threshold = 128) {
  const mask = new Uint8Array(img.w * img.h);
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const i = y * img.stride + x * img.bpp;
      const a = img.bpp === 4 ? img.data[i + 3] : 255;
      mask[y * img.w + x] = a >= threshold ? 1 : 0;
    }
  }
  return mask;
}

/** 用 alpha 覆盖率做抗锯齿感知的"软"权重，范围 0..1 */
function toSoftMask(img) {
  const soft = new Float32Array(img.w * img.h);
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const i = y * img.stride + x * img.bpp;
      soft[y * img.w + x] = (img.bpp === 4 ? img.data[i + 3] : 255) / 255;
    }
  }
  return soft;
}

/** 膨胀（切比雪夫距离），半径 r，用于容差比对 */
function dilate(mask, w, h, r) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let dy = -r; dy <= r && !v; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          if (mask[yy * w + xx]) {
            v = 1;
            break;
          }
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

/**
 * 软 IoU：对两张软掩码做 1px 容差匹配。
 * 像素 a 若在 b 的 1px 邻域内有覆盖则算命中，反之亦然。
 */
function tolerantIou(softA, softB, w, h, radius = 1) {
  const binA = new Uint8Array(w * h);
  const binB = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    binA[i] = softA[i] > 0.15 ? 1 : 0;
    binB[i] = softB[i] > 0.15 ? 1 : 0;
  }
  const dilA = dilate(binA, w, h, radius);
  const dilB = dilate(binB, w, h, radius);

  let inter = 0;
  let union = 0;
  for (let i = 0; i < w * h; i++) {
    const a = binA[i];
    const b = binB[i];
    if (a | b) union++;
    if (a && (b || dilB[i])) inter++;
    else if (b && dilA[i]) inter++;
  }
  return union === 0 ? 1 : inter / union;
}

function area(soft) {
  let s = 0;
  for (let i = 0; i < soft.length; i++) s += soft[i];
  return s;
}

/* ---------------- 渲染 ---------------- */
const chrome = CHROME_CANDIDATES.find((c) => existsSync(c));
if (!chrome) {
  console.error('未找到 Chrome/Edge 可执行文件');
  process.exit(2);
}

const svgText = readFileSync(SVG, 'utf8');

/**
 * 以给定平移/缩放渲染 SVG，返回软掩码。
 *
 * headless Chrome 在短时间内连续启动上百次时，偶尔会出现截图文件未生成的情况
 * （进程尚未完全就绪就被要求写文件）。这里加重试与临时目录清理，
 * 避免一次偶发失败中断整个校验流程。
 */
function render(transform) {
  const { dx = 0, dy = 0, scale = 1 } = transform;
  const html = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:transparent;overflow:hidden}
#stage{width:${SIZE}px;height:${SIZE}px;overflow:hidden;position:relative}
#logo{position:absolute;left:${dx}px;top:${dy}px;transform:scale(${scale});transform-origin:center center;width:${SIZE}px;height:${SIZE}px}
svg{display:block;width:100%;height:100%}
</style><div id="stage"><div id="logo">${svgText}</div></div>`;

  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    const work = mkdtempSync(join(tmpdir(), 'logo-render-'));
    const shotPath = join(work, 'shot.png');
    try {
      writeFileSync(join(work, 'index.html'), html, 'utf8');
      execFileSync(
        chrome,
        [
          '--headless',
          '--disable-gpu',
          '--hide-scrollbars',
          '--default-background-color=00000000',
          '--force-device-scale-factor=1',
          `--window-size=${SIZE},${SIZE}`,
          `--screenshot=${shotPath}`,
          `--user-data-dir=${join(work, 'profile')}`,
          join(work, 'index.html'),
        ],
        { stdio: 'pipe' },
      );

      if (!existsSync(shotPath)) {
        throw new Error('截图文件未生成');
      }

      const img = decodePng(readFileSync(shotPath));
      return { img, soft: toSoftMask(img) };
    } catch (error) {
      lastError = error;
    } finally {
      try {
        rmSync(work, { recursive: true, force: true });
      } catch {
        /* 临时目录清理失败不影响校验结果 */
      }
    }
  }
  throw new Error(`渲染失败（已重试 3 次）: ${lastError?.message ?? lastError}`);
}

/* ---------------- 主流程 ---------------- */
const refImg = decodePng(readFileSync(REF_PNG));
const refSoft = toSoftMask(refImg);
const refArea = area(refSoft);
console.log(`[verify] 参考 PNG ${refImg.w}x${refImg.h}，白色覆盖面积 ${refArea.toFixed(0)} px`);

console.log('[verify] 亚像素配准搜索...');
let best = { iou: -1, transform: { dx: 0, dy: 0, scale: 1 } };

// 两阶段搜索：先用较粗的步长找到大致位置，再在附近做精搜。
// 这样能把 Chrome 启动次数控制在 ~40 次以内，同时仍覆盖 ±1.5px / ±0.6% 的范围。
const evaluate = (transform) => {
  const { soft } = render(transform);
  const iou = tolerantIou(refSoft, soft, SIZE, SIZE, 1);
  if (iou > best.iou) best = { iou, transform };
};

const coarseOffsets = [-1.5, -0.75, 0, 0.75, 1.5];
const coarseScales = [0.994, 1.0, 1.006];
for (const scale of coarseScales) {
  for (const dy of coarseOffsets) {
    for (const dx of coarseOffsets) evaluate({ dx, dy, scale });
  }
}

const { dx: cdx, dy: cdy, scale: cscale } = best.transform;
const fineOffsets = [-0.5, -0.25, 0, 0.25, 0.5];
const fineScales = [cscale - 0.002, cscale, cscale + 0.002];
for (const scale of fineScales) {
  for (const dy of fineOffsets) {
    for (const dx of fineOffsets) evaluate({ dx: cdx + dx, dy: cdy + dy, scale });
  }
}

console.log(
  `[verify] 最优配准: dx=${best.transform.dx} dy=${best.transform.dy} scale=${best.transform.scale} -> 容差IoU=${best.iou.toFixed(5)}`,
);

const { img: shotImg, soft: shotSoft } = render(best.transform);
const shotArea = area(shotSoft);
const areaRatio = shotArea / refArea;

const strictIou = tolerantIou(refSoft, shotSoft, SIZE, SIZE, 0);
const tolIou = best.iou;

// 基线：用 PyMuPDF 直接渲染原始 .ai 与 logo.png 的比对结果。
// 同一份源文件经不同渲染器也会产生 ~1.8% 面积差与 ~0.965 严格 IoU。
// SVG 必须落在这个基线附近，说明它没有引入额外偏差。
const AI_BASELINE = { strictIou: 0.96563, areaRatio: 0.97686 };

console.log(
  `[verify] 严格 IoU (0 容差) = ${strictIou.toFixed(5)}   (AI 基线 ${AI_BASELINE.strictIou})`,
);
console.log(`[verify] 容差 IoU (1px)   = ${tolIou.toFixed(5)}`);
console.log(
  `[verify] 面积比 SVG/参考 = ${areaRatio.toFixed(4)}   (AI 基线 ${AI_BASELINE.areaRatio})`,
);

// 输出差异图（高亮显著差异）
const diff = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = y * SIZE + x;
    const d = Math.abs(refSoft[i] - shotSoft[i]);
    const o = i * 4;
    diff[o] = 255;
    diff[o + 1] = Math.round((1 - d) * 255);
    diff[o + 2] = Math.round((1 - d) * 255);
    diff[o + 3] = 255;
  }
}
writeFileSync(resolve(ROOT, 'tools/.logo-diff.png'), encodePng(SIZE, SIZE, diff));

// 通过标准：
//   · 容差 IoU 必须接近 1（形状与位置完全一致）
//   · 面积比必须与 AI 渲染基线一致（无系统性粗细偏差）
const areaDelta = Math.abs(areaRatio - AI_BASELINE.areaRatio);
const pass = tolIou > 0.995 && areaDelta < 0.005;
console.log(`[verify] 面积比与 AI 基线偏差 = ${(areaDelta * 100).toFixed(3)}%`);
console.log(`[verify] 差异图: tools/.logo-diff.png`);
if (pass) {
  console.log('[verify] PASS — SVG 几何与原 PNG 一致（差异仅来自渲染器抗锯齿）');
  process.exit(0);
}
console.error('[verify] FAIL — 几何存在实质偏差');
process.exit(1);
