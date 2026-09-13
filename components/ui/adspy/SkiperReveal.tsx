"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

export function SkiperReveal({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      data-adspy-framework="skiper-image-reveal"
      className={`group/skiper relative overflow-hidden ${className}`.trim()}
      whileHover={{ scale: 1.012 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        className="h-full w-full"
        whileHover={{ scale: 1.045, y: -2 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>

      <motion.div
        initial={{ x: "-135%", opacity: 0 }}
        whileHover={{ x: "175%", opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-none absolute inset-y-0 left-0 z-20 w-[32%] -skew-x-12 bg-gradient-to-r from-transparent via-white/35 to-transparent"
      />

      <div className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] opacity-0 ring-1 ring-inset ring-white/60 transition-opacity duration-300 group-hover/skiper:opacity-100" />
    </motion.div>
  );
}
