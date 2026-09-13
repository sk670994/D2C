"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function AnimmasterShowMore({
  children,
  label = "Show more",
  hideLabel = "Show less",
  collapsedHeight = 68,
  className = "",
}: {
  children: ReactNode;
  label?: string;
  hideLabel?: string;
  collapsedHeight?: number;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={className} data-adspy-framework="animmaster-progressive-disclosure">
      <div className="relative">
        <motion.div
          initial={false}
          animate={{ height: expanded ? "auto" : collapsedHeight }}
          transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>

        {!expanded ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white via-white/90 to-transparent" />
        ) : null}
      </div>

      <AnimatePresence initial={false} mode="wait">
        <motion.button
          type="button"
          key={expanded ? "less" : "more"}
          onClick={() => setExpanded((current) => !current)}
          initial={{ opacity: 0, x: -5 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 5 }}
          transition={{ duration: 0.18 }}
          className="mt-0.5 inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[10px] font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
        >
          {expanded ? hideLabel : label}
          <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={12} />
          </motion.span>
        </motion.button>
      </AnimatePresence>
    </div>
  );
}
