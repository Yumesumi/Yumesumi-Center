/**
 * Yumesumi Center · 3D 场景
 *
 * 以 Logo 的几何语言为母题构建的三维主体：
 *   · 圆角菱形外框 → 半透明棱镜骨架
 *   · 四芒星       → 发光核心晶体（外层光环 + 内层实体）
 *   · 装饰弧线     → 环绕轨道
 *   · 底部叶形     → 承载基座
 *
 * 设计约束（对应 Brief 第 4.2 / 4.3 节）：
 *   · 几何结构服务于品牌识别，不做无意义的持续旋转；
 *   · 相机运动缓慢克制，鼠标视差幅度轻微；
 *   · 动画有明确的起始、发展与结束状态，而非无限循环；
 *   · 低性能设备自动降级；WebGL 不可用时不渲染任何东西。
 */

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  buildOrbitGeometries,
  buildPedestalGeometries,
  buildPrismGeometry,
  buildStarGeometries,
} from './logoGeometry';

/* ------------------------------------------------------------------ *
 * 设备能力探测
 * ------------------------------------------------------------------ */

interface Capabilities {
  webgl: boolean;
  /** 低端设备：降低几何精度、关闭后处理、降低像素比 */
  lowPower: boolean;
  reducedMotion: boolean;
}

function detectCapabilities(): Capabilities {
  if (typeof window === 'undefined') {
    return { webgl: false, lowPower: false, reducedMotion: false };
  }

  let webgl = false;
  try {
    const canvas = document.createElement('canvas');
    webgl = Boolean(
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl'),
    );
  } catch {
    webgl = false;
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 低端设备启发式判断：内存小、核心数少、或明确声明为移动设备
  const nav = navigator as Navigator & { deviceMemory?: number };
  const lowPower =
    (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) ||
    (navigator.hardwareConcurrency !== undefined && navigator.hardwareConcurrency <= 4);

  return { webgl, lowPower, reducedMotion };
}

/* ------------------------------------------------------------------ *
 * 鼠标视差
 * ------------------------------------------------------------------ */

/**
 * 鼠标视差状态。
 *
 * React 19 的 useRef 返回 RefObject<T>，其 current 可直接读写。
 * 这里返回的是数值本身而非 ref 对象，避免调用处出现 ref.current.current 的嵌套。
 */
interface PointerState {
  /** 指针目标位置（-1 ~ 1），由 pointermove 更新 */
  target: { x: number; y: number };
  /** 当前插值位置，由每帧渲染循环逼近 target */
  value: { x: number; y: number };
}

function usePointerParallax(enabled: boolean): PointerState {
  const target = useRef({ x: 0, y: 0 });
  const value = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!enabled) return;

    const onPointerMove = (event: PointerEvent) => {
      const nx = (event.clientX / window.innerWidth) * 2 - 1;
      const ny = (event.clientY / window.innerHeight) * 2 - 1;
      target.current.x = nx;
      target.current.y = ny;
    };

    const onPointerLeave = () => {
      target.current.x = 0;
      target.current.y = 0;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [enabled]);

  return { target: target.current, value: value.current };
}

/* ------------------------------------------------------------------ *
 * 滚动进度
 * ------------------------------------------------------------------ */

/**
 * 读取首屏滚动进度（0 → 1）。
 * 只在 Hero 仍在视口内时有值，超出后钳制在 1。
 */
function useHeroScrollProgress(enabled: boolean) {
  const progress = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const update = () => {
      const hero = document.querySelector<HTMLElement>('[data-hero]');
      if (!hero) return;
      const rect = hero.getBoundingClientRect();
      const scrollable = Math.max(hero.offsetHeight - window.innerHeight, 1);
      const scrolled = Math.min(Math.max(-rect.top, 0), scrollable);
      progress.current = scrolled / scrollable;
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [enabled]);

  return progress;
}

/* ------------------------------------------------------------------ *
 * 主体
 * ------------------------------------------------------------------ */

interface SubjectProps {
  lowPower: boolean;
  reducedMotion: boolean;
}

