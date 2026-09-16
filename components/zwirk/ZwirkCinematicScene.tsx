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

const TAU = Math.PI * 2;

function seed(i: number) {
  const n = Math.sin(i * 127.1 + 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smooth(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export default function ZwirkCinematicScene({
  mode,
  activeSignal,
  signals,
  onSignalSelect,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;

    if (!canvas || !stage) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let width = 1;
    let height = 1;
    let dpr = 1;
    let raf = 0;
    let previous = performance.now();

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

    const stars = Array.from({ length: 520 }, (_, i) => ({
      a: seed(i) * TAU,
      r: 0.18 + seed(i + 4) * 1.2,
      z: 0.08 + seed(i + 5) * 0.92,
      s: 0.4 + seed(i + 9) * 1.8,
      tw: seed(i + 12) * TAU,
    }));

    const ribbons = Array.from({ length: 34 }, (_, i) => ({
      phase: seed(i + 50) * TAU,
      speed: 0.52 + seed(i + 100) * 1.55,
      width: 0.7 + seed(i + 200) * 2.4,
      radius: 130 + seed(i + 300) * 220,
      tilt: 0.25 + seed(i + 400) * 0.72,
      length: 0.78 + seed(i + 500) * 0.6,
      wave: 0.6 + seed(i + 600) * 2.8,
      side: i % 2 ? -1 : 1,
      hue: i % 3,
      target: i % signals.length,
    }));

    const sparks = Array.from({ length: 180 }, (_, i) => ({
      phase: seed(i + 1000) * TAU,
      radius: 80 + seed(i + 1100) * 330,
      speed: 0.5 + seed(i + 1200) * 2.2,
      size: 0.5 + seed(i + 1300) * 1.4,
    }));

    const resize = () => {
      const rect = stage.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const move = (event: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      mouse.tx = ((event.clientX - rect.left) / rect.width - 0.5);
      mouse.ty = ((event.clientY - rect.top) / rect.height - 0.5);
    };

    const leave = () => {
      mouse.tx = 0;
      mouse.ty = 0;
    };

    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerleave", leave);
    resize();

    const drawRibbon = (
      t: number,
      cx: number,
      cy: number,
      ribbon: (typeof ribbons)[number],
      speedMultiplier: number,
    ) => {
      const angle =
        ribbon.phase +
        t * ribbon.speed * ribbon.side * speedMultiplier;

      const active = activeSignal === signals[ribbon.target]?.id;
      const pulse =
        0.5 + 0.5 * Math.sin(t * (2.8 + ribbon.wave) + ribbon.phase);

      const reach = ribbon.radius * (0.9 + pulse * 0.42);
      const target = signals[ribbon.target];

      const targetX = width * (target.x / 100);
      const targetY = height * (target.y / 100);

      const pull = active ? 0.62 : 0.08 + pulse * 0.08;

      const ex =
        smooth(
          cx + Math.cos(angle) * reach * 1.42 + mouse.x * 100,
          targetX,
          pull,
        );

      const ey =
        smooth(
          cy +
            Math.sin(angle * ribbon.tilt) *
              reach *
              0.92 +
            mouse.y * 75,
          targetY,
          pull,
        );

      const c1x =
        cx +
        Math.cos(angle + 0.72 * ribbon.side) *
          reach *
          0.46 +
        Math.sin(t * 1.4 + ribbon.phase) * 70;

      const c1y =
        cy +
        Math.sin(angle + 0.72 * ribbon.side) *
          reach *
          0.25;

      const c2x =
        cx +
        Math.cos(angle - 0.45 * ribbon.side) *
          reach *
          0.94 +
        mouse.x * 160;

      const c2y =
        cy +
        Math.sin(angle - 0.45 * ribbon.side) *
          reach *
          0.54 +
        mouse.y * 120;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey);

      const glow =
        active || hovered
          ? 0.42
          : 0.16 + pulse * 0.12;

      const color =
        ribbon.hue === 0
          ? `rgba(255, 139, 72, ${glow})`
          : ribbon.hue === 1
            ? `rgba(96, 188, 255, ${glow * 0.8})`
            : `rgba(217, 221, 214, ${glow * 0.45})`;

      ctx.strokeStyle = color;
      ctx.lineWidth = ribbon.width * 5.6;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey);
      ctx.strokeStyle = color.replace(
        `${glow})`,
        `${Math.min(0.92, glow + 0.28)})`,
      );
      ctx.lineWidth = ribbon.width;
      ctx.stroke();

      const u =
        (t * ribbon.speed * 0.12 * speedMultiplier +
          ribbon.phase / TAU) %
        1;

      const omt = 1 - u;

      const px =
        omt * omt * omt * cx +
        3 * omt * omt * u * c1x +
        3 * omt * u * u * c2x +
        u * u * u * ex;

      const py =
        omt * omt * omt * cy +
        3 * omt * omt * u * c1y +
        3 * omt * u * u * c2y +
        u * u * u * ey;

      ctx.fillStyle = `rgba(255, 214, 157, ${0.3 + pulse * 0.42})`;
      ctx.beginPath();
      ctx.arc(px, py, 1.2 + pulse * 2, 0, TAU);
      ctx.fill();
    };

    const render = (now: number) => {
      const dt = Math.min(0.035, (now - previous) / 1000);
      previous = now;
      const t = now / 1000;

      mouse.x = smooth(mouse.x, mouse.tx, Math.min(1, dt * 5));
      mouse.y = smooth(mouse.y, mouse.ty, Math.min(1, dt * 5));

      const speedMultiplier =
        mode === "thinking" ? 2.65 :
        mode === "observing" ? 1.55 :
        mode === "resolved" ? 1.0 : 1.08;

      ctx.fillStyle = "#030507";
      ctx.fillRect(0, 0, width, height);

      const bg = ctx.createRadialGradient(
        width * 0.56 + mouse.x * 80,
        height * 0.46 + mouse.y * 50,
        0,
        width * 0.56,
        height * 0.48,
        Math.max(width, height) * 0.68,
      );

      bg.addColorStop(0, "rgba(31, 44, 53, 0.88)");
      bg.addColorStop(0.24, "rgba(9, 19, 25, 0.82)");
      bg.addColorStop(0.58, "rgba(5, 9, 13, 0.96)");
      bg.addColorStop(1, "rgba(2, 3, 5, 1)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      // distant stars / live telemetry
      for (const star of stars) {
        const angle = star.a + t * (0.02 + star.z * 0.028);
        const radius = star.r * Math.min(width, height);
        const sx =
          width * 0.54 +
          Math.cos(angle) * radius +
          mouse.x * radius * 0.04;
        const sy =
          height * 0.47 +
          Math.sin(angle * 1.31) *
            radius *
            0.58 +
          mouse.y * radius * 0.025;

        if (sx < -10 || sy < -10 || sx > width + 10 || sy > height + 10) continue;

        const alpha =
          0.03 +
          0.08 *
            (0.5 + 0.5 * Math.sin(t * 1.7 + star.tw));

        ctx.fillStyle = `rgba(214, 232, 236, ${alpha})`;
        ctx.beginPath();
        ctx.arc(sx, sy, star.s * (0.45 + star.z), 0, TAU);
        ctx.fill();
      }

      // atmospheric plasma behind the creature
      for (let i = 0; i < 6; i += 1) {
        const a = t * (0.08 + i * 0.015) + i;
        const gx =
          width * 0.54 +
          Math.cos(a) * (250 + i * 34) +
          mouse.x * 80;
        const gy =
          height * 0.48 +
          Math.sin(a * 1.2) * (100 + i * 20) +
          mouse.y * 50;

        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 160);
        g.addColorStop(0, `rgba(255, 116, 48, ${0.025 + i * 0.004})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(gx, gy, 160, 0, TAU);
        ctx.fill();
      }

      // rotating energy tracks
      for (let ring = 0; ring < 7; ring += 1) {
        const rr = 66 + ring * 37;
        const rot = t * (0.06 + ring * 0.011) * (ring % 2 ? -1 : 1);

        ctx.save();
        ctx.translate(
          width * 0.54 + mouse.x * 42,
          height * 0.49 + mouse.y * 28,
        );
        ctx.rotate(rot);
        ctx.scale(1, 0.33 + ring * 0.012);
        ctx.beginPath();
        ctx.arc(0, 0, rr, 0, TAU);
        ctx.strokeStyle = `rgba(143, 194, 209, ${0.035 + ring * 0.009})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }

      const cx = width * 0.54 + mouse.x * 48;
      const cy = height * 0.48 + mouse.y * 35;

      // living ribbons
      for (const ribbon of ribbons) {
        drawRibbon(t, cx, cy, ribbon, speedMultiplier);
      }

      // fast orbital sparks
      for (const spark of sparks) {
        const angle =
          spark.phase +
          t * spark.speed * 0.32 * speedMultiplier;

        const radius =
          spark.radius +
          Math.sin(t * 1.8 + spark.phase) * 28;

        const sx = cx + Math.cos(angle) * radius;
        const sy =
          cy +
          Math.sin(angle * 1.12) * radius * 0.38;

        ctx.fillStyle = `rgba(255, 175, 104, ${
          0.05 + spark.size * 0.06
        })`;

        ctx.beginPath();
        ctx.arc(sx, sy, spark.size, 0, TAU);
        ctx.fill();
      }

      // living core glow
      const glow = ctx.createRadialGradient(
        cx,
        cy,
        3,
        cx,
        cy,
        150,
      );

      glow.addColorStop(
        0,
        `rgba(255, 232, 195, ${
          mode === "thinking" ? 0.5 : 0.34
        })`,
      );
      glow.addColorStop(0.18, "rgba(255, 145, 65, 0.18)");
      glow.addColorStop(0.52, "rgba(255, 83, 30, 0.06)");
      glow.addColorStop(1, "rgba(0,0,0,0)");

      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, 145, 0, TAU);
      ctx.fill();

      // crystalline core body
      const pulse =
        1 +
        0.06 * Math.sin(t * 3.2) +
        (mode === "thinking" ? 0.05 : 0);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.12);

      const r = 48 * pulse;

      const faces = [
        [
          [-r * 0.02, -r * 1.12],
          [r * 0.84, -r * 0.38],
          [r * 0.22, r * 0.18],
          [-r * 0.72, -r * 0.24],
        ],
        [
          [-r * 0.72, -r * 0.24],
          [r * 0.22, r * 0.18],
          [r * 0.02, r * 1.1],
          [-r * 0.86, r * 0.45],
        ],
        [
          [r * 0.22, r * 0.18],
          [r * 0.84, -r * 0.38],
          [r * 0.74, r * 0.55],
          [r * 0.02, r * 1.1],
        ],
      ];

      faces.forEach((face, index) => {
        ctx.beginPath();
        face.forEach(([x, y], point) => {
          if (point === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();

        const gradient = ctx.createLinearGradient(
          -r,
          -r,
          r,
          r,
        );

        if (index === 0) {
          gradient.addColorStop(0, "rgba(255, 252, 244, 0.72)");
          gradient.addColorStop(0.35, "rgba(255, 163, 88, 0.45)");
          gradient.addColorStop(1, "rgba(24, 17, 13, 0.96)");
        } else if (index === 1) {
          gradient.addColorStop(0, "rgba(72, 126, 151, 0.35)");
          gradient.addColorStop(0.5, "rgba(14, 25, 31, 0.92)");
          gradient.addColorStop(1, "rgba(255, 116, 50, 0.24)");
        } else {
          gradient.addColorStop(0, "rgba(255, 127, 54, 0.4)");
          gradient.addColorStop(0.4, "rgba(48, 33, 25, 0.8)");
          gradient.addColorStop(1, "rgba(5, 8, 10, 0.96)");
        }

        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.strokeStyle = "rgba(255, 185, 122, 0.28)";
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      ctx.shadowBlur = 22;
      ctx.shadowColor = "rgba(255, 142, 61, 0.62)";
      ctx.fillStyle = "#fff7ec";
      ctx.font = "800 46px Inter, ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Z", 0, 2);
      ctx.shadowBlur = 0;

      ctx.restore();

      // floor / circular machine platform
      const floorY = height * 0.84;

      ctx.save();
      ctx.translate(width * 0.54, floorY);
      ctx.scale(1, 0.22);

      for (let i = 0; i < 8; i += 1) {
        ctx.beginPath();
        ctx.arc(0, 0, 120 + i * 34, 0, TAU);
        ctx.strokeStyle = `rgba(118, 176, 193, ${0.03 + i * 0.006})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.restore();

      // floor streaks
      for (let i = 0; i < 18; i += 1) {
        const offset = ((t * (30 + i * 4) * speedMultiplier) + i * 120) % (width * 1.5);
        const y = floorY + (i % 6) * 16;

        ctx.fillStyle = `rgba(255, ${
          i % 2 ? 130 : 183
        }, 92, ${0.035 + (i % 4) * 0.01})`;

        ctx.fillRect(width * 0.2 + offset - width * 0.75, y, 50 + i * 9, 1);
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerleave", leave);
    };
  }, [activeSignal, hovered, mode, signals]);

  return (
    <div ref={stageRef} className={`zwirk-v3-scene mode-${mode}`}>
      <canvas ref={canvasRef} className="zwirk-v3-canvas" />

      <div className="zwirk-v3-signal-layer">
        {signals.map((signal, index) => {
          const focused =
            signal.id === activeSignal ||
            signal.id === hovered;

          return (
            <button
              key={signal.id}
              className={`zwirk-v3-signal ${focused ? "focused" : ""}`}
              style={{
                left: `${signal.x}%`,
                top: `${signal.y}%`,
              }}
              type="button"
              onMouseEnter={() => setHovered(signal.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(signal.id)}
              onBlur={() => setHovered(null)}
              onClick={() => onSignalSelect(signal.id)}
            >
              <span className="signal-top">
                <i>0{index + 1}</i>
                <em>{signal.eyebrow}</em>
                <b>LIVE</b>
              </span>

              <strong>{signal.label}</strong>

              <span className="signal-metrics">
                {signal.value}
                <small>{signal.detail}</small>
              </span>

              <span className="signal-wave">
                <i /><i /><i /><i /><i /><i /><i />
              </span>
            </button>
          );
        })}
      </div>

      <div className="zwirk-v3-scan">
        SCANNING<br />
        <b>GLOBAL SIGNALS...</b>
      </div>

      <div className="zwirk-v3-core-label">
        <span /> LIVING DECISION ENGINE
      </div>
    </div>
  );
}
