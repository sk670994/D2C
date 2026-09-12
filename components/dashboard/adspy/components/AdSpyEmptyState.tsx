import { Search } from "lucide-react";

export function AdSpyEmptyState({ query, collecting }: { query: string; collecting: boolean }) {
  return (
    <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Search size={22} /></div>
      <h3 className="mt-4 text-base font-bold text-slate-950">{query.trim().length < 2 ? "Start with an advertiser or keyword" : collecting ? "Collecting observable creatives…" : "No ads found in the current index"}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{query.trim().length < 2 ? "Search a brand to inspect its public advertising footprint. Selecting an advertiser uses its exact Meta Page ID when available." : collecting ? "The first results will appear as soon as the collector persists them." : "Try another advertiser, switch to keyword search, or refresh the dataset."}</p>
    </div>
  );
}

