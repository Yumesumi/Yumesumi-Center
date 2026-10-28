/**
 * 3D 场景深度诊断：直接检查 DOM 与运行时状态。
 *
 * 用法: node tools/diagnose-3d.mjs
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
const PORT = 4323;

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

const userDataDir = mkdtempSync(join(tmpdir(), 'diag-'));
const child = spawn(
  CHROME,
  [
    '--headless=new',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--hide-scrollbars',
    '--no-first-run',
    '--remote-debugging-port=9224',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function waitForCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9224/json/version');
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
    logs.push({
      type: m.params.type,
      text: (m.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' '),
    });
  } else if (m.method === 'Runtime.exceptionThrown') {
    logs.push({
      type: 'exception',
      text: m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text,
    });
  } else if (m.method === 'Log.entryAdded') {
    logs.push({ type: `log.${m.params.entry.level}`, text: m.params.entry.text });
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
await send('Log.enable', {}, sessionId);

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
    const islands = document.querySelectorAll('astro-island');
    const sceneRoot = document.querySelector('.scene-root');
    const canvas = document.querySelector('.scene-root canvas');
    const heroScene = document.querySelector('.hero__scene');

    const glTest = (() => {
      try {
        const c = document.createElement('canvas');
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        if (!gl) return { ok: false, reason: 'no context' };
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        return { ok: true, renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
      } catch (e) { return { ok: false, reason: String(e) }; }
    })();

    return {
      islandCount: islands.length,
      islandDefined: !!customElements.get('astro-island'),
      astroOnlyDefined: typeof (self.Astro && self.Astro.only),
      islandOuterStart: islands[0] ? islands[0].outerHTML.slice(0, 200) : null,
      islandHasSSRAttrib: islands[0] ? islands[0].hasAttribute('ssr') : null,
      heroSceneExists: !!heroScene,
      sceneRootExists: !!sceneRoot,
      canvasExists: !!canvas,
      glTest,
      documentScripts: Array.from(document.querySelectorAll('script')).map(s => ({
        src: s.src || '(inline)',
        type: s.type || 'classic',
        len: s.textContent.length,
      })),
    };
  })()`,
    returnByValue: true,
  },
  sessionId,
);

console.log('[diag] 详细诊断:');
console.log(JSON.stringify(probe.result.value, null, 2));

console.log('\n[diag] 控制台/日志:');
if (logs.length === 0) console.log('  (无)');
logs.slice(0, 20).forEach((m) => console.log(`  [${m.type}] ${m.text.slice(0, 400)}`));

ws.close();
child.kill();
server.close();
process.exit(0);
