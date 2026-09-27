"use client";

import { animate, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { formatInt } from "./parts";

const EASE = [0.22, 1, 0.36, 1] as const;

type RiseTag = "div" | "article" | "section";

/**
 * Fades a block up into place. `i` staggers siblings (60 ms apart, capped),
 * so a list of cards arrives in reading order. No motion when the user
 * asks the OS for reduced motion.
 */
export function Rise({
  as = "div",
  i = 0,
  className,
  style,
  children,
  ...rest
}: {
  as?: RiseTag;
  i?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  "aria-labelledby"?: string;
  "aria-label"?: string;
  id?: string;
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  if (reduce) {
    const Plain = as;
    return (
      <Plain className={className} style={style} {...rest}>
        {children}
      </Plain>
    );
  }
  return (
    <Tag
      className={className}
      style={style}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay: Math.min(i, 8) * 0.06 }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Counts a number up from 0. Screen readers get the final value only. */
export function CountUp({ value, prefix = "", suffix = "", format = formatInt }: { value: number; prefix?: string; suffix?: string; format?: (n: number) => string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);

  useEffect(() => {
    if (reduce || !Number.isFinite(value) || value === 0) {
      setShown(value);
      return;
    }
    const controls = animate(0, value, { duration: Math.min(1.1, 0.5 + Math.log10(Math.abs(value) + 1) * 0.15), ease: EASE, onUpdate: setShown });
    return () => controls.stop();
  }, [reduce, value]);

  const final = `${prefix}${format(value)}${suffix}`;
  return (
    <>
      <span aria-hidden="true">{`${prefix}${format(shown)}${suffix}`}</span>
      <span className="zd-sr">{final}</span>
    </>
  );
}

/** The fill inside a .zd-bar, growing from 0 to `pct`. */
export function GrowBar({ pct, delay = 0 }: { pct: number; delay?: number }) {
  const reduce = useReducedMotion();
  const width = `${Math.max(0, Math.min(100, pct))}%`;
  if (reduce) return <span style={{ width }} />;
  return <motion.span initial={{ width: 0 }} animate={{ width }} transition={{ duration: 0.9, ease: EASE, delay }} />;
}

/** One bar of a .zd-spark chart, rising from the baseline. */
export function SparkBar({ height, i, className, title }: { height: string; i: number; className?: string; title?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <span className={className} style={{ height }} title={title} />;
  return (
    <motion.span
      className={className}
      title={title}
      style={{ height, transformOrigin: "bottom" }}
      initial={{ scaleY: 0 }}
      animate={{ scaleY: 1 }}
      transition={{ duration: 0.5, ease: EASE, delay: 0.15 + i * 0.03 }}
    />
  );
}
