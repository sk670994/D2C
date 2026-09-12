import { Activity, ArrowUpRight, Check, Clock3, Image as ImageIcon, Layers3, UserRound, Video } from "lucide-react";
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

export function AdSpyStats({ summary }: { summary: Summary }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
      {stats.map(([label, key, Icon]) => {
        const value = summary[key];
        const display = key.includes("RunningDays") ? `${value}d` : value;
        const hint = key === "videoAds" ? `${summary.totalAds ? Math.round((summary.videoAds / summary.totalAds) * 100) : 0}% mix` : key === "activeAds" ? `${summary.inactiveAds} inactive` : key === "imageAds" ? "Static creatives" : key === "creatorAds" ? "Creator-linked" : key === "averageRunningDays" ? "Observed duration" : key === "longestRunningDays" ? "Observed persistence" : "Indexed creatives";
        return (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400"><span className="grid h-8 w-8 place-items-center rounded-xl bg-slate-950 text-white"><Icon size={15} /></span>{label}</div>
            <div className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{display}</div>
            <div className="mt-1 text-xs text-slate-500">{hint}</div>
          </div>
        );
      })}
    </div>
  );
}


