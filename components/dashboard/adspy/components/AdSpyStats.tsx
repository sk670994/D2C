"use client";

import {
  Activity,
  ArrowUpRight,
  Check,
  Clock3,
  Image as ImageIcon,
  Layers3,
  UserRound,
  Video,
} from "lucide-react";
import { motion } from "framer-motion";
import type { Summary } from "../adspy-types";

const stats = [
  ["Ads", "totalAds", Activity],
  ["Active", "activeAds", Check],
  ["Video", "videoAds", Video],
  ["Image", "imageAds", ImageIcon],
  ["Carousel", "carouselAds", Layers3],
  ["Creators", "creatorAds", UserRound],
  ["Avg run", "averageRunningDays", Clock3],
  ["Longest", "longestRunningDays", ArrowUpRight],
] as const;

function formatValue(
  key: string,
  value: number,
) {
  return key.includes("RunningDays")
    ? `${value}d`
    : value.toLocaleString("en-IN");
}

function getHint(
  key: string,
  summary: Summary,
) {
  switch (key) {
    case "videoAds":
      return `${
        summary.totalAds
          ? Math.round(
              (summary.videoAds / summary.totalAds) * 100,
            )
          : 0
      }% of library`;

    case "activeAds":
      return `${summary.inactiveAds} inactive`;

    case "imageAds":
      return "Static creatives";

    case "creatorAds":
      return "Creator-linked";

    case "averageRunningDays":
      return "Observed duration";

    case "longestRunningDays":
      return "Observed persistence";

    default:
      return "Indexed creatives";
  }
}

export function AdSpyStats({
  summary,
}: {
  summary: Summary;
}) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
      {stats.map(([label, key, Icon], index) => {
        const rawValue = Number(summary[key] ?? 0);

        return (
          <motion.div
            key={label}
            initial={{
              opacity: 0,
              y: 6,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            transition={{
              duration: 0.24,
              delay: index * 0.035,
            }}
            className="group rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-950 text-white">
                  <Icon size={13} />
                </span>

                <span className="truncate">
                  {label}
                </span>
              </div>
            </div>

            <motion.div
              key={rawValue}
              initial={{
                opacity: 0.45,
                y: 4,
              }}
              animate={{
                opacity: 1,
                y: 0,
              }}
              transition={{
                duration: 0.22,
              }}
              className="mt-3 text-xl font-bold tracking-tight text-slate-950"
            >
              {formatValue(key, rawValue)}
            </motion.div>

            <div className="mt-0.5 truncate text-[10px] text-slate-500">
              {getHint(key, summary)}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}