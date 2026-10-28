/**
 * 浏览器冒烟测试：逐个访问构建产物，收集控制台报错与页面异常。
 *
 * 用 Chrome DevTools Protocol 直连 headless Chrome，
 * 不引入 Playwright/Puppeteer 等额外依赖（避免为一次校验增加体积）。
 *
 * 关键点：服务器会把 dist 挂载到 astro.config 的 base 路径下，
 * 精确模拟 GitHub Pages 的子路径部署环境。
 * 若页面里残留任何未加前缀的绝对路径，会立刻 404 并被抓出来。
 *
 * 用法: node tools/smoke.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const PORT = 4321;

/** 从 astro.config.mjs 读取 base，避免测试环境与实际部署不一致 */
const astroConfig = await import(pathToFileURL(resolve(ROOT, 'astro.config.mjs')).href);
const BASE_PATH = astroConfig.default.base ?? '/';
const ORIGIN = `http://127.0.0.1:${PORT}`;

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

const chrome = CHROME_CANDIDATES.find((c) => existsSync(c));
if (!chrome) {
  console.error('未找到 Chrome/Edge');
  process.exit(2);
}

/* ---------- 极简静态文件服务器 ---------- */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join as joinPath } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', ORIGIN);
    let path = decodeURIComponent(url.pathname);

    // 模拟 GitHub Pages：站点挂载在 base 子路径下。
    // 请求未落在 base 前缀内的，一律 404 —— 这正是我们要验证的。
    if (!path.startsWith(BASE_PATH)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 (outside base)');
      return;
    }
    path = path.slice(BASE_PATH.length) || '/';

    let filePath = joinPath(DIST, path);
    try {
      const s = await stat(filePath);
      if (s.isDirectory()) filePath = joinPath(filePath, 'index.html');
    } catch {
      filePath = joinPath(DIST, path.replace(/\/$/, ''), 'index.html');
    }
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404');
  }
});

await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

/* ---------- 启动 headless Chrome 并通过 CDP 采集控制台 ---------- */
const userDataDir = mkdtempSync(join(tmpdir(), 'smoke-profile-'));
const child = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=9222',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function waitForCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json/version');
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch {
      /* 等待 Chrome 启动 */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Chrome 调试端口未就绪');
}

const wsUrl = await waitForCdp();

// 极简 WebSocket 客户端（避免引入 ws 依赖）
const { WebSocket } = await import('node:worker_threads').then(async () => {
  // Node 22+ 内置 WebSocket
  return { WebSocket: globalThis.WebSocket };
});

if (!WebSocket) {
  console.error('当前 Node 不支持内置 WebSocket');
  process.exit(2);
}

const ws = new WebSocket(wsUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let msgId = 0;
const pending = new Map();
const listeners = [];

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  } else {
    for (const fn of listeners) fn(msg);
  }
});

function send(method, params = {}, sessionId) {
  const id = ++msgId;
  const payload = { id, method, params };
  if (sessionId) payload.sessionId = sessionId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify(payload));
  });
}

/* ---------- 收集所有路由 ---------- */
function collectRoutes(dir = DIST, base = '') {
  const routes = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = joinPath(base, entry.name);
    if (entry.isDirectory()) {
      routes.push(...collectRoutes(joinPath(dir, entry.name), rel));
    } else if (entry.name === 'index.html') {
      routes.push(`/${rel.replace(/[\\/]index\.html$/, '')}`.replace(/\\/g, '/'));
    }
  }
  return routes;
}

/** 路由路径 + base 前缀，用于实际访问 */
const withBase = (route) => {
  const joined = `${BASE_PATH.replace(/\/$/, '')}${route}`.replace(/\/{2,}/g, '/');
  return joined === '' ? '/' : joined;
};

const routes = collectRoutes().sort();
console.log(`[smoke] 部署基路径: ${BASE_PATH}`);
console.log(`[smoke] 发现 ${routes.length} 条路由`);

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Log.enable', {}, sessionId);
await send('Network.enable', {}, sessionId);

let issues = [];
let currentRoute = '';

