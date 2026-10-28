/**
 * 无 JavaScript 验证：确认页面在禁用 JS 的环境下依然完整可用。
 *
 * 本站是完全静态的（无 React、无 WebGL、无客户端路由），
 * 因此核心内容必须在没有 JavaScript 时也能完整呈现——
 * 这既是无障碍要求，也是性能与可靠性的底线。
 *
 * 检查项：
 *   · 字标、正文、导航、项目列表都存在于静态 HTML 中
 *   · 品牌标记（背景大 Logo）真实渲染且尺寸合理
 *   · 样式表与字体正常加载
 *   · 无控制台报错
 *
 * 用法: node tools/verify-nojs.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const PORT = 4327;

const astroConfig = await import(pathToFileURL(resolve(ROOT, 'astro.config.mjs')).href);
const BASE_PATH = astroConfig.default.base ?? '/';
const ORIGIN = `http://127.0.0.1:${PORT}`;

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((c) => existsSync(c));

if (!CHROME) {
  console.error('未找到 Chrome/Edge');
  process.exit(2);
}

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
    const path = decodeURIComponent(new URL(req.url ?? '/', ORIGIN).pathname);
    if (!path.startsWith(BASE_PATH)) {
      res.writeHead(404);
      res.end('404 (outside base)');
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

const userDataDir = mkdtempSync(join(tmpdir(), 'nojs-'));
const child = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--remote-debugging-port=9260',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function waitForCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9260/json/version');
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch {
      /* 等待启动 */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Chrome 调试端口未就绪');
}

const ws = new WebSocket(await waitForCdp());
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let msgId = 0;
const pending = new Map();
let logs = [];

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    logs.push((msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' '));
  } else if (msg.method === 'Runtime.exceptionThrown') {
    logs.push(msg.params.exceptionDetails.exception?.description ?? '');
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

// 关键：禁用 JavaScript 后再加载页面
await send('Emulation.setScriptExecutionDisabled', { value: true }, sessionId);
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

const checks = [];
const routes = ['/', '/projects/', '/about/'];

console.log('[nojs] 禁用 JavaScript 环境下的验证\n');

for (const route of routes) {
  logs = [];
  await send(
    'Page.navigate',
    { url: `${ORIGIN}${BASE_PATH}${route.replace(/^\//, '')}` },
    sessionId,
  );
  await new Promise((r) => setTimeout(r, 1500));

  const probe = await send(
    'Runtime.evaluate',
    {
      expression: `(() => {
      // 首页有背景大 Logo，子页面只有导航小标 —— 两者都要检查
      const heroMark = document.querySelector('.hero__mark img');
      const navMark = document.querySelector('.site-nav__mark');
      const markRect = heroMark ? heroMark.getBoundingClientRect() : null;
      const navRect = navMark ? navMark.getBoundingClientRect() : null;
      return {
        title: document.title,
        heading: document.querySelector('h1')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
        bodyLength: (document.body.innerText || '').length,
        navLinks: document.querySelectorAll('.site-nav__link').length,
        heroMark: !!heroMark,
        markSize: markRect ? [Math.round(markRect.width), Math.round(markRect.height)] : null,
        navMark: !!navMark,
        navMarkSize: navRect ? [Math.round(navRect.width), Math.round(navRect.height)] : null,
        background: getComputedStyle(document.body).backgroundColor,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    })()`,
      returnByValue: true,
    },
    sessionId,
  );

  const v = probe.result?.value;
  if (!v) {
    checks.push([`${route} 页面可读`, false]);
    continue;
  }

  console.log(`[nojs] ${route}`);
  console.log(`   标题: ${v.title}`);
  console.log(`   首屏标题: ${v.heading}`);
  console.log(`   导航链接: ${v.navLinks}   正文长度: ${v.bodyLength}`);
  console.log(`   导航 Logo: ${v.navMark ? '存在' : '缺失'}  尺寸: ${v.navMarkSize ?? '-'}`);
  console.log(
    `   背景大 Logo: ${v.heroMark ? '存在' : '无(仅首页)'}${v.markSize ? '  尺寸: ' + v.markSize : ''}`,
  );

  checks.push([`${route} 有标题文本`, Boolean(v.heading)]);
  checks.push([`${route} 正文非空`, v.bodyLength > 50]);
  checks.push([`${route} 导航完整`, v.navLinks >= 5]);
  // 导航 Logo 全站必须存在且有实际尺寸
  checks.push([`${route} 导航 Logo 已渲染`, v.navMark && (v.navMarkSize?.[0] ?? 0) > 10]);
  // 背景大 Logo 只在首页要求，且必须足够大
  if (route === '/') {
    checks.push([`${route} 背景大 Logo 已渲染`, v.heroMark && (v.markSize?.[0] ?? 0) > 100]);
  }
  checks.push([`${route} 样式已生效`, v.background !== 'rgba(0, 0, 0, 0)']);
  checks.push([`${route} 无横向溢出`, v.overflow <= 1]);
  checks.push([`${route} 无控制台错误`, logs.length === 0]);
}

console.log('\n[nojs] 验收:');
let pass = true;
for (const [label, ok] of checks) {
  console.log(`  ${ok ? '✓' : '✗'} ${label}`);
  if (!ok) pass = false;
}

ws.close();
child.kill();
server.close();
try {
  rmSync(userDataDir, { recursive: true, force: true });
} catch {
  /* 忽略清理失败 */
}

console.log(
  pass ? '\n[nojs] PASS — 禁用 JavaScript 时页面依然完整可用' : '\n[nojs] FAIL — 存在不可用项',
);
process.exit(pass ? 0 : 1);
