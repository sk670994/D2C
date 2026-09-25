"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  BrandEconomics,
  BrandVaultAnalytics,
  BrandVaultCompetitor,
  BrandVaultPeriod,
  BrandVaultProData,
  ChangeItem,
  CompetitorAnalytics,
  OfferItem,
  ProductPressure,
  RankedItem,
} from "@/lib/brand-vault/types";

const PERIODS: Array<{ key: BrandVaultPeriod; label: string }> = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "quarter", label: "3 months" },
];

const NAV = [
  { key: "overview", label: "Overview", group: "Insights" },
  { key: "hooks", label: "Top hooks", group: "Insights" },
  { key: "creators", label: "Top creators", group: "Insights" },
  { key: "changes", label: "Changes", group: "Insights" },
  { key: "products", label: "Most pushed products", group: "Insights" },
  { key: "languages", label: "Top languages", group: "Insights" },
  { key: "offers", label: "Offers", group: "Insights" },
  { key: "compare", label: "Compare all 3", group: "Tools" },
  { key: "digest", label: "Monday digest", group: "Tools" },
  { key: "budget", label: "Budget planner", group: "Tools", badge: "Pro+" },
] as const;

type NavKey = (typeof NAV)[number]["key"];
type Focus = "all" | 1 | 2 | 3;

const EMPTY_ECONOMICS: BrandEconomics = {
  sellingPrice: null,
  cogs: null,
  packagingCost: null,
  shippingCost: null,
  paymentFeePercent: null,
  paymentFeeFixed: null,
  rtoRatePercent: null,
  rtoCost: null,
  refundAllowancePercent: null,
  targetContributionMarginPercent: null,
};

