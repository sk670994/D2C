"use client";

import { useEffect, useRef, useState } from "react";

type SceneMode = "idle" | "observing" | "thinking" | "resolved";

type Signal = {
  id: string;
  label: string;
  eyebrow: string;
  value: string;
  detail: string;
  x: number;
  y: number;
};

type Props = {
  mode: SceneMode;
  activeSignal: string | null;
  signals: Signal[];
  onSignalSelect: (id: string) => void;
};

type Point3 = { x: number; y: number; z: number };

const TAU = Math.PI * 2;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function seed(index: number) {
  const x = Math.sin(index * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export default function ZwirkCinematicScene({
  mode,
  activeSignal,
  signals,
  onSignalSelect,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let start = performance.now();
    let last = start;

    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const burst = { t: 0, strength: 0 };

    const filaments = Array.from({ length: 18 }, (_, index) => ({
      phase: seed(index + 1) * TAU,
      speed: 0.7 + seed(index + 20) * 1.8,
      arm: index % 2 === 0 ? 1 : -1,
      lift: seed(index + 60),
      radius: 160 + seed(index + 80) * 260,
      thickness: 0.7 + seed(index + 90) * 1.6,
      target: index % signals.length,
    }));

    const particles = Array.from({ length: 430 }, (_, index) => ({
      phase: seed(index + 100) * TAU,
      radius: 40 + seed(index + 600) * 620,
      speed: 0.14 + seed(index + 900) * 0.8,
      drift: (seed(index + 1200) - 0.5) * 0.9,
      size: 0.4 + seed(index + 1600) * 1.7,
      alpha: 0.18 + seed(index + 2000) * 0.8,
    }));

    const resize = () => {
      const box = wrap.getBoundingClientRect();
      width = Math.max(1, box.width);
      height = Math.max(1, box.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      pointer.tx = clamp((event.clientX - rect.left) / rect.width - 0.5, -0.5, 0.5);
      pointer.ty = clamp((event.clientY - rect.top) / rect.height - 0.5, -0.5, 0.5);
    };

    const handlePointerLeave = () => {
      pointer.tx = 0;
      pointer.ty = 0;
    };

    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();

    wrap.addEventListener("pointermove", handlePointerMove);
    wrap.addEventListener("pointerleave", handlePointerLeave);

    const render = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const t = (now - start) / 1000;

      pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 4.4);
      pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 4.4);

      const targetBurst = mode === "thinking" ? 1 : mode === "observing" ? 0.5 : mode === "resolved" ? 0.25 : 0.12;
      burst.strength += (targetBurst - burst.strength) * Math.min(1, dt * 5.5);

      ctx.clearRect(0, 0, width, height);

      const bg = ctx.createRadialGradient(
        width * 0.54,
        height * 0.46,
        0,
        width * 0.54,
        height * 0.46,
        Math.max(width, height) * 0.74,
      );
      bg.addColorStop(0, "rgba(19, 31, 39, 0.92)");
      bg.addColorStop(0.34, "rgba(7, 14, 19, 0.96)");
      bg.addColorStop(1, "rgba(2, 4, 6, 1)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      // Soft atmospheric light, deliberately wide so the composition feels like a space,
      // not a card sitting on a page.
      const atmosphere = ctx.createRadialGradient(
        width * 0.54 + pointer.x * 120,
        height * 0.47 + pointer.y * 90,
        10,
        width * 0.54 + pointer.x * 120,
        height * 0.47 + pointer.y * 90,
        470,
      );
      atmosphere.addColorStop(0, `rgba(255, 123, 46, ${0.11 + burst.strength * 0.05})`);
      atmosphere.addColorStop(0.3, "rgba(53, 156, 188, 0.05)");
      atmosphere.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = atmosphere;
      ctx.fillRect(0, 0, width, height);

      const cx = width * 0.54 + pointer.x * 46;
      const cy = height * 0.49 + pointer.y * 32;
      const baseSpeed = mode === "thinking" ? 2.25 : mode === "observing" ? 1.35 : 0.82;

      // Dust / micro-signals.
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        const angle = p.phase + t * p.speed * baseSpeed + p.drift * Math.sin(t * 0.35 + i);
        const depth = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(p.phase + t * 0.4));
        const radius = p.radius * (0.72 + depth * 0.5);
        const x =
          cx +
          Math.cos(angle) * radius +
          Math.sin(t * 0.28 + p.phase) * 30 +
          pointer.x * radius * 0.04;
        const y =
          cy +
          Math.sin(angle * 1.11) * radius * 0.44 +
          Math.cos(t * 0.22 + p.phase) * 20 +
          pointer.y * radius * 0.025;

        const alpha = p.alpha * (0.2 + 0.8 * depth) * (0.4 + burst.strength * 0.9);
        ctx.fillStyle = `rgba(178, 222, 229, ${alpha * 0.42})`;
        ctx.beginPath();
        ctx.arc(x, y, p.size * (0.7 + burst.strength * 0.45), 0, TAU);
        ctx.fill();
      }

      // Fast living filaments.
      for (let i = 0; i < filaments.length; i += 1) {
        const f = filaments[i];
        const target = signals[f.target];
        const tx = width * (target.x / 100);
        const ty = height * (target.y / 100);
        const targetPull =
          activeSignal === target.id ? 0.9 : 0.18 + 0.12 * Math.sin(t * 1.4 + i);

        const angle =
          f.phase +
          t * f.speed * baseSpeed * f.arm +
          Math.sin(t * 0.8 + i) * 0.28;

        const radius =
          f.radius *
          (0.82 + 0.12 * Math.sin(t * 1.5 + f.phase)) *
          (1 + burst.strength * 0.08);

        const driftX =
          Math.cos(angle) * radius * 0.54 +
          Math.sin(t * 2.6 + i) * 50;

        const driftY =
          Math.sin(angle * 1.27) * radius * 0.34 +
          Math.cos(t * 1.9 + i) * 44;

        const endX = cx * (1 - targetPull) + tx * targetPull + driftX * (1 - targetPull);
        const endY = cy * (1 - targetPull) + ty * targetPull + driftY * (1 - targetPull);

        const c1x = cx + Math.cos(angle + 0.9 * f.arm) * radius * 0.24;
        const c1y = cy + Math.sin(angle + 0.9 * f.arm) * radius * 0.14;
        const c2x = cx + Math.cos(angle - 0.65 * f.arm) * radius * 0.64 + pointer.x * 130;
        const c2y = cy + Math.sin(angle - 0.65 * f.arm) * radius * 0.42 + pointer.y * 90;

        const alpha =
          0.18 +
          0.22 * (0.5 + 0.5 * Math.sin(t * 3.4 + i)) +
          (activeSignal === target.id ? 0.2 : 0);

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.bezierCurveTo(c1x, c1y, c2x, c2y, endX, endY);
        ctx.strokeStyle = `rgba(255, 106, 38, ${alpha * 0.28})`;
        ctx.lineWidth = f.thickness * 6;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.bezierCurveTo(c1x, c1y, c2x, c2y, endX, endY);
        ctx.strokeStyle = `rgba(255, 151, 86, ${alpha})`;
        ctx.lineWidth = f.thickness;
        ctx.stroke();

        // Living head / signal pulse moving outward.
        const u = (t * f.speed * baseSpeed * 0.22 + f.phase / TAU) % 1;
        const omt = 1 - u;
        const hx =
          omt * omt * omt * cx +
          3 * omt * omt * u * c1x +
          3 * omt * u * u * c2x +
          u * u * u * endX;
        const hy =
          omt * omt * omt * cy +
          3 * omt * omt * u * c1y +
          3 * omt * u * u * c2y +
          u * u * u * endY;

        ctx.fillStyle = `rgba(255, 205, 146, ${0.3 + 0.45 * burst.strength})`;
        ctx.beginPath();
        ctx.arc(hx, hy, 1.1 + burst.strength * 1.7, 0, TAU);
        ctx.fill();
      }

      // Orbit rings.
      for (let ring = 0; ring < 5; ring += 1) {
        const rr = 74 + ring * 34;
        const wobble = Math.sin(t * 0.4 + ring) * 0.018;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(t * (0.05 + ring * 0.02) * (ring % 2 ? -1 : 1));
        ctx.scale(1, 0.43 + wobble);
        ctx.beginPath();
        ctx.arc(0, 0, rr + burst.strength * ring * 4, 0, TAU);
        ctx.strokeStyle = `rgba(120, 191, 208, ${0.045 + ring * 0.012})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }

      // Central energy well.
      const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, 130);
      glow.addColorStop(0, `rgba(255, 184, 111, ${0.32 + burst.strength * 0.08})`);
      glow.addColorStop(0.24, "rgba(255, 105, 38, 0.12)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, 140, 0, TAU);
      ctx.fill();

      const coreSize = 46 + Math.sin(t * 2.9) * 2 + burst.strength * 5;
      const core = ctx.createRadialGradient(cx - 8, cy - 10, 2, cx, cy, coreSize);
      core.addColorStop(0, "rgba(255, 247, 232, 1)");
      core.addColorStop(0.12, "rgba(255, 190, 121, 0.95)");
      core.addColorStop(0.34, "rgba(255, 103, 32, 0.88)");
      core.addColorStop(0.7, "rgba(79, 44, 31, 0.48)");
      core.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, coreSize * 1.7, 0, TAU);
      ctx.fill();

      // Glassy crystalline Z core.
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(t * 0.5) * 0.12);
      const r = 32 + burst.strength * 3;
      const poly: Point3[] = [
        { x: 0, y: -r * 1.15, z: 1 },
        { x: r * 0.92, y: -r * 0.42, z: 0.8 },
        { x: r * 0.64, y: r * 0.72, z: 0.2 },
        { x: 0, y: r * 1.18, z: 1 },
        { x: -r * 0.85, y: r * 0.48, z: 0.55 },
        { x: -r * 0.86, y: -r * 0.48, z: 0.65 },
      ];

      ctx.beginPath();
      poly.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
      const coreFace = ctx.createLinearGradient(-r, -r, r, r);
      coreFace.addColorStop(0, "rgba(255,255,255,0.12)");
      coreFace.addColorStop(0.35, "rgba(255,138,67,0.32)");
      coreFace.addColorStop(1, "rgba(8,13,17,0.96)");
      ctx.fillStyle = coreFace;
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 176, 107, ${0.45 + burst.strength * 0.25})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 246, 230, 0.98)";
      ctx.font = "700 26px Inter, ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Z", 0, 2);
      ctx.restore();

      // Fast vertical data rain.
      for (let column = 0; column < 14; column += 1) {
        const x = width * (0.02 + (column / 14) * 0.96);
        const y = (t * (18 + column * 2.5) * baseSpeed * 8 + column * 54) % (height + 120) - 60;
        const alpha = 0.02 + 0.028 * (0.5 + 0.5 * Math.sin(t * 2 + column));
        ctx.fillStyle = `rgba(172, 214, 221, ${alpha})`;
        ctx.fillRect(x, y, 1, 28 + (column % 3) * 14);
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      wrap.removeEventListener("pointermove", handlePointerMove);
      wrap.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [activeSignal, mode, signals]);

  return (
    <div className={`zwirk-scene mode-${mode}`} ref={wrapRef}>
      <canvas ref={canvasRef} className="zwirk-canvas" aria-hidden="true" />

      <div className="scene-grid" aria-hidden="true" />
      <div className="scene-vignette" aria-hidden="true" />
      <div className="scene-scanline" aria-hidden="true" />

      <div className="core-label">
        <span className="core-label-dot" />
        LIVING INTELLIGENCE
      </div>

      {signals.map((signal, index) => {
        const focused = activeSignal === signal.id || hovered === signal.id;
        return (
          <button
            key={signal.id}
            type="button"
            className={`signal-card ${focused ? "focused" : ""}`}
            style={{ left: `${signal.x}%`, top: `${signal.y}%` }}
            onMouseEnter={() => setHovered(signal.id)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(signal.id)}
            onBlur={() => setHovered(null)}
            onClick={() => onSignalSelect(signal.id)}
          >
            <span className="signal-index">0{index + 1}</span>
            <span className="signal-eyebrow">{signal.eyebrow}</span>
            <strong>{signal.label}</strong>
            <span className="signal-value">{signal.value}</span>
            <span className="signal-detail">{signal.detail}</span>
            <span className="signal-status">
              <i />
              {focused ? "ENGAGED" : "STREAMING"}
            </span>
          </button>
        );
      })}

      <div className="creature-caption">
        <span className="caption-line" />
        <span>
          ZWIRK is not a dashboard overlay.<br />
          It is the system underneath the decisions.
        </span>
      </div>

      <div className="scene-corner scene-corner-tl">
        <span>06 SIGNAL STREAMS</span>
        <span>∞ LIVE PATHS</span>
      </div>

      <div className="scene-corner scene-corner-br">
        <span>LATENT STATE</span>
        <span>{mode.toUpperCase()}</span>
      </div>
    </div>
  );
}
