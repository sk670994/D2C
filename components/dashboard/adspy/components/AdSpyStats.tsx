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
import { AdSpyDepthCard } from "@/components/ui/adspy/AdSpyDepthCard";
import { VengeanceAnimatedNumber } from "@/components/ui/adspy/VengeanceAnimatedNumber";

const primary = [
  ["Ads", "totalAds", Activity, "Indexed creatives"],
  ["Active", "activeAds", Check, "Currently active"],
  ["Video", "videoAds", Video, "Video creatives"],
  ["Avg run", "averageRunningDays", Clock3, "Observed duration"],
  ["Longest", "longestRunningDays", ArrowUpRight, "Observed persistence"],
] as const;


function pct(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

export function AdSpyStats({ summary }: { summary: Summary }) {
  const total = Number(summary.totalAds ?? 0);
  const active = Number(summary.activeAds ?? 0);
  const video = Number(summary.videoAds ?? 0);
  const images = Number(summary.imageAds ?? 0);
  const carousels = Number(summary.carouselAds ?? 0);
  const creators = Number(summary.creatorAds ?? 0);
  const inactive = Number(summary.inactiveAds ?? Math.max(total - active, 0));

  return (
    <section data-adspy-framework="vengeance-kpi-depth" className="space-y-2.5">
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        {primary.map(([label, key, Icon, hint], index) => {
          const value = Number(summary[key] ?? 0);
          const isDays = key.includes("RunningDays");

          return (
            <AdSpyDepthCard key={label} intensity={5.5} className="group h-full">
              <motion.article
                initial={{ opacity: 0, y: 12, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  duration: 0.38,
                  delay: index * 0.055,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="h-full rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-[0_5px_20px_rgba(15,23,42,.045)] transition-shadow duration-300 group-hover:shadow-[0_18px_46px_rgba(15,23,42,.11)]"
              >
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-950 text-white">
                    <Icon size={12} />
                  </span>
                  <span className="truncate text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    {label}
                  </span>
                </div>

                <div className="mt-2.5 min-h-8 text-2xl font-bold tracking-[-0.035em] text-slate-950">
                  <VengeanceAnimatedNumber value={value} suffix={isDays ? "d" : ""} />
                </div>

                <div className="mt-0.5 truncate text-[10px] text-slate-500">{hint}</div>
              </motion.article>
            </AdSpyDepthCard>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_4px_18px_rgba(15,23,42,.035)]">
        <span className="mr-1 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">Library mix</span>

        <MetricChip icon={ImageIcon} label="Images" value={images} share={pct(images, total)} />
        <MetricChip icon={Layers3} label="Carousel" value={carousels} share={pct(carousels, total)} />
        <MetricChip icon={UserRound} label="Creators" value={creators} share={pct(creators, total)} />
        <MetricChip icon={Check} label="Active" value={active} share={pct(active, total)} />
        <MetricChip icon={Activity} label="Inactive" value={inactive} share={pct(inactive, total)} />
        <MetricChip icon={Video} label="Video" value={video} share={pct(video, total)} />
      </div>
    </section>
  );
}

function MetricChip({
  icon: Icon,
  label,
  value,
  share,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  share: number;
}) {
  return (
    <motion.div
      whileHover={{ y: -1, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-[10px] text-slate-600"
      title={`${label}: ${value.toLocaleString("en-IN")} · ${share}% of library`}
    >
      <Icon size={11} className="text-slate-500" />
      <span className="font-semibold">{label}</span>
      <span className="font-bold text-slate-950">{value.toLocaleString("en-IN")}</span>
      <span className="text-slate-400">{share}%</span>
    </motion.div>
  );
}
