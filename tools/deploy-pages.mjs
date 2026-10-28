#!/usr/bin/env node
/**
 * 部署到 GitHub Pages（分支发布模式，不使用 Actions）。
 *
 * 流程：
 *   1. 构建产物到 dist/
 *   2. 把 dist/ 的内容提交到独立的 gh-pages 分支
 *   3. 推送该分支到远端，Pages 随即重新发布
 *
 * 相比 Actions 的好处：
 *   · 不占用 CI 配额，无需等待排队（Actions 偶尔会长时间 queued）
 *   · 发布时机完全可控
 *   · 仓库里不需要额外的 workflow 文件
 *
 * 前置配置（一次性）：
 *   gh api -X PUT repos/<owner>/<repo>/pages \
 *     -f 'build_type=legacy' \
 *     -f 'source[branch]=gh-pages' \
 *     -f 'source[path]=/'
 *
 * 用法：npm run deploy
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const BRANCH = 'gh-pages';
const REMOTE = 'origin';

const run = (cmd, args, options = {}) => {
  return execFileSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: options.quiet ? 'pipe' : 'inherit',
    ...options,
  });
};

const git = (args, options) => run('git', args, options);

/* ---------- 1. 构建 ---------- */
console.log('[deploy] 1/4 构建站点…');
// Windows 上 npm 是 .cmd，shell:true 才能正确调用
run('npm', ['run', 'build'], { shell: process.platform === 'win32' });

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('[deploy] 构建产物缺少 dist/index.html，中止');
  process.exit(1);
}

/* ---------- 2. 准备发布目录 ---------- */
console.log('[deploy] 2/4 准备发布目录…');

const STAGE = resolve(ROOT, '.deploy-pages');
rmSync(STAGE, { recursive: true, force: true });

// 把 dist 的内容复制到暂存目录（不是 dist 本身，否则 URL 会多一层目录）
cpSync(DIST, STAGE, { recursive: true });

// .nojekyll：告诉 GitHub Pages 不要用 Jekyll 处理，直接原样发布静态文件。
// 缺少它时 Jekyll 会尝试解析 CSS/JS 等文件并可能报错。
writeFileSync(join(STAGE, '.nojekyll'), '', 'utf8');

/* ---------- 3. 提交到 gh-pages 分支 ---------- */
console.log('[deploy] 3/4 提交到 gh-pages 分支…');

// 用独立的 index 暂存发布内容，避免污染主分支的暂存区
const GIT_INDEX = join(ROOT, '.git', 'deploy-index');
rmSync(GIT_INDEX, { force: true });

const gitEnv = {
  ...process.env,
  GIT_INDEX_FILE: GIT_INDEX,
  GIT_WORK_TREE: STAGE,
};

run('git', ['read-tree', '--empty'], { env: gitEnv, quiet: true });
run('git', ['add', '--all', '.'], { env: gitEnv, quiet: true });

const tree = run('git', ['write-tree'], { env: gitEnv, quiet: true }).trim();

/**
 * 取远端 gh-pages 分支的当前提交作为父提交。
 * 首次部署时分支尚不存在，需要优雅降级而不是抛错。
 */
let parent = '';
try {
  parent = git(['rev-parse', '--verify', '--quiet', `refs/heads/${BRANCH}`], {
    quiet: true,
  }).trim();
} catch {
  parent = '';
}

// 远端分支存在但本地没有时，以远端提交作为父提交（保持历史连续）
if (!parent) {
  try {
    parent = git(['rev-parse', '--verify', '--quiet', `refs/remotes/${REMOTE}/${BRANCH}`], {
      quiet: true,
    }).trim();
  } catch {
    parent = '';
  }
}

const commitArgs = ['commit-tree', tree, '-m', `deploy: ${new Date().toISOString()}`];
if (parent) commitArgs.push('-p', parent);

const commit = run('git', commitArgs, { env: gitEnv, quiet: true }).trim();
console.log(`[deploy] 提交 ${commit.slice(0, 7)}（${readdirSync(STAGE).length} 个顶层条目）`);

// 远端已存在该分支时用 force 更新——发布分支只存构建产物，覆盖是预期行为
const hasRemote = git(['ls-remote', '--heads', REMOTE, BRANCH], { quiet: true }).trim();
git(['push', REMOTE, `${commit}:refs/heads/${BRANCH}`, ...(hasRemote ? ['--force'] : [])]);

rmSync(GIT_INDEX, { force: true });
rmSync(STAGE, { recursive: true, force: true });

/* ---------- 4. 完成 ---------- */
console.log('[deploy] 4/4 已推送到远端，GitHub Pages 正在重新发布');
console.log('[deploy] 站点地址：https://yumesumi.github.io/Yumesumi-Center/');
console.log('[deploy] 提示：发布通常在 1-2 分钟内生效，可用 tools/verify-production.mjs 验证');
