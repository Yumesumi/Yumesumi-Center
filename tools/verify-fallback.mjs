/**
 * 降级路径验证：模拟 WebGL 不可用，确认页面仍然完整可用。
 *
 * 做法：拦截 Canvas.prototype.getContext，让它返回 null，
 * 模拟不支持 WebGL 的环境，再检查：
 *   · 页面是否有控制台报错
 *   · 关键内容（字标、正文、导航）是否仍然存在
 *   · CSS 占位几何体是否正常接管视觉
 *   · 导航是否仍然可用
 *
 * 用法: node tools/verify-fallback.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const PORT = 4324;

const astroConfig = await import(pathToFileURL(resolve(ROOT, 'astro.config.mjs')).href);
const BASE_PATH = astroConfig.default.base ?? '/';
const ORIGIN = `http://127.0.0.1:${PORT}`;

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((c) => existsSync(c));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, ORIGIN).pathname);
    if (!path.startsWith(BASE_PATH)) {
      res.writeHead(404);
      res.end('404');
      return;
    }
    const rel = path.slice(BASE_PATH.length) || '/';
    let filePath = join(DIST, rel);
    try {
      const s = await stat(filePath);
      if (s.isDirectory()) filePath = join(filePath, 'index.html');
    } catch {
      filePath = join(DIST, rel.replace(/\/$/, ''), 'index.html');
    }
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('404');
  }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const userDataDir = mkdtempSync(join(tmpdir(), 'fallback-'));
const child = spawn(
  CHROME,
  [
    '--headless=new',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--hide-scrollbars',
    '--no-first-run',
    '--remote-debugging-port=9225',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function waitForCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9225/json/version');
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch {
      /* 等待启动 */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Chrome 未就绪');
}

const ws = new WebSocket(await waitForCdp());
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', rej, { once: true });
});

let msgId = 0;
const pending = new Map();
const logs = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  } else if (m.method === 'Runtime.consoleAPICalled') {
    if (m.params.type === 'error') {
      logs.push({
        type: m.params.type,
        text: (m.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' '),
      });
    }
  } else if (m.method === 'Runtime.exceptionThrown') {
    logs.push({
      type: 'exception',
      text: m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text,
    });
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);

// 在页面加载前禁用 WebGL
await send(
  'Page.addScriptToEvaluateOnNewDocument',
  {
    source: `
    (() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (typeof type === 'string' && type.toLowerCase().includes('webgl')) {
          return null;
        }
        return original.call(this, type, ...rest);
      };
    })();
  `,
  },
  sessionId,
);

await send(
  'Emulation.setDeviceMetricsOverride',
  {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  },
  sessionId,
);

await send('Page.navigate', { url: `${ORIGIN}${BASE_PATH}` }, sessionId);
await new Promise((r) => setTimeout(r, 4000));

const probe = await send(
  'Runtime.evaluate',
  {
    expression: `(() => {
    const text = document.body.innerText || '';
    const geometry = document.querySelector('.hero__geometry');
    const wordmark = document.querySelector('.hero__wordmark');
    const navLinks = document.querySelectorAll('.site-nav__link');
    const canvas = document.querySelector('.scene-root canvas');
    const lede = document.querySelector('.hero__lede');

    const geoStyle = geometry ? getComputedStyle(geometry) : null;

    return {
      webglCanvasCreated: !!canvas,
      wordmarkPresent: !!wordmark,
      wordmarkText: wordmark ? wordmark.innerText.replace(/\\n/g, ' ') : null,
      wordmarkVisible: wordmark ? getComputedStyle(wordmark).display !== 'none' && wordmark.getBoundingClientRect().height > 0 : false,
      ledePresent: !!lede,
      ledeText: lede ? lede.textContent.trim() : null,
      navLinkCount: navLinks.length,
      navLinksVisible: Array.from(navLinks).filter(a => a.getBoundingClientRect().width > 0).length,
      fallbackGeometryOpacity: geoStyle ? geoStyle.opacity : null,
      fallbackGeometryVisible: geometry ? geometry.getBoundingClientRect().width > 0 : false,
      bodyTextLength: text.length,
      hasMainContent: !!document.querySelector('main#main'),
      hasSkipLink: !!document.querySelector('.ys-skip-link'),
    };
  })()`,
    returnByValue: true,
  },
  sessionId,
);

const r = probe.result.value;
console.log('[fallback] WebGL 不可用环境下的检查结果:');
console.log(JSON.stringify(r, null, 2));

console.log('\n[fallback] 控制台错误:');
if (logs.length === 0) console.log('  (无)');
logs.slice(0, 10).forEach((m) => console.log(`  [${m.type}] ${m.text.slice(0, 300)}`));

const checks = [
  ['未创建 WebGL 画布', r.webglCanvasCreated === false],
  ['字标存在且可见', r.wordmarkPresent && r.wordmarkVisible],
  [
    '字标文本完整',
    (r.wordmarkText ?? '').includes('YUMESUMI') && (r.wordmarkText ?? '').includes('CENTER'),
  ],
  ['正文说明存在', r.ledePresent],
  ['导航链接可见', r.navLinkCount >= 5 && r.navLinksVisible >= 5],
  ['CSS 占位几何体接管', r.fallbackGeometryVisible],
  ['主内容区存在', r.hasMainContent],
  ['跳转链接存在', r.hasSkipLink],
  ['无控制台错误', logs.length === 0],
];

console.log('\n[fallback] 验收:');
let pass = true;
for (const [label, ok] of checks) {
  console.log(`  ${ok ? '✓' : '✗'} ${label}`);
  if (!ok) pass = false;
}

ws.close();
child.kill();
server.close();
console.log(pass ? '\n[fallback] PASS — 降级路径完整可用' : '\n[fallback] FAIL — 降级路径存在问题');
process.exit(pass ? 0 : 1);
