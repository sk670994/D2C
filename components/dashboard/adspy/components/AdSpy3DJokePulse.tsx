"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Pause, Play, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ReactBitsAnimatedList } from "@/components/ui/adspy/ReactBitsAnimatedList";

const ITEMS = [
  ["SANTA-BANTA", "Santa: Competitor ka ad 3 mahine se chal raha hai. Banta: Lagta hai creative ko permanent job mil gayi!"],
  ["SANTA-BANTA", "Santa: ROAS kaisa hai? Banta: ROAS nahi pata, par boss ki patience definitely 0 hai."],
  ["SANTA-BANTA", "Santa: Ad itna baar kyun edit kiya? Banta: Copywriter bola, “one last tweak” — 17th time."],
  ["SANTA-BANTA", "Santa: Audience kaun hai? Banta: Jo ad dekh ke scroll karte-karte khud bhi research analyst ban gaye."],
  ["SANTA-BANTA", "Santa: CTR badha? Banta: Screenshot pe haan. Dashboard abhi bhi spiritual retreat pe hai."],
  ["SANTA-BANTA", "Santa: Competitor ka offer kya hai? Banta: “Limited time.” Santa: Kab se? Banta: Limited time se pehle se!"],
  ["SANTA-BANTA", "Santa: Creative fatigue? Banta: Nahi bhai, creative ab family member hai. Salary bhi maang raha hai."],
  ["SANTA-BANTA", "Santa: New creative launch? Banta: Haan. Santa: Result? Banta: Pehle coffee, phir analytics."],
  ["MARKET NOTE", "A useful competitive signal is not one ad — it is repeated creative behavior across hooks, offers, formats and time."],
  ["ZOOPTRACK NOTE", "AdSpy turns a competitor's public creative footprint into a timeline you can actually inspect."],
];

export function AdSpy3DJokePulse() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const px = useSpring(useMotionValue(0), { stiffness: 95, damping: 18, mass: 0.45 });
  const py = useSpring(useMotionValue(0), { stiffness: 95, damping: 18, mass: 0.45 });
  const rotateY = useTransform(px, [-1, 1], [-7, 7]);
  const rotateX = useTransform(py, [-1, 1], [6, -6]);
  const glowX = useTransform(px, [-1, 1], ["35%", "65%"]);
  const glowY = useTransform(py, [-1, 1], ["35%", "65%"]);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % ITEMS.length);
    }, 6200);
    return () => window.clearInterval(timer);
  }, [paused]);

  const rendered = useMemo(
    () =>
      ITEMS.map(([label, text], itemIndex) => (
        <div
          key={`${label}-${itemIndex}`}
          className="flex min-h-[78px] items-center gap-3"
        >
          <motion.div
            className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/15 bg-slate-950 text-white shadow-[0_18px_38px_rgba(15,23,42,.2)]"
            animate={{
              rotateZ: label === "SANTA-BANTA" ? [0, -4, 4, 0] : [0, 2, 0],
              y: [0, -1, 0],
            }}
            transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
            style={{ transformStyle: "preserve-3d" }}
          >
            <Sparkles size={15} />
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-blue-500 ring-2 ring-white" />
            <span className="absolute inset-x-2 -bottom-1 h-px bg-blue-400/50" />
          </motion.div>

          <div className="min-w-0">
            <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-slate-400">
              {label}
            </div>
            <p className="mt-1 max-w-4xl text-[11px] font-semibold leading-5 text-slate-700">
              {text}
            </p>
          </div>
        </div>
      )),
    [],
  );

  function move(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    px.set(((event.clientX - rect.left) / rect.width - 0.5) * 2);
    py.set(((event.clientY - rect.top) / rect.height - 0.5) * 2);
  }

  return (
    <motion.section
      data-adspy-framework="react-bits-3d-joke-pulse"
      onPointerMove={move}
      onPointerLeave={() => {
        px.set(0);
        py.set(0);
        setPaused(false);
      }}
      onPointerEnter={() => setPaused(true)}
      className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_12px_34px_rgba(15,23,42,.055)]"
      style={{ rotateX, rotateY, transformStyle: "preserve-3d", perspective: 1200 }}
    >
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle 260px at ${glowX} ${glowY}, rgba(37,99,235,.10), transparent 70%)`,
        }}
      />

      <motion.div
        className="pointer-events-none absolute right-8 top-4 h-16 w-16 rounded-full border border-blue-200/45"
        animate={{ scale: [1, 1.08, 1], rotate: [0, 10, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-2.5 sm:w-[185px] sm:shrink-0">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-950 text-white shadow-sm">
            <Sparkles size={14} />
          </div>
          <div className="min-w-0">
            <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-blue-600">
              Zooptrack break
            </div>
            <div className="text-[10px] font-semibold text-slate-800">
              Competitive intelligence, but funny.
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <ReactBitsAnimatedList items={rendered} activeIndex={index} pauseOnHover className="min-h-[78px]" />
        </div>

        <div className="flex items-center justify-end gap-2 sm:w-[140px] sm:shrink-0">
          <div className="flex items-center gap-1" aria-hidden="true">
            {ITEMS.map((item, dot) => (
              <span
                key={`${item[0]}-${dot}`}
                className={dot === index ? "h-1.5 w-5 rounded-full bg-slate-900" : "h-1.5 w-1.5 rounded-full bg-slate-200"}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            aria-label={paused ? "Resume joke pulse" : "Pause joke pulse"}
            className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-950"
          >
            {paused ? <Play size={11} /> : <Pause size={11} />}
          </button>
        </div>
      </div>
    </motion.section>
  );
}
