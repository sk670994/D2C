"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useRef } from "react";

export function AdSpySpatialHeader() {
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const x = useSpring(px, { stiffness: 120, damping: 24, mass: 0.35 });
  const y = useSpring(py, { stiffness: 120, damping: 24, mass: 0.35 });

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="adspy-spatial-header pointer-events-none absolute inset-0 overflow-hidden rounded-[28px]"
      onPointerMove={(event) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;

        px.set(Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1)));
        py.set(Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1)));
      }}
      onPointerLeave={() => {
        px.set(0);
        py.set(0);
      }}
    >
      <motion.div
        style={{
          rotateX: useTransform(y, [-1, 1], [2.6, -2.6]),
          rotateY: useTransform(x, [-1, 1], [-2.6, 2.6]),
          x: useTransform(x, [-1, 1], [-14, 14]),
          y: useTransform(y, [-1, 1], [-8, 8]),
        }}
        className="absolute -right-10 top-5 h-48 w-72 rounded-[36px] border border-blue-100 bg-blue-50/45 shadow-[0_26px_72px_rgba(37,99,235,.08)] [transform-style:preserve-3d]"
      >
        <div className="absolute inset-5 rounded-[26px] border border-blue-100/70 bg-white/40" />
        <div className="absolute bottom-4 left-5 h-1.5 w-20 rounded-full bg-blue-200/70" />
        <div className="absolute bottom-4 right-5 h-1.5 w-12 rounded-full bg-slate-200" />
      </motion.div>

      <motion.div
        style={{
          x: useTransform(x, [-1, 1], [8, -8]),
          y: useTransform(y, [-1, 1], [5, -5]),
        }}
        className="absolute right-32 top-24 h-20 w-36 rounded-2xl border border-slate-200 bg-white/80 shadow-[0_12px_34px_rgba(15,23,42,.07)] [transform:translateZ(30px)]"
      >
        <div className="mx-4 mt-4 h-1.5 w-12 rounded-full bg-blue-200" />
        <div className="mx-4 mt-2 h-1.5 w-20 rounded-full bg-slate-200" />
        <div className="mx-4 mt-3 h-6 w-6 rounded-full border-2 border-blue-200" />
      </motion.div>
    </div>
  );
}
