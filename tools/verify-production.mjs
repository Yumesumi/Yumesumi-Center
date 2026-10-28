/**
 * 线上站点验证：直接对生产环境逐路由做端到端检查。
 *
 * 与 tools/smoke.mjs 的区别：
 *   · smoke.mjs 测的是本地构建产物（挂在 base 子路径下模拟 Pages）
 *   · 本脚本测的是真实的 https://yumesumi.github.io/Yumesumi-Center/
 *     能发现 CDN 缓存、404、字体未加载等只在生产环境出现的问题
 *
 * 用法: node tools/verify-production.mjs [siteUrl]
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SITE = process.argv[2] ?? 'https://yumesumi.github.io/Yumesumi-Center';
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Edge/Application/msedge.exe',
].find((c) => existsSync(c));

if (!CHROME) {
  console.error('未找到 Chrome/Edge');
  process.exit(2);
}

const ROUTES = ['/', '/about/', '/projects/', '/blog/', '/ysi/', '/minecraft/', '/mods/', '/labs/', '/studio/'];

const userDataDir = mkdtempSync(join(tmpdir(), 'prod-'));
const child = spawn(
  CHROME,
  [
    '--headless=new',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--hide-scrollbars',
    '--no-first-run',
    '--remote-debugging-port=9226',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function waitForCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9226/json/version');
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
    logs.push(`console: ${(msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ')}`);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    logs.push(`exception: ${msg.params.exceptionDetails.exception?.description ?? ''}`);
  } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    logs.push(`log: ${msg.params.entry.text}`);
  } else if (msg.method === 'Network.loadingFailed') {
    if (msg.params.errorText !== 'net::ERR_ABORTED') {
      logs.push(`network: ${msg.params.type} ${msg.params.errorText}`);
    }
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
await send('Network.enable', {}, sessionId);

await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
}, sessionId);

console.log(`[prod] 线上站点验证: ${SITE}\n`);

let failures = 0;

for (const route of ROUTES) {
  logs = [];
  await send('Page.navigate', { url: `${SITE}${route}` }, sessionId);
  // 等待页面加载与字体就绪
  await new Promise((r) => setTimeout(r, 2500));
  await send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true }, sessionId);
  await new Promise((r) => setTimeout(r, 400));

  const probe = await send('Runtime.evaluate', {
    expression: `(() => ({
      title: document.title,
      hasHeading: !!document.querySelector('h1, .hero__wordmark'),
      bodyLength: (document.body.innerText || '').length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      fontsStatus: document.fonts ? document.fonts.status : 'unknown',
      sceneCanvas: !!document.querySelector('.scene-root canvas'),
      navLinks: document.querySelectorAll('.site-nav__link').length,
      stylesApplied: getComputedStyle(document.body).backgroundColor,
    }))()`,
    returnByValue: true,
  }, sessionId);

  const v = probe.result?.value;
  if (!v) {
    console.log(`  ${route.padEnd(12)} ✗ 页面未返回有效状态`);
    failures++;
    continue;
  }

  const problems = [];
  if (!v.hasHeading) problems.push('缺少标题');
  if (v.bodyLength < 50) problems.push('内容为空');
  if (v.overflow > 1) problems.push(`横向溢出 ${v.overflow}px`);
  if (v.stylesApplied === 'rgba(0, 0, 0, 0)') problems.push('样式未生效');
  if (v.navLinks < 5) problems.push('导航缺失');
  if (logs.length) problems.push(`${logs.length} 个控制台问题`);

  const status = problems.length === 0 ? '✓' : '✗';
  console.log(
    `  ${status} ${route.padEnd(12)} 字体=${v.fontsStatus.padEnd(8)} 导航=${v.navLinks} 溢出=${v.overflow}`,
  );
  if (problems.length) {
    failures++;
    problems.forEach((p) => console.log(`       - ${p}`));
    logs.slice(0, 4).forEach((l) => console.log(`       ! ${l.slice(0, 180)}`));
  }
}

ws.close();
child.kill();
try {
  rmSync(userDataDir, { recursive: true, force: true });
} catch {
  /* 忽略清理失败 */
}

console.log(
  failures === 0
    ? '\n[prod] PASS — 线上站点全部正常'
    : `\n[prod] FAIL — ${failures} 个路由存在问题`,
);
process.exit(failures === 0 ? 0 : 1);