function money(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "�";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function daysLabel(date: string | null) {
  if (!date) return "�";
  const diff = Math.max(0, Date.now() - new Date(date).getTime());
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}

function cleanName(value: string | null | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function demoAd(id: string, competitor: string, label: string, kind: ChangeItem["type"]): ChangeItem {
  return {
    type: kind,
    label,
    detail: `${competitor}: indexed creative signal in the selected period.`,
    count: kind === "retired" ? 12 : 1,
    provenance: kind === "new_message" ? "Heuristic" : "Derived",
    supportingAds: [
      {
        id,
        productName: "Hero SKU",
        hook: label,
        creatorName: null,
        offer: kind === "new_offer" ? "20% off" : null,
        price: null,
        creativeType: "video",
        firstSeenAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        lastSeenAt: new Date().toISOString(),
        runningDays: 2,
        active: kind !== "retired",
        sourceUrl: null,
        thumbnailUrl: null,
        provenance: "Derived",
        heuristicLabel: kind === "retired" ? "Stopped" : "New test",
      },
    ],
  };
}

function makeDemoCompetitor(slot: 1 | 2 | 3, name: string, ads: number, newAds: number, color: string): CompetitorAnalytics & { dot: string } {
  const changes = [
    slot === 1 ? demoAd(`${slot}-1`, name, 'Launched 6 UGC videos on a new "night routine" angle', "new_test") : demoAd(`${slot}-1`, name, `Started a new ${slot === 2 ? '"Flat 30% till midnight"' : 'creator-led'} campaign`, "new_test"),
    slot === 1 ? demoAd(`${slot}-2`, name, "Moved from 20% off to Buy 2 Get 1 on sunscreen", "new_offer") : demoAd(`${slot}-2`, name, slot === 2 ? 'Started a "Flat 30% till midnight" flash sale' : "Added free gift + prepaid discount 10%", "new_offer"),
    slot === 2 ? demoAd(`${slot}-3`, name, "Stopped 12 ads, mostly carousels", "retired") : demoAd(`${slot}-3`, name, `${newAds} new ads this week, highest in your set`, "new_test"),
  ];
  const topHooks: RankedItem[] = [
    { label: slot === 1 ? "A better night routine" : slot === 2 ? "Clinically tested" : "Made for Indian skin", count: 18 - slot, share: 18 - slot, provenance: "Derived" },
    { label: slot === 1 ? "Glow without compromise" : slot === 2 ? "Flat 30% tonight" : "Your everyday essential", count: 13 - slot, share: 13 - slot, provenance: "Derived" },
    { label: slot === 1 ? "UGC routine" : slot === 2 ? "Derm-tested" : "Creator review", count: 9, share: 9, provenance: "Derived" },
  ];
  const topCreators: RankedItem[] = [
    { label: slot === 1 ? "Aisha Rao" : slot === 2 ? "Riya Menon" : "Naina Sharma", count: 8, share: 8, provenance: "Source" },
    { label: slot === 1 ? "Mehak Jain" : slot === 2 ? "Pooja Arora" : "Isha Kapoor", count: 6, share: 6, provenance: "Source" },
    { label: slot === 1 ? "Simran Kohli" : slot === 2 ? "Anushka Verma" : "Tanya Gill", count: 5, share: 5, provenance: "Source" },
  ];
  const topLanguages: RankedItem[] = [
    { label: "English", count: 41, share: 41, provenance: "Heuristic" },
    { label: "Hindi", count: 28, share: 28, provenance: "Heuristic" },
    { label: "Hinglish", count: 17, share: 17, provenance: "Heuristic" },
    { label: "Tamil", count: 8, share: 8, provenance: "Heuristic" },
    { label: "Telugu", count: 6, share: 6, provenance: "Heuristic" },
  ];
  const topProducts: ProductPressure[] = [
    { product: slot === 1 ? "Sunscreen SPF 50" : slot === 2 ? "Barrier Repair Cream" : "Vitamin C Serum", ads: ads, activeAds: Math.round(ads * 0.7), persistent60: Math.round(ads * 0.35), share: 42, provenance: "Derived", supportingAds: [] },
    { product: slot === 1 ? "Niacinamide Serum" : slot === 2 ? "Face Wash" : "Daily Moisturizer", ads: Math.round(ads * 0.6), activeAds: Math.round(ads * 0.4), persistent60: Math.round(ads * 0.2), share: 25, provenance: "Derived", supportingAds: [] },
    { product: slot === 1 ? "Moisturizer" : slot === 2 ? "SPF 50" : "Lip Balm", ads: Math.round(ads * 0.4), activeAds: Math.round(ads * 0.28), persistent60: Math.round(ads * 0.12), share: 16, provenance: "Derived", supportingAds: [] },
  ];
  const topOffers: OfferItem[] = [
    { label: slot === 1 ? "Buy 2 Get 1" : slot === 2 ? "Flat 30% off" : "Free gift + 10% prepaid", count: 12, share: 15, visiblePrice: 899, vsBreakEven: 412, relation: "above", provenance: "Derived" },
    { label: "20% off", count: 8, share: 10, visiblePrice: 799, vsBreakEven: 387, relation: "above", provenance: "Derived" },
    { label: "Combo discount", count: 6, share: 8, visiblePrice: 699, vsBreakEven: 420, relation: "above", provenance: "Derived" },
  ];
  const running = Math.round(ads * 0.72);
  return {
    slot,
    name,
    pageId: null,
    country: "IN",
    periodDays: 7,
    lastObservedAt: new Date().toISOString(),
    totalAds: ads,
    activeAds: running,
    newTests: newAds,
    newOffers: slot === 1 ? 5 : slot === 2 ? 7 : 4,
    newMessages: slot === 3 ? 6 : 4,
    retiredAds: slot === 2 ? 12 : 4,
    persistent30: Math.round(ads * 0.46),
    persistent60: Math.round(ads * 0.26),
    persistent90: Math.round(ads * 0.11),
    topHooks,
    topCreators,
    topLanguages,
    topProducts,
    topOffers,
    changes,
    winnersBoard: [],
    stoppedWithin7Days: [],
    angleCoverage: {},
    usedCreatorNames: topCreators.map((x) => x.label),
    usedLanguageCodes: topLanguages.map((x) => x.label),
    dataCoverage: "strong",
    dot: color,
  };
}

const DEMO_ANALYTICS: BrandVaultAnalytics = {
  period: "week",
  generatedAt: new Date().toISOString(),
  breakEvenPrice: 412,
  targetMarginPrice: 699,
  contributionBeforeAds: 317,
  competitors: [
    makeDemoCompetitor(1, "Glowlab", 142, 18, "blue"),
    makeDemoCompetitor(2, "Dermique", 88, 7, "amber"),
    makeDemoCompetitor(3, "Rootsy", 64, 21, "purple"),
  ],
  compareRows: [
    { slot: 1, name: "Glowlab", totalAds: 142, activeAds: 104, newTests: 18, persistent60: 37, topProduct: "Sunscreen SPF 50", topHook: "A better night routine", topCreator: "Aisha Rao", topLanguage: "English" },
    { slot: 2, name: "Dermique", totalAds: 88, activeAds: 64, newTests: 7, persistent60: 23, topProduct: "Barrier Repair Cream", topHook: "Clinically tested", topCreator: "Riya Menon", topLanguage: "English" },
    { slot: 3, name: "Rootsy", totalAds: 64, activeAds: 46, newTests: 21, persistent60: 17, topProduct: "Vitamin C Serum", topHook: "Made for Indian skin", topCreator: "Naina Sharma", topLanguage: "Hindi" },
  ],
  gaps: { angles: ["regional UGC", "overnight repair"], creators: ["Tamil UGC", "Telugu UGC"], languages: ["Marathi", "Bengali"] },
  mondayDigest: {
    headline: "Rootsy is testing hardest; Dermique is cutting ads and discounting deeper.",
    lines: [
      "Glowlab: launched 6 UGC videos on a new \"night routine\" angle 2 days ago.",
      "Glowlab: moved from 20% off to Buy 2 Get 1 on sunscreen 3 days ago.",
      "Dermique: started a \"Flat 30% till midnight\" flash sale 1 day ago.",
      "Dermique: stopped 12 ads, mostly carousels, 4 days ago.",
      "Rootsy: 21 new ads this week, highest in your set.",
      "Rootsy: added free gift (comb) + prepaid discount 10% 2 days ago.",
    ],
    changes: [],
  },
  counterBrief: "Two rivals now lead with clinically tested claims and nobody uses Tamil or Telugu creators yet. Brief 3 regional UGC ads on your best-selling SKU, priced above your ?412 break-even.",
};

function normalizeResponse(body: BrandVaultProData): BrandVaultProData {
  return {
    ...body,
    analytics: body.analytics ?? DEMO_ANALYTICS,
  };
}

export default function BrandVaultPage() {
  const [data, setData] = useState<BrandVaultProData | null>(null);
  const [period, setPeriod] = useState<BrandVaultPeriod>("week");
  const [focus, setFocus] = useState<Focus>("all");
  const [section, setSection] = useState<NavKey>("overview");
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (nextPeriod: BrandVaultPeriod) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/brand-vault/pro?period=${nextPeriod}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || "Unable to load Brand Vault Pro.");
      setData(normalizeResponse(body as BrandVaultProData));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load Brand Vault Pro.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load("week"); }, [load]);

  const realAnalytics = data?.analytics;
  const isDemo = !data?.competitors?.length;
  const analytics = isDemo ? DEMO_ANALYTICS : realAnalytics ?? DEMO_ANALYTICS;

  const competitors = useMemo(() => {
    if (isDemo) return analytics.competitors;
    return analytics.competitors;
  }, [analytics, isDemo]);

  const visibleCompetitors = useMemo(() => {
    if (focus === "all") return competitors;
    return competitors.filter((item) => item.slot === focus);
  }, [competitors, focus]);

  const activeBrandName = cleanName(data?.brandVault?.brandName, "Your brand");

  const openSection = (next: NavKey) => setSection(next);

  async function saveAction(actionType: "save" | "brief" | "alert", referenceKey: string, title: string, payload: Record<string, unknown>) {
    try {
      const response = await fetch("/api/brand-vault/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType, referenceKey, title, payload }),
      });
      if (!response.ok) throw new Error("Could not save this action.");
      setNotice(actionType === "brief" ? "Brief saved to Brand Vault." : actionType === "alert" ? "Alert saved." : "Saved to Brand Vault.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this action.");
    }
  }

  function openWhatsApp() {
    const text = [analytics.mondayDigest.headline, ...analytics.mondayDigest.lines].join("\n\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <main className="bvp-screen">
      <div className="bvp-shell">
        <header className="bvp-shell-header">
          <button className="bvp-brand-switch" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen}>
            <span>Brand Vault Pro</span><span className="bvp-chevron">?</span>
          </button>
          {menuOpen ? (
            <div className="bvp-brand-menu">
              <button onClick={() => { setMenuOpen(false); setSettingsOpen(true); }}>Edit vault</button>
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/adspy">AdSpy</Link>
            </div>
          ) : null}
          <div className="bvp-shell-tools"><Link href="/zwirk">ZWIRK</Link></div>
        </header>

        <div className="bvp-breadcrumb-bar">
          <div className="bvp-breadcrumb"><strong>zooptrack</strong><span>Brand Vault</span><span className="bvp-breadcrumb-sep">�</span><strong>{NAV.find((item) => item.key === section)?.label ?? "Overview"}</strong></div>
          <div className={`bvp-data-badge ${isDemo ? "demo" : "live"}`}>{isDemo ? "Example data" : "Indexed data"}</div>
        </div>

        {notice ? <div className="bvp-notice">{notice}<button onClick={() => setNotice("")}>�</button></div> : null}
        {error ? <div className="bvp-notice error">{error}<button onClick={() => setError("")}>�</button></div> : null}

        <div className="bvp-layout">
          <aside className="bvp-sidebar">
            <div className="bvp-sidebar-group">
              <div className="bvp-sidebar-title">Insights</div>
              {NAV.filter((item) => item.group === "Insights").map((item) => (
                <button key={item.key} className={`bvp-nav-item ${section === item.key ? "active" : ""}`} onClick={() => setSection(item.key)}>{item.label}</button>
              ))}
            </div>
            <div className="bvp-sidebar-group">
              <div className="bvp-sidebar-title">Tools</div>
              {NAV.filter((item) => item.group === "Tools").map((item) => (
                <button key={item.key} className={`bvp-nav-item ${section === item.key ? "active" : ""}`} onClick={() => setSection(item.key)}>
                  <span>{item.label}</span>{"badge" in item && item.badge ? <span className="bvp-pro-badge">{item.badge}</span> : null}
                </button>
              ))}
            </div>
          </aside>

          <section className="bvp-content">
            <div className="bvp-control-row">
              <div className="bvp-chip-row">
                <button className={`bvp-chip all ${focus === "all" ? "active" : ""}`} onClick={() => setFocus("all")}>All 3</button>
                {competitors.map((item) => (
                  <button key={item.slot} className={`bvp-chip ${focus === item.slot ? "active" : ""}`} onClick={() => setFocus(item.slot)}>
                    <span className={`bvp-dot dot-${item.slot}`} />{item.name}
                  </button>
                ))}
              </div>
              <div className="bvp-period-switch">
                {PERIODS.map((item) => (
                  <button key={item.key} className={period === item.key ? "active" : ""} onClick={() => { setPeriod(item.key); void load(item.key); }}>{item.label}</button>
                ))}
              </div>
            </div>

            {loading ? <div className="bvp-loading">Updating your competitive memory�</div> : <WorkspaceSection section={section} analytics={analytics} visibleCompetitors={visibleCompetitors} focus={focus} saveAction={saveAction} openWhatsApp={openWhatsApp} activeBrandName={activeBrandName} openSection={openSection} />}
          </section>
        </div>
      </div>

      {settingsOpen ? <VaultSettings data={data} onClose={() => setSettingsOpen(false)} onSaved={async () => { setSettingsOpen(false); await load(period); }} /> : null}
    </main>
  );
}

