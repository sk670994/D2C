"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";

export function AdSpy3DAtmosphere() {
  const px = useSpring(useMotionValue(0.5), { stiffness: 90, damping: 22, mass: 0.6 });
  const py = useSpring(useMotionValue(0.5), { stiffness: 90, damping: 22, mass: 0.6 });
  const rx = useTransform(py, [0, 1], [8, -8]);
  const ry = useTransform(px, [0, 1], [-10, 10]);
  const orbX = useTransform(px, [0, 1], [-40, 40]);
  const orbY = useTransform(py, [0, 1], [-30, 30]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      px.set(event.clientX / Math.max(window.innerWidth, 1));
      py.set(event.clientY / Math.max(window.innerHeight, 1));
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [px, py]);

  return (
    <div
      aria-hidden="true"
      data-adspy-3d-atmosphere
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(37,99,235,.08),transparent_28%),radial-gradient(circle_at_86%_20%,rgba(99,102,241,.08),transparent_28%),linear-gradient(180deg,#f8fafc_0%,#f4f7fb_100%)]" />

      <motion.div
        className="absolute left-[12%] top-[14%] h-48 w-48 rounded-[42px] border border-blue-200/35 bg-white/35 shadow-[0_40px_100px_rgba(37,99,235,.10)] backdrop-blur-[2px]"
        style={{
          x: orbX,
          y: orbY,
          rotateX: rx,
          rotateY: ry,
          transformStyle: "preserve-3d",
        }}
      />

      <motion.div
        className="absolute right-[7%] top-[24%] h-64 w-64 rounded-full border border-indigo-200/30"
        style={{
          x: useTransform(orbX, (value) => -value * 0.7),
          y: useTransform(orbY, (value) => value * 0.45),
          rotateX: rx,
          rotateY: ry,
          transformStyle: "preserve-3d",
        }}
      />

      <motion.div
        className="absolute left-1/2 top-[42%] h-[420px] w-[420px] -translate-x-1/2 rounded-full border border-slate-200/45"
        style={{
          rotateX: useTransform(py, [0, 1], [5, -5]),
          rotateY: useTransform(px, [0, 1], [-6, 6]),
          transformStyle: "preserve-3d",
        }}
      >
        <div className="absolute inset-8 rounded-full border border-slate-200/35" />
        <div className="absolute inset-20 rounded-full border border-blue-200/25" />
      </motion.div>

      <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.06)_1px,transparent_1px)] bg-[size:44px_44px] opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent_72%)]" />
    </div>
  );
}
