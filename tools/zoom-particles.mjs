/**
 * 粒子形状放大检查：把粒子层放大渲染，确认四芒星形状正确呈现。
 *
 * 用法: node tools/zoom-particles.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const PORT = 4329;

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
    const path = decodeURIComponent(new URL(req.url ?? '/', ORIGIN).pathname);
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

const userDataDir = mkdtempSync(join(tmpdir(), 'zoom-'));
const child = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--remote-debugging-port=9271',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function waitForCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9271/json/version');
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch {
      /* 等待启动 */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Chrome 未就绪');
}

const ws = new WebSocket(await waitForCdp());
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
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
await send(
  'Emulation.setDeviceMetricsOverride',
  {
    width: 900,
    height: 500,
    deviceScaleFactor: 3,
    mobile: false,
  },
  sessionId,
);

await send('Page.navigate', { url: `${ORIGIN}${BASE_PATH}` }, sessionId);
await new Promise((r) => setTimeout(r, 4000));

// 把粒子层整体放大，便于检查形状
await send(
  'Runtime.evaluate',
  {
    expression: `(() => {
    const field = document.querySelector('.starfield');
    field.style.transformOrigin = 'top right';
    field.style.transform = 'scale(4)';
    field.style.translate = '-40% 0';
    // 固定所有粒子到最亮，便于看清形状
    document.querySelectorAll('.starfield__dot').forEach(d => {
      d.style.animationPlayState = 'paused';
      d.style.opacity = '0.95';
    });
    return true;
  })()`,
  },
  sessionId,
);

await new Promise((r) => setTimeout(r, 600));

const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
writeFileSync(resolve(ROOT, 'tools/.star-zoom.png'), Buffer.from(data, 'base64'));
console.log('saved -> tools/.star-zoom.png');

ws.close();
child.kill();
server.close();
process.exit(0);
