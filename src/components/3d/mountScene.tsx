/**
 * 3D 场景的显式挂载入口。
 *
 * 为什么不用 Astro 的 client:* 指令：
 *   Astro 的 island 注水依赖内联脚本同步派发的 `astro:load` / `astro:only` 事件。
 *   这些事件在 HTML 解析早期就会触发，而 <astro-island> 元素可能在事件之后才被解析
 *   （页面较大或网络较慢时尤其明显），此时 island 会永久错过事件、组件永不挂载，
 *   且不产生任何控制台报错——线上表现为 3D 场景静默消失。
 *
 *   显式挂载不依赖任何事件时序：由模块脚本主动 import 并挂载，行为完全确定，
 *   且便于在页面切换时精确卸载（Brief 第 3.1 节要求 3D 场景可独立卸载）。
 *
 * 加载顺序也做了优化：先做 WebGL 预检，不可用时根本不下载 three.js 与 react-dom。
 */
import { StrictMode } from 'react';
import type { Root } from 'react-dom/client';

let root: Root | null = null;
let container: HTMLElement | null = null;

/** WebGL 可用性预检。必须在下载 three.js 之前执行。 */
function hasWebGL(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl'),
    );
  } catch {
    return false;
  }
}

/**
 * 挂载 3D 场景。
 *
 * @param target 承载场景的容器元素
 * @returns 是否成功挂载（WebGL 不可用时返回 false，调用方无需处理）
 */
export async function mountScene(target: HTMLElement): Promise<boolean> {
  // 已在挂载中或已挂载时不重复初始化，避免重复创建 WebGL 上下文
  if (root) return true;

  if (!hasWebGL()) {
    // WebGL 不可用：不加载任何 3D 依赖，由 CSS 占位几何体承担视觉
    target.dataset.sceneFallback = 'true';
    return false;
  }

  // 动态导入：只有真正需要时才下载 react-dom 与 three.js
  const [{ createRoot: create }, { default: LogoScene }] = await Promise.all([
    import('react-dom/client'),
    import('./LogoScene'),
  ]);

  container = target;
  root = create(target);
  root.render(
    <StrictMode>
      <LogoScene />
    </StrictMode>,
  );
  target.dataset.sceneMounted = 'true';
  return true;
}

/** 卸载场景，释放 WebGL 上下文与 GPU 资源。 */
export function unmountScene(): void {
  if (root) {
    root.unmount();
    root = null;
  }
  if (container) {
    delete container.dataset.sceneMounted;
    container = null;
  }
}