function WorkspaceSection({ section, analytics, visibleCompetitors, focus, saveAction, openWhatsApp, activeBrandName, openSection }: {
  section: NavKey;
  analytics: BrandVaultAnalytics;
  visibleCompetitors: CompetitorAnalytics[];
  focus: Focus;
  saveAction: (actionType: "save" | "brief" | "alert", referenceKey: string, title: string, payload: Record<string, unknown>) => Promise<void>;
  openWhatsApp: () => void;
  activeBrandName: string;
  openSection: (section: NavKey) => void;
}) {
  switch (section) {
    case "overview":
      return <OverviewSection analytics={analytics} competitors={visibleCompetitors} focus={focus} saveAction={saveAction} openWhatsApp={openWhatsApp} activeBrandName={activeBrandName} openSection={openSection} />;
    case "hooks":
      return <RankedSection title="Top hooks" eyebrow="TOP HOOKS" description="Which opening lines keep getting reused and live?" items={visibleCompetitors.flatMap((c) => c.topHooks.slice(0, 8).map((x) => ({ ...x, label: `${c.name}: ${x.label}` })))} />;
    case "creators":
      return <RankedSection title="Top creators" eyebrow="TOP CREATORS" description="Which creators do they rely on, and who is new?" items={visibleCompetitors.flatMap((c) => c.topCreators.slice(0, 8).map((x) => ({ ...x, label: `${c.name}: ${x.label}` })))} />;
    case "changes":
      return <ChangesSection competitors={visibleCompetitors} saveAction={saveAction} />;
    case "products":
      return <ProductsSection competitors={visibleCompetitors} />;
    case "languages":
      return <LanguagesSection competitors={visibleCompetitors} />;
    case "offers":
      return <OffersSection competitors={visibleCompetitors} analytics={analytics} />;
    case "compare":
      return <CompareSection analytics={analytics} />;
    case "digest":
      return <DigestSection analytics={analytics} openWhatsApp={openWhatsApp} saveAction={saveAction} />;
    case "budget":
      return <BudgetSection analytics={analytics} />;
  }
}

