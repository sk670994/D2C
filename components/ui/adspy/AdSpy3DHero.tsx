"use client";

import { Activity, ArrowUpRight, BrainCircuit, Layers3, Sparkles, Zap } from "lucide-react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import type { PointerEvent } from "react";

export function AdSpy3DHero() {
  const mx = useSpring(useMotionValue(0), { stiffness: 90, damping: 18, mass: 0.55 });
  const my = useSpring(useMotionValue(0), { stiffness: 90, damping: 18, mass: 0.55 });
  const rotateY = useTransform(mx, [-1, 1], [-14, 14]);
  const rotateX = useTransform(my, [-1, 1], [12, -12]);
  const frontX = useTransform(mx, [-1, 1], [-20, 20]);
  const backX = useTransform(mx, [-1, 1], [28, -28]);
  const frontY = useTransform(my, [-1, 1], [10, -10]);
  const badgeY = useTransform(my, [-1, 1], [-16, 16]);

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    mx.set(((event.clientX - rect.left) / rect.width - 0.5) * 2);
    my.set(((event.clientY - rect.top) / rect.height - 0.5) * 2);
  };

  const reset = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <div
      className="relative hidden h-[320px] w-full max-w-[470px] lg:block"
      data-adspy-framework="react-bits-3d-hero"
      onPointerMove={move}
      onPointerLeave={reset}
      style={{ perspective: 1300 }}
    >
      <motion.div
        className="absolute inset-2 rounded-[32px] border border-white/70 bg-white/70 shadow-[0_50px_110px_rgba(15,23,42,.16)] backdrop-blur-xl"
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 6.4, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute left-[2%] top-[12%] h-[70%] w-[72%] rounded-[26px] border border-blue-200/65 bg-white/85 p-5 shadow-[0_30px_80px_rgba(37,99,235,.10)]"
        style={{ x: backX, y: frontY, z: -90, rotateZ: -7, transformStyle: "preserve-3d" }}
      >
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-[9px] font-bold uppercase tracking-[0.2em]">Market layer</span>
          <ArrowUpRight size={14} />
        </div>
        <div className="mt-8 grid grid-cols-5 items-end gap-2">
          {[36, 62, 48, 78, 56].map((height, i) => (
            <motion.span
              key={i}
              className="rounded-t-md bg-blue-200"
              animate={{ height: [height, height + 16, Math.max(26, height - 10), height] }}
              transition={{ duration: 4.8 + i * 0.15, repeat: Infinity, ease: "easeInOut" }}
            />
          ))}
        </div>
      </motion.div>

      <motion.div
        className="absolute left-[14%] top-[7%] h-[79%] w-[78%] rounded-[28px] border border-white/10 bg-slate-950 p-5 text-white shadow-[0_45px_100px_rgba(15,23,42,.34)]"
        style={{ x: frontX, y: frontY, rotateX, rotateY, transformStyle: "preserve-3d" }}
        animate={{ y: [0, -3, 0] }}
        transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-500/15 text-blue-300">
              <BrainCircuit size={16} />
            </div>
            <div>
              <div className="text-[8px] font-bold uppercase tracking-[0.18em] text-slate-500">Ad intelligence</div>
              <div className="text-sm font-semibold">Creative system</div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/20 bg-blue-400/10 px-2.5 py-1 text-[8px] font-bold text-blue-200">
            <Zap size={10} /> LIVE
          </span>
        </div>

        <div className="relative mt-6 h-[116px] overflow-hidden rounded-2xl border border-white/8 bg-white/[0.045]">
          <div className="absolute inset-x-5 bottom-5 flex items-end gap-2">
            {[38, 64, 50, 30, 72].map((initial, i) => (
              <motion.span
                key={i}
                className="w-full rounded-t-md bg-blue-400/45"
                animate={{ height: [initial, initial + 20, Math.max(24, initial - 8), initial + 10, initial] }}
                transition={{ duration: 4.6 + i * 0.18, repeat: Infinity, ease: "easeInOut" }}
              />
            ))}
          </div>
          <div className="absolute inset-x-0 top-1/2 h-px bg-white/5" />
          <div className="absolute bottom-3 left-3 flex items-center gap-1 text-[8px] font-semibold text-slate-500">
            <Activity size={10} /> persistence signal
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <motion.div className="rounded-xl border border-white/8 bg-white/[0.035] p-3" style={{ transform: "translateZ(24px)" }}>
            <div className="text-[8px] font-bold uppercase tracking-[0.16em] text-slate-500">Formats</div>
            <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold"><Layers3 size={12} className="text-slate-400" /> 3 dominant</div>
          </motion.div>
          <motion.div className="rounded-xl border border-white/8 bg-white/[0.035] p-3" style={{ transform: "translateZ(24px)" }}>
            <div className="text-[8px] font-bold uppercase tracking-[0.16em] text-slate-500">Signal</div>
            <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold"><Sparkles size={12} className="text-blue-300" /> evolving</div>
          </motion.div>
        </div>
      </motion.div>

      <motion.div
        className="absolute bottom-[2%] right-0 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 shadow-[0_24px_60px_rgba(15,23,42,.14)] backdrop-blur-xl"
        style={{ x: backX, y: badgeY, z: 70, rotateZ: 4, transformStyle: "preserve-3d" }}
        animate={{ rotateZ: [4, 2, 4] }}
        transition={{ duration: 5.8, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="text-[8px] font-bold uppercase tracking-[0.18em] text-slate-400">Observed</div>
        <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold"><Sparkles size={13} className="text-blue-600" /> Historical footprint</div>
      </motion.div>
    </div>
  );
}
