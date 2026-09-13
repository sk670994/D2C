"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export function VengeanceAnimatedNumber({
  value,
  suffix = "",
  prefix = "",
  className = "",
}: {
  value: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}) {
  const formatted = Math.max(0, Math.round(value)).toLocaleString("en-IN");

  return (
    <div
      className={`flex items-baseline tabular-nums ${className}`.trim()}
      aria-label={`${prefix}${formatted}${suffix}`}
      data-adspy-framework="vengeance-animated-number"
    >
      {prefix ? <span className="mr-0.5 text-[0.72em] text-slate-400">{prefix}</span> : null}
      <div className="flex items-baseline">
        {formatted.split("").map((character, index) =>
          /\d/.test(character) ? (
            <RollingDigit key={`${index}-${character}`} value={character} />
          ) : (
            <span key={`${index}-${character}`} className="px-px">
              {character}
            </span>
          ),
        )}
      </div>
      {suffix ? <span className="ml-1 text-[0.66em] font-semibold text-slate-400">{suffix}</span> : null}
    </div>
  );
}

function RollingDigit({ value }: { value: string }) {
  const [height, setHeight] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const next = ref.current.getBoundingClientRect().height;
    if (next > 0) setHeight(next);
  }, []);

  return (
    <span ref={ref} className="relative inline-block overflow-hidden align-baseline">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          initial={{ y: height || 18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -(height || 18), opacity: 0 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="inline-block"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