function OverviewSection({ analytics, competitors, focus, saveAction, openWhatsApp, activeBrandName, openSection }: { analytics: BrandVaultAnalytics; competitors: CompetitorAnalytics[]; focus: Focus; saveAction: WorkspaceSectionProps["saveAction"]; openWhatsApp: () => void; activeBrandName: string; openSection: (section: NavKey) => void }) {
  const changes = competitors.flatMap((c) => c.changes.map((change) => ({ competitor: c.name, slot: c.slot, ...change }))).slice(0, 8);
  const testingLeader = competitors.reduce<CompetitorAnalytics | null>((leader, item) => !leader || item.newTests > leader.newTests ? item : leader, null);
  const offerLeader = competitors.reduce<CompetitorAnalytics | null>((leader, item) => !leader || item.newOffers > leader.newOffers ? item : leader, null);
  const headline = competitors.length && focus === "all"
    ? `This ${analytics.period === "week" ? "week" : analytics.period === "month" ? "month" : "3-month period"} in one line: ${testingLeader?.name ?? "The set"} has the most new-test signals; ${offerLeader?.name ?? "one rival"} has the most new-offer signals.`
    : competitors.length
      ? `${competitors[0].name} is the current focus. ${competitors[0].newTests} new test signals surfaced in this period.`
      : "Add a competitor to begin your market read.";
  return (
    <div className="bvp-stack">
      <div className="bvp-kpi-grid">
        {competitors.map((item) => <article key={item.slot} className="bvp-kpi-card"><div className="bvp-kpi-brand"><span className={`bvp-dot dot-${item.slot}`} />{item.name} � active ads</div><strong>{item.activeAds}</strong><span className="bvp-kpi-delta">+{item.newTests} new this week</span></article>)}
      </div>
      {!competitors.length ? <div className="bvp-empty-card"><h2>Set your 3 competitors</h2><p>Your workspace is ready. Add the exact Meta Page IDs from Edit vault and the indexed history will appear here.</p></div> : null}
      {competitors.length ? <section className="bvp-card bvp-change-feed">
        <div className="bvp-section-line"><h2>{headline}</h2><Provenance label="Derived" /></div>
        {changes.map((change, index) => <ChangeFeedRow key={`${change.slot}-${change.type}-${change.label}-${index}`} change={change} saveAction={saveAction} />)}
        <div className="bvp-feed-actions"><button className="bvp-primary" onClick={openWhatsApp}>Send to WhatsApp</button><button className="bvp-secondary" onClick={() => openSection("changes")}>Open full changes</button></div>
      </section> : null}
      {competitors.length ? <section className="bvp-card bvp-next-move"><div className="bvp-next-head"><h2>Your next move</h2><Provenance label="Heuristic" /></div><p>{buildNextMove(analytics, competitors)}</p><button className="bvp-primary" onClick={() => void saveAction("brief", "counter-brief", "Counter-brief", { text: analytics.counterBrief, brand: activeBrandName })}>Write brief with ZWIRK</button></section> : null}
    </div>
  );
}

