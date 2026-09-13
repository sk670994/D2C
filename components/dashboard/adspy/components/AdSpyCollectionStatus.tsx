import {
  AlertCircle,
  Lightbulb,
  Loader2,
} from "lucide-react";

import type {
  Job,
} from "../adspy-types";

const RESEARCH_MESSAGES = [
  {
    type: "Market note",
    text: "Creative persistence is an observation of continued visibility, not proof of performance.",
  },
  {
    type: "Research tip",
    text: "Compare hooks, offers and creators separately. A brand can reuse one while testing another.",
  },
  {
    type: "Zooptrack",
    text: "Zooptrack keeps public observations separate from invented ROAS, reach or conversion claims.",
  },
  {
    type: "Market fact",
    text: "A creative that survives several collection cycles is worth studying for messaging consistency.",
  },
  {
    type: "Quick thought",
    text: "The strongest competitor signal is often not one ad. It is the pattern across many ads.",
  },
  {
    type: "Santa Banta",
    text: "Santa asked why Banta's ad was still running. Banta said, “Because the creative forgot to retire.” 😄",
  },
  {
    type: "Research tip",
    text: "Look for repeated language before looking for repeated formats. The message often tells you more.",
  },
  {
    type: "Zooptrack",
    text: "New creatives arriving during a crawl expand the research set without blocking the interface.",
  },
];

export function AdSpyCollectionStatus({
  job,
  error,
}: {
  job: Job | null;
  error?: string;
}) {
  if (
    error
  ) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <AlertCircle
          size={16}
          className="mt-0.5 shrink-0"
        />

        <span>
          {error}
        </span>
      </div>
    );
  }

  if (
    !job ||
    job.status ===
      "complete"
  ) {
    return null;
  }

  const messageIndex =
    Math.max(
      Number(
        job.discoveredAds ??
          0,
      ),
      Number(
        job.persistedAds ??
          0,
      ),
    ) %
    RESEARCH_MESSAGES.length;

  const message =
    RESEARCH_MESSAGES[
      messageIndex
    ];

  const discovered =
    Number(
      job.discoveredAds ??
        0,
    );

  const persisted =
    Number(
      job.persistedAds ??
        0,
    );

  const normalized =
    Number(
      job.normalizedAds ??
        0,
    );

  return (
    <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-slate-50">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-slate-700 shadow-sm">
          <Loader2
            size={17}
            className="animate-spin"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs font-bold text-slate-900">
              Building your creative map
            </span>

            <span className="text-[10px] font-medium text-slate-400">
              {discovered} discovered
              {" · "}
              {normalized} normalized
              {" · "}
              {persisted} persisted
            </span>
          </div>

          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-slate-400" />
          </div>
        </div>

        <div className="max-w-md shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
            <Lightbulb
              size={11}
            />

            {message.type}
          </div>

          <p className="mt-1 text-[11px] leading-5 text-slate-600">
            {message.text}
          </p>
        </div>
      </div>
    </div>
  );
}