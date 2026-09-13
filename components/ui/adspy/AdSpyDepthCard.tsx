"use client";

import { motion, useMotionTemplate, useMotionValue, useSpring } from "framer-motion";
import type { PointerEvent, ReactNode } from "react";

export function AdSpyDepthCard({
  children,
  className = "",
  intensity = 7,
  disabled = false,
}: {
  children: ReactNode;
  className?: string;
  intensity?: number;
  disabled?: boolean;
}) {
  const rotateX = useSpring(0, { stiffness: 240, damping: 22, mass: 0.32 });
  const rotateY = useSpring(0, { stiffness: 240, damping: 22, mass: 0.32 });
  const glowX = useMotionValue(50);
  const glowY = useMotionValue(45);

  const spotlight = useMotionTemplate`radial-gradient(circle 170px at ${glowX}% ${glowY}%, rgba(255,255,255,.30), transparent 62%)`;

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    rotateX.set(((50 - y) / 50) * intensity);
    rotateY.set(((x - 50) / 50) * intensity);
    glowX.set(x);
    glowY.set(y);
  };

  const reset = () => {
    rotateX.set(0);
    rotateY.set(0);
    glowX.set(50);
    glowY.set(45);
  };

  return (
    <motion.div
      className={`relative [perspective:1200px] ${className}`.trim()}
      onPointerMove={move}
      onPointerLeave={reset}
      whileHover={disabled ? undefined : { y: -2 }}
      transition={{ type: "spring", stiffness: 240, damping: 22 }}
    >
      <motion.div
        className="relative h-full w-full"
        style={{
          rotateX: disabled ? 0 : rotateX,
          rotateY: disabled ? 0 : rotateY,
          transformStyle: "preserve-3d",
        }}
      >
        {children}
        {!disabled ? (
          <motion.div
            className="pointer-events-none absolute inset-0 z-40 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{ background: spotlight }}
          />
        ) : null}
      </motion.div>
    </motion.div>
  );
}