type WorkspaceSectionProps = { saveAction: (actionType: "save" | "brief" | "alert", referenceKey: string, title: string, payload: Record<string, unknown>) => Promise<void> };

function buildNextMove(analytics: BrandVaultAnalytics, competitors: CompetitorAnalytics[]) {
  if (analytics.gaps.creators.length || analytics.gaps.languages.length) {
    const creator = analytics.gaps.creators[0] ?? "regional UGC";
    const language = analytics.gaps.languages[0] ?? "a regional language";
    return `Two rivals now lead with repeated creative signals. Nobody in this set is visibly using ${language} creators yet. Brief 3 ${creator.toLowerCase()} ads on your best-selling SKU, priced above your ${money(analytics.breakEvenPrice)} break-even.`;
  }
  const top = competitors[0]?.topProducts[0]?.product ?? "your best-selling SKU";
  return `Pressure-test ${top} with a new angle while keeping the offer above your ${money(analytics.breakEvenPrice)} break-even.`;
}

function ChangeFeedRow({ change, saveAction }: { change: ChangeItem & { competitor: string; slot: 1 | 2 | 3 }; saveAction: WorkspaceSectionProps["saveAction"] }) {
  const badge = change.type === "new_test" ? "New test" : change.type === "new_offer" ? "New offer" : change.type === "new_message" ? "New message" : "Stopped";
  return <div className="bvp-feed-row"><div className="bvp-feed-main"><span className={`bvp-dot dot-${change.slot}`} /><div><strong>{change.competitor}: </strong><span>{change.label}</span><small>{daysLabel(change.supportingAds[0]?.firstSeenAt ?? null)}</small></div></div><div className={`bvp-signal-badge ${change.type}`}>{badge}</div><button className="bvp-row-save" onClick={() => void saveAction("save", `change:${change.slot}:${change.type}:${change.label}`, `${change.competitor}: ${change.label}`, change as unknown as Record<string, unknown>)}>Save</button></div>;
}