function PrismSubject({ lowPower, reducedMotion }: SubjectProps) {
  const group = useRef<THREE.Group>(null);

  const prism = useMemo(() => buildPrismGeometry(), []);
  const star = useMemo(() => buildStarGeometries(), []);
  const orbits = useMemo(() => buildOrbitGeometries(), []);
  const pedestals = useMemo(() => buildPedestalGeometries(), []);

  // 释放 GPU 资源
  useEffect(() => {
    return () => {
      prism.dispose();
      star.halo.dispose();
      star.core.dispose();
      orbits.forEach((g) => g.dispose());
      pedestals.forEach((g) => g.dispose());
    };
  }, [prism, star, orbits, pedestals]);

  const pointer = usePointerParallax(!reducedMotion);
  const scrollProgress = useHeroScrollProgress(!reducedMotion);

  useFrame((state, delta) => {
    if (!group.current) return;

    const t = state.clock.elapsedTime;

    // 鼠标视差：缓慢逼近目标值，避免生硬跟随
    const ease = 1 - Math.pow(0.001, delta);
    pointer.value.x += (pointer.target.x - pointer.value.x) * ease;
    pointer.value.y += (pointer.target.y - pointer.value.y) * ease;

    const p = scrollProgress.current;

    // 相机运动：随滚动推进并轻微上抬，配合主体旋转
    group.current.rotation.y = pointer.value.x * 0.16 + p * 0.42;
    group.current.rotation.x = -pointer.value.y * 0.1 + p * 0.14;

    /*
     * 构图：主体上移，让它完整落在字标上方——
     * 字标是前景焦点，3D 主体是背景层，两者不应在同一位置互相遮挡。
     */
    group.current.position.y = 1.28 + p * 0.34;
    group.current.position.z = -0.1 + p * 0.28;

    // 略微缩小，保持"背景层"的体量感
    group.current.scale.setScalar(0.56);

    // 核心晶体的呼吸：幅度极小，是"材质在动"而非"物体在转"
    if (!reducedMotion) {
      const breathe = 1 + Math.sin(t * 0.7) * 0.018;
      group.current.children[1]?.scale.setScalar(breathe);
    }
  });

  return (
    <group ref={group}>
      {/* 棱镜骨架 —— 品牌外框的三维化 */}
      <mesh geometry={prism}>
        <meshPhysicalMaterial
          color="#b9a8f0"
          transparent
          opacity={0.16}
          roughness={0.08}
          metalness={0}
          transmission={lowPower ? 0 : 0.72}
          thickness={0.4}
          ior={1.45}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* 四芒星光环 */}
      <mesh geometry={star.halo}>
        <meshBasicMaterial color="#cfc4f5" transparent opacity={0.42} side={THREE.DoubleSide} />
      </mesh>

      {/* 四芒星核心晶体 */}
      <mesh geometry={star.core}>
        <meshPhysicalMaterial
          color="#f7f5ff"
          emissive="#b9a8f0"
          emissiveIntensity={0.95}
          roughness={0.18}
          metalness={0.1}
          transparent
          opacity={0.95}
        />
      </mesh>

      {/*
        装饰弧线 → 品牌标记的一部分。
        Logo 里这三条弧线与菱形框、四芒星构成同一个完整图形，
        因此在三维中必须保持共面、贴合框架，而不是拆散成独立轨道——
        拆开后会变成穿插的乱线，既不像 Logo 也不像有意设计的轨道。
        做法：与框架共面（z 偏移极小），按原 Logo 位置摆放。
      */}
      {orbits.map((geometry, index) => (
        <mesh key={index} geometry={geometry} position={[0, 0, 0.02 + index * 0.012]} scale={0.99}>
          <meshBasicMaterial
            color="#b9a8f0"
            transparent
            opacity={0.4}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/*
        底部叶形 → Logo 的两片叶形。
        几何体已包含正确的世界坐标（由 canvas 坐标直接换算而来），
        因此不能再做额外位移，否则会与 Logo 的原始构型脱节。
      */}
      {pedestals.map((geometry, index) => (
        <mesh key={index} geometry={geometry} position={[0, 0, 0.015 + index * 0.01]}>
          <meshStandardMaterial
            color="#8f76d4"
            transparent
            opacity={0.42}
            roughness={0.36}
            metalness={0.18}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ *
 * 环境：灯光与雾效
 * ------------------------------------------------------------------ */

function Atmosphere({ lowPower }: { lowPower: boolean }) {
  return (
    <>
      <fog attach="fog" args={['#080811', 5.5, 13]} />

      <ambientLight intensity={0.34} color="#6d4fc4" />
      <hemisphereLight args={['#9d84e8', '#05050c', 0.5]} />

      {/* 主光：从右上前方切入，塑造棱镜的体积感 */}
      <directionalLight position={[3.2, 4.4, 3.6]} intensity={1.5} color="#cfc4f5" />

      {/* 边缘光：勾勒轮廓，与深色背景拉开层次 */}
      <directionalLight position={[-3.6, -1.4, -2.8]} intensity={0.72} color="#6d4fc4" />

      {/* 核心点光：让四芒星从内部发亮 */}
      <pointLight
        position={[0, 0, 0.9]}
        intensity={lowPower ? 1.4 : 2.6}
        distance={5.2}
        color="#b9a8f0"
      />

      {/* 底部反射光：避免主体下半部完全沉入黑暗 */}
      <pointLight position={[0, -2.2, 1.4]} intensity={0.5} distance={6} color="#4a3080" />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * 相机
 * ------------------------------------------------------------------ */

function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 0, 5.4);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  useFrame(() => {
    if (reducedMotion) return;
    // 极轻微的呼吸式推拉，制造"悬浮"而非"固定"的感觉
    const t = performance.now() * 0.00016;
    camera.position.z = 5.4 + Math.sin(t) * 0.1;
  });

  return null;
}

/* ------------------------------------------------------------------ *
 * 场景根组件
 * ------------------------------------------------------------------ */

export default function LogoScene() {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const caps = detectCapabilities();
    setCapabilities(caps);

    // 等一帧再挂载，避免客户端注水时出现闪烁
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // WebGL 不可用时完全不渲染，静态内容由 CSS 承担
  if (!capabilities?.webgl || !ready) return null;

  const lowPower = capabilities.lowPower;
  const dpr: [number, number] = lowPower ? [1, 1.25] : [1, 1.75];

  return (
    <Canvas
      dpr={dpr}
      gl={{
        antialias: !lowPower,
        alpha: true,
        powerPreference: lowPower ? 'low-power' : 'high-performance',
      }}
      camera={{ position: [0, 0, 4.6], fov: 42, near: 0.1, far: 40 }}
      style={{ width: '100%', height: '100%' }}
    >
      <CameraRig reducedMotion={capabilities.reducedMotion} />
      <Atmosphere lowPower={lowPower} />
      <PrismSubject lowPower={lowPower} reducedMotion={capabilities.reducedMotion} />
    </Canvas>
  );
}
