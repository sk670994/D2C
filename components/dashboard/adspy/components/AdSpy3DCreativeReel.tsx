"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowUpRight, Layers3, Play, Sparkles, Video } from "lucide-react";
import { useMemo, useState } from "react";
import type { Ad } from "../adspy-types";

function url(value?: string | null) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function AdSpy3DCreativeReel({
  ads,
  onInspect,
}: {
  ads: Ad[];
  onInspect: (ad: Ad) => void;
}) {
  const cards = useMemo(() => ads.slice(0, 7), [ads]);
  const [active, setActive] = useState(0);

  const mx = useSpring(useMotionValue(0), { stiffness: 110, damping: 18, mass: 0.45 });
  const my = useSpring(useMotionValue(0), { stiffness: 110, damping: 18, mass: 0.45 });
  const rotateY = useTransform(mx, [-1, 1], [-10, 10]);
  const rotateX = useTransform(my, [-1, 1], [8, -8]);

  if (!cards.length) return null;

  function move(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    mx.set(((event.clientX - rect.left) / rect.width - 0.5) * 2);
    my.set(((event.clientY - rect.top) / rect.height - 0.5) * 2);
  }

  function reset() {
    mx.set(0);
    my.set(0);
  }

  return (
    <section
      data-adspy-framework="react-bits-parallax-creative-reel"
      className="hidden overflow-hidden rounded-[24px] border border-slate-200 bg-slate-950 p-4 text-white shadow-[0_26px_70px_rgba(15,23,42,.18)] lg:block"
      onPointerMove={move}
      onPointerLeave={reset}
      style={{ perspective: 1400 }}
    >
      <div className="grid items-center gap-5 lg:grid-cols-[235px_minmax(0,1fr)]">
        <div>
          <div className="flex items-center gap-2 text-[8px] font-bold uppercase tracking-[0.2em] text-blue-200">
            <Sparkles size={12} />
            Creative depth
          </div>
          <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em]">
            See the creative system in motion.
          </h2>
          <p className="mt-1.5 text-[10px] leading-4.5 text-slate-400">
            Hover the stack to change perspective. Click any plate to inspect the underlying creative.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-[9px] font-semibold text-slate-300">
            <Layers3 size={11} />
            {cards.length} recent creatives
          </div>
        </div>

        <motion.div
          className="relative h-[170px]"
          style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        >
          {cards.map((ad, index) => {
            const image = url(ad.thumbnailUrl || ad.imageUrl);
            const offset = index - active;
            const abs = Math.abs(offset);

            return (
              <motion.button
                key={`${ad.platform}:${ad.id}`}
                type="button"
                onClick={() => {
                  setActive(index);
                  if (abs === 0) onInspect(ad);
                }}
                animate={{
                  x: offset * 76,
                  y: abs * 10,
                  rotateZ: offset * 7,
                  scale: index === active ? 1 : Math.max(0.78, 1 - abs * 0.055),
                  opacity: abs > 3 ? 0 : 1 - Math.min(0.48, abs * 0.11),
                  zIndex: cards.length - abs,
                }}
                transition={{ type: "spring", stiffness: 190, damping: 20, mass: 0.45 }}
                className="group absolute left-1/2 top-1/2 h-[145px] w-[108px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[16px] border border-white/12 bg-slate-900 text-left shadow-[0_24px_55px_rgba(0,0,0,.28)]"
                style={{
                  transformStyle: "preserve-3d",
                  transformOrigin: "50% 100%",
                }}
                aria-label={ad.headline || ad.productName || `Creative ${index + 1}`}
              >
                {image ? (
                  <img
                    src={image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
                  />
                ) : (
                  <div className="grid h-full place-items-center bg-slate-800 text-slate-500">
                    <Sparkles size={20} />
                  </div>
                )}

                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent p-2 pt-7">
                  <div className="line-clamp-2 text-[8px] font-semibold text-white">
                    {ad.headline || ad.productName || "Creative"}
                  </div>
                </div>

                <span className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-lg bg-white text-slate-950 shadow-md">
                  {ad.videoUrl ? <Play size={10} fill="currentColor" /> : <Video size={10} />}
                </span>

                <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-lg bg-slate-950/75 text-white backdrop-blur">
                  <ArrowUpRight size={10} />
                </span>
              </motion.button>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