function RankedSection({ title, eyebrow, description, items }: { title: string; eyebrow: string; description: string; items: RankedItem[] }) {
  return <section className="bvp-card bvp-module"><div className="bvp-module-head"><div><div className="bvp-eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div></div>{items.length ? items.map((item, index) => <div className="bvp-rank-row" key={`${item.label}-${index}`}><span className="bvp-rank-number">{index + 1}</span><div><strong>{item.label}</strong><small>{item.count} ads � {item.share}% � {item.provenance}</small></div><button className="bvp-row-save">Save</button></div>) : <EmptyText />}</section>;
}

function ChangesSection({ competitors, saveAction }: { competitors: CompetitorAnalytics[]; saveAction: WorkspaceSectionProps["saveAction"] }) {
  return <section className="bvp-card bvp-module"><div className="bvp-module-head"><div><div className="bvp-eyebrow">CHANGES � WoW / MoM</div><h1>What they started and stopped testing</h1><p>New test, new offer, new message and stopped creative families. The labels stay derived from indexed observations.</p></div></div><div className="bvp-change-grid">{competitors.map((competitor) => <div className="bvp-change-column" key={competitor.slot}><div className="bvp-column-title"><span className={`bvp-dot dot-${competitor.slot}`} />{competitor.name}</div>{competitor.changes.map((change, index) => <div className="bvp-change-item" key={`${change.type}-${change.label}-${index}`}><div><span className={`bvp-signal-badge ${change.type}`}>{change.type === "retired" ? "Stopped" : change.type.replace("_", " ")}</span><strong>{change.label}</strong><small>{change.detail}</small></div><button className="bvp-row-save" onClick={() => void saveAction("save", `change:${competitor.slot}:${change.type}:${change.label}`, `${competitor.name}: ${change.label}`, change as unknown as Record<string, unknown>)}>Save</button></div>)}</div>)}</div></section>;
}

function ProductsSection({ competitors }: { competitors: CompetitorAnalytics[] }) {
  return <section className="bvp-card bvp-module"><div className="bvp-module-head"><div><div className="bvp-eyebrow">MOST PUSHED PRODUCTS</div><h1>Which products get the most ad pressure?</h1><p>Ads are attention, not sales. Long-running creatives are shown as a persistence heuristic.</p></div></div><div className="bvp-product-grid">{competitors.map((competitor) => <div key={competitor.slot}><div className="bvp-column-title"><span className={`bvp-dot dot-${competitor.slot}`} />{competitor.name}</div>{competitor.topProducts.slice(0, 6).map((item) => <ProductRow key={item.product} item={item} />)}</div>)}</div></section>;
}

function ProductRow({ item }: { item: ProductPressure }) {
  return <div className="bvp-product-row"><div><strong>{item.product}</strong><small>{item.ads} ads � {item.activeAds} active � {item.persistent60} persistent 60d</small></div><b>{item.share}%</b></div>;
}

function LanguagesSection({ competitors }: { competitors: CompetitorAnalytics[] }) {
  return <section className="bvp-card bvp-module"><div className="bvp-module-head"><div><div className="bvp-eyebrow">TOP 5 LANGUAGES</div><h1>Who are they talking to?</h1><p>Language is inferred from the ad copy and remains a heuristic signal, especially for Hinglish.</p></div></div><div className="bvp-language-grid">{competitors.map((competitor) => <div key={competitor.slot}><div className="bvp-column-title"><span className={`bvp-dot dot-${competitor.slot}`} />{competitor.name}</div>{competitor.topLanguages.slice(0, 5).map((item, index) => <div className="bvp-rank-row compact" key={`${item.label}-${index}`}><span className="bvp-rank-number">{index + 1}</span><div><strong>{item.label}</strong><small>{item.share}% of recent ads � {item.provenance}</small></div></div>)}</div>)}</div></section>;
}

function OffersSection({ competitors, analytics }: { competitors: CompetitorAnalytics[]; analytics: BrandVaultAnalytics }) {
  return <section className="bvp-card bvp-module"><div className="bvp-module-head"><div><div className="bvp-eyebrow">OFFERS</div><h1>How hard are they discounting, and can you match it?</h1><p>Effective public prices are compared with your Vault break-even. This does not imply competitor profitability.</p></div><div className="bvp-floor-pill">Your break-even {money(analytics.breakEvenPrice)}</div></div><div className="bvp-offer-grid">{competitors.map((competitor) => <div key={competitor.slot}><div className="bvp-column-title"><span className={`bvp-dot dot-${competitor.slot}`} />{competitor.name}</div>{competitor.topOffers.slice(0, 6).map((offer, index) => <OfferRow offer={offer} key={`${offer.label}-${index}`} />)}</div>)}</div></section>;
}

