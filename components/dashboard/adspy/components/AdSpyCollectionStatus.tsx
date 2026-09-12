import { AlertCircle, Loader2 } from "lucide-react";
import type { Job } from "../adspy-types";

export function AdSpyCollectionStatus({ job, error }: { job: Job | null; error?: string }) {
  if (!error && !job) return null;
  if (error) return <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle size={17} className="mt-0.5 shrink-0" /><span>{error}</span></div>;
  if (!job || job.status === "complete") return null;
  return <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800"><div className="flex items-center gap-2 font-bold"><Loader2 size={15} className="animate-spin" />Background collection in progress</div><div className="mt-1 text-xs text-blue-700">Discovered {job.discoveredAds} · persisted {job.persistedAds}. Results update as new creatives arrive.</div></div>;
}