listeners.push((msg) => {
  if (msg.sessionId !== sessionId) return;

  if (msg.method === 'Runtime.consoleAPICalled') {
    const type = msg.params.type;
    if (type === 'error' || type === 'warning') {
      const text = (msg.params.args ?? [])
        .map((a) => a.value ?? a.description ?? a.unserializableValue ?? '')
        .join(' ');
      issues.push({ route: currentRoute, kind: `console.${type}`, text });
    }
  }

  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    issues.push({
      route: currentRoute,
      kind: 'exception',
      text: d.exception?.description ?? d.text ?? '未知异常',
    });
  }

  if (msg.method === 'Log.entryAdded') {
    const e = msg.params.entry;
    if (e.level === 'error') {
      issues.push({ route: currentRoute, kind: `log.${e.source}`, text: e.text });
    }
  }

  if (msg.method === 'Network.loadingFailed') {
    const p = msg.params;
    // 忽略被主动取消的请求
    if (p.type !== 'Image' && p.errorText !== 'net::ERR_ABORTED') {
      issues.push({ route: currentRoute, kind: 'network', text: `${p.type} ${p.errorText}` });
    }
  }
});

async function visit(route) {
  currentRoute = route;
  await send('Page.navigate', { url: `${ORIGIN}${withBase(route)}` }, sessionId);
  // 等待页面加载与字体就绪
  await new Promise((r) => setTimeout(r, 900));
  await send(
    'Runtime.evaluate',
    { expression: 'document.fonts.ready', awaitPromise: true },
    sessionId,
  );
  await new Promise((r) => setTimeout(r, 250));
}

for (const route of routes) {
  const before = issues.length;
  await visit(route);
  const added = issues.length - before;
  console.log(`[smoke] ${route.padEnd(16)} ${added === 0 ? 'OK' : `${added} 个问题`}`);
}

/* ---------- 布局检查：横向溢出 ---------- */
console.log('\n[smoke] 横向溢出检查');
const VIEWPORTS = [
  { name: '桌面 1440', width: 1440, height: 900 },
  { name: '笔记本 1280', width: 1280, height: 800 },
  { name: '平板 900', width: 900, height: 1000 },
  { name: '手机 390', width: 390, height: 844 },
];

for (const vp of VIEWPORTS) {
  await send(
    'Emulation.setDeviceMetricsOverride',
    {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 1,
      mobile: vp.width < 768,
    },
    sessionId,
  );

  const overflowRoutes = [];
  for (const route of routes) {
    currentRoute = route;
    await send('Page.navigate', { url: `${ORIGIN}${withBase(route)}` }, sessionId);
    await new Promise((r) => setTimeout(r, 500));

    const { result } = await send(
      'Runtime.evaluate',
      {
        expression: `(() => {
        const de = document.documentElement;
        const over = de.scrollWidth - de.clientWidth;
        const bad = [];
        if (over > 1) {
          for (const el of document.querySelectorAll('*')) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && (r.right > de.clientWidth + 1 || r.left < -1)) {
              bad.push(el.tagName + '.' + (el.className?.toString?.().slice(0,40) || ''));
              if (bad.length > 3) break;
            }
          }
        }
        return { over, bad };
      })()`,
        returnByValue: true,
      },
      sessionId,
    );

    if (result.value.over > 1) {
      overflowRoutes.push(`${route} (+${result.value.over}px) ${result.value.bad.join(', ')}`);
    }
  }

  if (overflowRoutes.length === 0) {
    console.log(`[smoke] ${vp.name.padEnd(12)} 无横向溢出 ✓`);
  } else {
    console.log(`[smoke] ${vp.name.padEnd(12)} 发现溢出:`);
    overflowRoutes.forEach((r) => console.log(`         ${r}`));
  }
}

/* ---------- 汇总 ---------- */
console.log('\n[smoke] 问题汇总');
if (issues.length === 0) {
  console.log('[smoke] 无控制台报错 / 页面异常 / 资源加载失败 ✓');
} else {
  const grouped = new Map();
  for (const i of issues) {
    const key = `${i.kind}: ${i.text.slice(0, 160)}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(i.route);
  }
  for (const [key, list] of grouped) {
    console.log(`  ✗ ${key}`);
    console.log(`    出现于: ${[...new Set(list)].join(', ')}`);
  }
}

/* ---------- 清理 ---------- */
ws.close();
child.kill();
server.close();
try {
  rmSync(userDataDir, { recursive: true, force: true });
} catch {
  /* 忽略清理失败 */
}

process.exit(issues.length > 0 ? 1 : 0);