function OfferRow({ offer }: { offer: OfferItem }) {
  const label = offer.relation === "below" ? "Below floor" : offer.relation === "near" ? "Near floor" : offer.relation === "above" ? "Above floor" : "Unknown";
  return <div className="bvp-offer-row"><div><strong>{offer.label}</strong><small>{offer.count} ads � {offer.visiblePrice == null ? "price not visible" : money(offer.visiblePrice)}</small></div><em className={`relation-${offer.relation}`}>{label}</em></div>;
}

function CompareSection({ analytics }: { analytics: BrandVaultAnalytics }) {
  return <section className="bvp-card bvp-module"><div className="bvp-module-head"><div><div className="bvp-eyebrow">COMPARE ALL 3</div><h1>One market set, side by side.</h1><p>Every row is a derived view over the same indexed advertiser history.</p></div></div><div className="bvp-table-wrap"><table className="bvp-table"><thead><tr><th>Competitor</th><th>Ads</th><th>Active</th><th>New tests</th><th>60d</th><th>Top product</th><th>Top hook</th><th>Top creator</th><th>Top language</th></tr></thead><tbody>{analytics.compareRows.map((row) => <tr key={row.slot}><td><span className={`bvp-dot dot-${row.slot}`} /> <strong>{row.name}</strong></td><td>{row.totalAds}</td><td>{row.activeAds}</td><td>{row.newTests}</td><td>{row.persistent60}</td><td>{row.topProduct ?? "�"}</td><td>{row.topHook ?? "�"}</td><td>{row.topCreator ?? "�"}</td><td>{row.topLanguage ?? "�"}</td></tr>)}</tbody></table></div></section>;
}

function DigestSection({ analytics, openWhatsApp, saveAction }: { analytics: BrandVaultAnalytics; openWhatsApp: () => void; saveAction: WorkspaceSectionProps["saveAction"] }) {
  return <div className="bvp-stack"><section className="bvp-card bvp-digest-card"><div className="bvp-module-head"><div><div className="bvp-eyebrow">MONDAY DIGEST</div><h1>{analytics.mondayDigest.headline}</h1><p>Readable in under 2 minutes. Evidence is drawn from the selected comparison window.</p></div></div>{analytics.mondayDigest.lines.map((line) => <p className="bvp-digest-line" key={line}>{line}</p>)}<div className="bvp-feed-actions"><button className="bvp-primary" onClick={openWhatsApp}>Send to WhatsApp</button><button className="bvp-secondary" onClick={() => void saveAction("save", "monday-digest", "Monday digest", analytics.mondayDigest as unknown as Record<string, unknown>)}>Save digest</button></div></section><section className="bvp-card bvp-next-move"><div className="bvp-next-head"><h2>Counter-brief</h2><Provenance label="Heuristic" /></div><p>{analytics.counterBrief}</p><button className="bvp-primary" onClick={() => void saveAction("brief", "counter-brief", "Counter-brief", { text: analytics.counterBrief })}>Write brief with ZWIRK</button></section></div>;
}

function BudgetSection({ analytics }: { analytics: BrandVaultAnalytics }) {
  return <section className="bvp-card bvp-module"><div className="bvp-paywall"><div><div className="bvp-eyebrow">BUDGET PLANNER</div><h1>Build a budget from your own economics.</h1><p>Pro+ turns your Vault economics and market pressure signals into an RTO-adjusted budget and ad-set plan.</p></div><span className="bvp-pro-badge large">Pro+</span></div><div className="bvp-budget-preview"><div><span>Break-even</span><strong>{money(analytics.breakEvenPrice)}</strong></div><div><span>Target margin</span><strong>{money(analytics.targetMarginPrice)}</strong></div><div><span>Contribution before ads</span><strong>{money(analytics.contributionBeforeAds)}</strong></div></div><button className="bvp-secondary">Unlock Budget Planner</button></section>;
}

function Provenance({ label }: { label: "Source" | "Derived" | "Heuristic" }) {
  return <span className={`bvp-provenance ${label.toLowerCase()}`}>{label}</span>;
}

function EmptyText() {
  return <div className="bvp-empty-text">Not enough indexed data yet.</div>;
}

