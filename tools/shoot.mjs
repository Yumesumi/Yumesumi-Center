/**
 * 截图工具：在多个视口下对指定路由截图，用于人工核对视觉表现。
 *
 * 用法: node tools/shoot.mjs [outputDir]
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const OUT = resolve(ROOT, process.argv[2] ?? '.shots');
const PORT = 4322;

/** 从 astro.config 读取 base，模拟真实的子路径部署环境 */
const astroConfig = await import(pathToFileURL(resolve(ROOT, 'astro.config.mjs')).href);
const BASE_PATH = astroConfig.default.base ?? '/';
const ORIGIN = `http://127.0.0.1:${PORT}`;

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const chrome = CHROME_CANDIDATES.find((c) => existsSync(c));
if (!chrome) {
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
    const path = decodeURIComponent(new URL(req.url, ORIGIN).pathname);
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

const userDataDir = mkdtempSync(join(tmpdir(), 'shoot-'));
const child = spawn(
  chrome,
  [
    '--headless=new',
    // headless 下用 SwiftShader 软件渲染 WebGL，
    // 否则 --disable-gpu 会让 3D 场景完全无法截图验证。
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--hide-scrollbars',
    '--no-first-run',
    '--remote-debugging-port=9223',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function waitForCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9223/json/version');
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
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
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

mkdirSync(OUT, { recursive: true });

const SHOTS = [
  { route: '/', name: 'home-desktop', width: 1440, height: 900, full: false },
  { route: '/', name: 'home-full', width: 1440, height: 900, full: true },
  { route: '/', name: 'home-mobile', width: 390, height: 844, full: false },
  { route: '/projects/', name: 'projects-desktop', width: 1440, height: 900, full: false },
  { route: '/about/', name: 'about-desktop', width: 1440, height: 900, full: false },
  { route: '/ysi/', name: 'ysi-desktop', width: 1440, height: 900, full: false },
];

for (const shot of SHOTS) {
  await send(
    'Emulation.setDeviceMetricsOverride',
    {
      width: shot.width,
      height: shot.height,
      deviceScaleFactor: 1,
      mobile: shot.width < 768,
    },
    sessionId,
  );

  await send(
    'Page.navigate',
    { url: `${ORIGIN}${BASE_PATH.replace(/\/$/, '')}${shot.route}` },
    sessionId,
  );
  await new Promise((r) => setTimeout(r, 1200));
  await send(
    'Runtime.evaluate',
    { expression: 'document.fonts.ready', awaitPromise: true },
    sessionId,
  );
  await new Promise((r) => setTimeout(r, 400));

  const { data } = await send(
    'Page.captureScreenshot',
    {
      format: 'png',
      captureBeyondViewport: shot.full,
      ...(shot.full ? { clip: { x: 0, y: 0, width: shot.width, height: 2400, scale: 1 } } : {}),
    },
    sessionId,
  );

  const file = join(OUT, `${shot.name}.png`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  console.log(`[shoot] ${file}`);
}

ws.close();
child.kill();
server.close();
process.exit(0);
