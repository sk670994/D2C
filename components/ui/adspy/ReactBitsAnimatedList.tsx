"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

export function ReactBitsAnimatedList({
  items,
  activeIndex,
  className = "",
  pauseOnHover = false,
}: {
  items: ReactNode[];
  activeIndex: number;
  className?: string;
  pauseOnHover?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const safeIndex = Math.min(Math.max(activeIndex, 0), Math.max(items.length - 1, 0));

  if (!items.length) return null;

  return (
    <div className={`relative overflow-hidden ${className}`.trim()}>
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={safeIndex}
          initial={reduceMotion ? false : { opacity: 0, y: 14, filter: "blur(5px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -10, filter: "blur(3px)" }}
          transition={{ duration: reduceMotion ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
          whileHover={pauseOnHover ? { x: 2 } : undefined}
          className="will-change-transform"
        >
          {items[safeIndex]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