function VaultSettings({ data, onClose, onSaved }: { data: BrandVaultProData | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const vault = data?.brandVault;
  const [brandName, setBrandName] = useState(vault?.brandName ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(vault?.websiteUrl ?? "");
  const [heroProduct, setHeroProduct] = useState(vault?.heroProduct ?? "");
  const [tone, setTone] = useState(vault?.tone ?? "");
  const [audience, setAudience] = useState(vault?.audience ?? "");
  const [mainObjection, setMainObjection] = useState(vault?.mainObjection ?? "");
  const [doNotSay, setDoNotSay] = useState(vault?.doNotSay ?? "");
  const [competitorFocus, setCompetitorFocus] = useState(vault?.competitorFocus ?? "");
  const [economics, setEconomics] = useState<BrandEconomics>(vault?.economics ?? EMPTY_ECONOMICS);
  const [competitors, setCompetitors] = useState<Array<Partial<BrandVaultCompetitor> & { slot: 1 | 2 | 3 }>>([1, 2, 3].map((slot) => data?.competitors.find((item) => item.slot === slot) ?? { slot: slot as 1 | 2 | 3, name: "", domain: "", advertiserPageId: "", country: "IN" }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true); setError("");
    try {
      const brandResponse = await fetch("/api/brand-vault", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandName, websiteUrl, tone, audience, doNotSay, heroProduct, mainObjection, competitorFocus, economics }) });
      if (!brandResponse.ok) throw new Error("Unable to save brand context.");
      for (const item of competitors) {
        if (!item.name?.trim()) continue;
        const response = await fetch("/api/brand-vault/pro/competitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...item, name: item.name.trim(), domain: item.domain?.trim() || null, advertiserPageId: item.advertiserPageId?.trim() || null, country: item.country ?? "IN" }) });
        if (!response.ok) throw new Error(`Unable to save competitor ${item.slot}.`);
      }
      await onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save vault."); }
    finally { setSaving(false); }
  }

  const setCompetitor = (slot: 1 | 2 | 3, key: string, value: string) => setCompetitors((items) => items.map((item) => item.slot === slot ? { ...item, [key]: value } : item));
  const setNumber = (key: keyof BrandEconomics, value: string) => setEconomics((current) => ({ ...current, [key]: value.trim() === "" ? null : Number(value) }));

  return <div className="bvp-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="bvp-modal"><div className="bvp-modal-head"><div><div className="bvp-eyebrow">EDIT VAULT</div><h2>Your context + 3 exact rivals</h2></div><button className="bvp-close" onClick={onClose}>�</button></div>{error ? <div className="bvp-notice error">{error}</div> : null}<div className="bvp-settings-grid"><label>Brand name<input value={brandName} onChange={(event) => setBrandName(event.target.value)} /></label><label>Website<input value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} /></label><label>Hero product<input value={heroProduct} onChange={(event) => setHeroProduct(event.target.value)} /></label><label>Tone<input value={tone} onChange={(event) => setTone(event.target.value)} /></label><label className="wide">Audience<textarea value={audience} onChange={(event) => setAudience(event.target.value)} /></label><label>Main objection<textarea value={mainObjection} onChange={(event) => setMainObjection(event.target.value)} /></label><label>Do not say<textarea value={doNotSay} onChange={(event) => setDoNotSay(event.target.value)} /></label><label>Competitor focus<textarea value={competitorFocus} onChange={(event) => setCompetitorFocus(event.target.value)} /></label></div><div className="bvp-settings-block"><div className="bvp-eyebrow">COMPETITORS</div>{competitors.map((item) => <div className="bvp-settings-competitor" key={item.slot}><span className={`bvp-dot dot-${item.slot}`} /><input value={item.name ?? ""} placeholder={`Competitor ${item.slot}`} onChange={(event) => setCompetitor(item.slot, "name", event.target.value)} /><input value={item.advertiserPageId ?? ""} placeholder="Meta Page ID" onChange={(event) => setCompetitor(item.slot, "advertiserPageId", event.target.value)} /></div>)}</div><div className="bvp-settings-block"><div className="bvp-eyebrow">YOUR ECONOMICS</div><div className="bvp-economics-grid">{([["sellingPrice", "Selling price"], ["cogs", "COGS"], ["packagingCost", "Packaging"], ["shippingCost", "Shipping"], ["paymentFeePercent", "Payment %"], ["paymentFeeFixed", "Payment fixed"], ["rtoRatePercent", "RTO %"], ["rtoCost", "RTO cost"], ["refundAllowancePercent", "Refund %"], ["targetContributionMarginPercent", "Target margin %"]] as Array<[keyof BrandEconomics, string]>).map(([key, label]) => <label key={key}>{label}<input inputMode="decimal" value={economics[key] ?? ""} onChange={(event) => setNumber(key, event.target.value)} /></label>)}</div></div><div className="bvp-modal-actions"><button className="bvp-secondary" onClick={onClose}>Cancel</button><button className="bvp-primary" onClick={() => void save()} disabled={saving}>{saving ? "Saving�" : "Save vault"}</button></div></section></div>;
}


