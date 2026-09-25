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
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function daysLabel(date: string | null) {
  if (!date) return "—";
  const diff = Math.max(0, Date.now() - new Date(date).getTime());
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}

function freshnessText(analytics: BrandVaultAnalytics, hasConfiguredCompetitors: boolean) {
  if (!hasConfiguredCompetitors) return "Vault setup";
  const collecting = analytics.competitors.filter((item) => item.collectionState === "collecting").length;
  const indexed = analytics.competitors.filter((item) => item.dataCoverage !== "none").length;
  if (collecting > 0 && indexed > 0) return `${collecting} collecting · ${indexed} indexed`;
  if (collecting > 0) return "Collecting current ads";
  if (indexed === 0) return "Collection pending";
  if (indexed < analytics.competitors.length) return `${indexed} indexed · ${analytics.competitors.length - indexed} waiting`;
  const latest = analytics.competitors
    .map((item) => item.lastObservedAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
  return latest ? `Indexed · latest observed ${daysLabel(latest)}` : "Indexed data";
}

function cleanName(value: string | null | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function normalizeResponse(body: BrandVaultProData): BrandVaultProData {
  return body;
}

function emptyAnalytics(period: BrandVaultPeriod): BrandVaultAnalytics {
  return {
    period,
    generatedAt: new Date().toISOString(),
    breakEvenPrice: null,
    targetMarginPrice: null,
    contributionBeforeAds: null,
    competitors: [],
    compareRows: [],
    gaps: { angles: [], creators: [], languages: [] },
    mondayDigest: {
      headline: "Set up your competitor set to start the Monday read",
      lines: [],
      changes: [],
    },
    counterBrief: "Complete your Brand Vault and add at least one exact competitor before generating a counter-brief.",
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

  const analytics = data?.analytics ?? emptyAnalytics(period);
  const competitors = data?.competitors ?? [];
  const hasConfiguredCompetitors = competitors.length > 0;

  useEffect(() => { void load("week"); }, [load]);

  useEffect(() => {
    const collecting = analytics.competitors.some((item) => item.collectionState === "collecting");
    if (!collecting) return;
    const timer = window.setInterval(() => { void load(period); }, 15_000);
    return () => window.clearInterval(timer);
  }, [analytics.competitors, load, period]);

  const visibleCompetitors = useMemo(() => {
    if (focus === "all") return analytics.competitors;
    return analytics.competitors.filter((item) => item.slot === focus);
  }, [analytics.competitors, focus]);

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
            <span>Brand Vault Pro</span><span className="bvp-chevron">⌄</span>
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
          <div className="bvp-breadcrumb"><strong>zooptrack</strong><span>Brand Vault</span><span className="bvp-breadcrumb-sep">›</span><strong>{NAV.find((item) => item.key === section)?.label ?? "Overview"}</strong></div>
          <div className={`bvp-data-badge ${!hasConfiguredCompetitors ? "demo" : analytics.competitors.some((item) => item.collectionState === "collecting") ? "pending" : analytics.competitors.some((item) => item.dataCoverage !== "none") ? "live" : "pending"}`}>{freshnessText(analytics, hasConfiguredCompetitors)}</div>
        </div>

        {notice ? <div className="bvp-notice">{notice}<button onClick={() => setNotice("")}>×</button></div> : null}
        {error ? <div className="bvp-notice error">{error}<button onClick={() => setError("")}>×</button></div> : null}

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
                <button className={`bvp-chip all ${focus === "all" ? "active" : ""}`} onClick={() => setFocus("all")} disabled={!competitors.length}>All 3</button>
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

            {loading ? <div className="bvp-loading">Updating your competitive memory…</div> : hasConfiguredCompetitors ? <WorkspaceSection section={section} analytics={analytics} visibleCompetitors={visibleCompetitors} focus={focus} saveAction={saveAction} openWhatsApp={openWhatsApp} activeBrandName={activeBrandName} openSection={openSection} /> : <SetupState onEdit={() => setSettingsOpen(true)} />}
          </section>
        </div>
      </div>

      {settingsOpen ? <VaultSettings data={data} onClose={() => setSettingsOpen(false)} onSaved={async () => { setSettingsOpen(false); await load(period); }} /> : null}
    </main>
  );
}

function SetupState({ onEdit }: { onEdit: () => void }) {
  return (
    <section className="bvp-card bvp-setup-card">
      <div className="bvp-eyebrow">GET STARTED</div>
      <h1>Your competitive vault is ready.</h1>
      <p>Add up to three exact Meta competitors and your own economics. Once the competitors are configured, this workspace reads the indexed ad history and fills every module with real evidence.</p>
      <div className="bvp-setup-grid">
        <div><strong>1. Add competitors</strong><span>Brand name + exact Meta Page ID.</span></div>
        <div><strong>2. Add your economics</strong><span>Break-even and target-margin guardrails.</span></div>
        <div><strong>3. Read the market</strong><span>Hooks, creators, changes, products, languages and offers.</span></div>
      </div>
      <button className="bvp-primary" onClick={onEdit}>Edit vault</button>
    </section>
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
      return <RankedSection title="Top hooks" eyebrow="TOP HOOKS" description="Which opening lines keep getting reused and live?" items={visibleCompetitors.flatMap((c) => c.topHooks.slice(0, 8).map((x) => ({ ...x, label: `${c.name}: ${x.label}` })))} saveAction={saveAction} />;
    case "creators":
      return <RankedSection title="Top creators" eyebrow="TOP CREATORS" description="Which creators do they rely on, and who is new?" items={visibleCompetitors.flatMap((c) => c.topCreators.slice(0, 8).map((x) => ({ ...x, label: `${c.name}: ${x.label}` })))} saveAction={saveAction} />;
    case "changes":
      return <ChangesSection competitors={visibleCompetitors} saveAction={saveAction} />;
    case "products":
      return <ProductsSection competitors={visibleCompetitors} saveAction={saveAction} />;
    case "languages":
      return <LanguagesSection competitors={visibleCompetitors} saveAction={saveAction} />;
    case "offers":
      return <OffersSection competitors={visibleCompetitors} analytics={analytics} saveAction={saveAction} />;
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
        {competitors.map((item) => <article key={item.slot} className="bvp-kpi-card"><div className="bvp-kpi-brand"><span className={`bvp-dot dot-${item.slot}`} />{item.name} · active ads</div><strong>{item.activeAds}</strong><span className="bvp-kpi-delta">+{item.newTests} new this {analytics.period === "week" ? "week" : analytics.period === "month" ? "month" : "3-month period"}</span><small>{item.collectionState === "collecting" ? "Collection in progress" : item.dataCoverage === "none" ? "Waiting for indexed ads" : `${item.totalAds} indexed creatives`}</small></article>)}
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
    const floor = analytics.breakEvenPrice == null ? "your cost floor" : `${money(analytics.breakEvenPrice)} break-even`;
    return `Two rivals now lead with repeated creative signals. Nobody in this set is visibly using ${language} creators yet. Brief 3 ${creator.toLowerCase()} ads on your best-selling SKU, priced above ${floor}.`;
  }
  const top = competitors[0]?.topProducts[0]?.product ?? "your best-selling SKU";
  const floor = analytics.breakEvenPrice == null ? "your cost floor" : `${money(analytics.breakEvenPrice)} break-even`;
  return `Pressure-test ${top} with a new angle while keeping the offer above ${floor}.`;
}

function ChangeFeedRow({ change, saveAction }: { change: ChangeItem & { competitor: string; slot: 1 | 2 | 3 }; saveAction: WorkspaceSectionProps["saveAction"] }) {
  const badge = change.type === "new_test" ? "New test" : change.type === "new_offer" ? "New offer" : change.type === "new_message" ? "New message" : "Stopped";
  return <div className="bvp-feed-row"><div className="bvp-feed-main"><span className={`bvp-dot dot-${change.slot}`} /><div><strong>{change.competitor}: </strong><span>{change.label}</span><small>{daysLabel(change.supportingAds[0]?.firstSeenAt ?? null)}</small></div></div><div className={`bvp-signal-badge ${change.type}`}>{badge}</div><button className="bvp-row-save" onClick={() => void saveAction("save", `change:${change.slot}:${change.type}:${change.label}`, `${change.competitor}: ${change.label}`, change as unknown as Record<string, unknown>)}>Save</button></div>;
}

function RankedSection({ title, eyebrow, description, items, saveAction }: { title: string; eyebrow: string; description: string; items: RankedItem[]; saveAction: WorkspaceSectionProps["saveAction"] }) {
  return <section className="bvp-card bvp-module"><div className="bvp-module-head"><div><div className="bvp-eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div></div>{items.length ? items.map((item, index) => <div className="bvp-rank-row" key={`${item.label}-${index}`}><span className="bvp-rank-number">{index + 1}</span><div><strong>{item.label}</strong><small>{item.count} ads · {item.share}% · {item.provenance}</small></div><button className="bvp-row-save" onClick={() => void saveAction("save", `${eyebrow}:${item.label}`, item.label, item as unknown as Record<string, unknown>)}>Save</button></div>) : <EmptyText />}</section>;
}

function ChangesSection({ competitors, saveAction }: { competitors: CompetitorAnalytics[]; saveAction: WorkspaceSectionProps["saveAction"] }) {
  return <section className="bvp-card bvp-module"><div className="bvp-module-head"><div><div className="bvp-eyebrow">CHANGES · WoW / MoM</div><h1>What they started and stopped testing</h1><p>New test, new offer, new message and stopped creative families. The labels stay derived from indexed observations.</p></div></div><div className="bvp-change-grid">{competitors.map((competitor) => <div className="bvp-change-column" key={competitor.slot}><div className="bvp-column-title"><span className={`bvp-dot dot-${competitor.slot}`} />{competitor.name}</div>{competitor.changes.length ? competitor.changes.map((change, index) => <div className="bvp-change-item" key={`${change.type}-${change.label}-${index}`}><div><span className={`bvp-signal-badge ${change.type}`}>{change.type === "retired" ? "Stopped" : change.type.replace("_", " ")}</span><strong>{change.label}</strong><small>{change.detail}</small></div><button className="bvp-row-save" onClick={() => void saveAction("save", `change:${competitor.slot}:${change.type}:${change.label}`, `${competitor.name}: ${change.label}`, change as unknown as Record<string, unknown>)}>Save</button></div>) : <div className="bvp-empty-text">{competitor.collectionState === "collecting" ? "Collection is running. Refresh after the first indexed batch arrives." : "No change signal in this comparison window."}</div>}</div>)}</div></section>;
}

function ProductsSection({ competitors, saveAction }: { competitors: CompetitorAnalytics[]; saveAction: WorkspaceSectionProps["saveAction"] }) {
  return <section className="bvp-card bvp-module"><div className="bvp-module-head"><div><div className="bvp-eyebrow">MOST PUSHED PRODUCTS</div><h1>Which products get the most ad pressure?</h1><p>Ads are attention, not sales. Long-running creatives are shown as a persistence heuristic.</p></div></div><div className="bvp-product-grid">{competitors.map((competitor) => <div key={competitor.slot}><div className="bvp-column-title"><span className={`bvp-dot dot-${competitor.slot}`} />{competitor.name}</div>{competitor.topProducts.slice(0, 6).map((item) => <ProductRow key={item.product} item={item} saveAction={saveAction} slot={competitor.slot} />)}</div>)}</div></section>;
}

function ProductRow({ item, saveAction, slot }: { item: ProductPressure; saveAction: WorkspaceSectionProps["saveAction"]; slot: 1 | 2 | 3 }) {
  return <div className="bvp-product-row"><div><strong>{item.product}</strong><small>{item.ads} ads · {item.activeAds} active · {item.persistent60} persistent 60d</small></div><b>{item.share}%</b><button className="bvp-row-save" onClick={() => void saveAction("save", `product:${slot}:${item.product}`, item.product, item as unknown as Record<string, unknown>)}>Save</button></div>;
}

function LanguagesSection({ competitors, saveAction }: { competitors: CompetitorAnalytics[]; saveAction: WorkspaceSectionProps["saveAction"] }) {
  return <section className="bvp-card bvp-module"><div className="bvp-module-head"><div><div className="bvp-eyebrow">TOP 5 LANGUAGES</div><h1>Who are they talking to?</h1><p>Language is inferred from the ad copy and remains a heuristic signal, especially for Hinglish.</p></div></div><div className="bvp-language-grid">{competitors.map((competitor) => <div key={competitor.slot}><div className="bvp-column-title"><span className={`bvp-dot dot-${competitor.slot}`} />{competitor.name}</div>{competitor.topLanguages.slice(0, 5).map((item, index) => <div className="bvp-rank-row compact" key={`${item.label}-${index}`}><span className="bvp-rank-number">{index + 1}</span><div><strong>{item.label}</strong><small>{item.share}% of recent ads · {item.provenance}</small></div><button className="bvp-row-save" onClick={() => void saveAction("save", `language:${competitor.slot}:${item.label}`, `${competitor.name}: ${item.label}`, item as unknown as Record<string, unknown>)}>Save</button></div>)}</div>)}</div></section>;
}

function OffersSection({ competitors, analytics, saveAction }: { competitors: CompetitorAnalytics[]; analytics: BrandVaultAnalytics; saveAction: WorkspaceSectionProps["saveAction"] }) {
  return <section className="bvp-card bvp-module"><div className="bvp-module-head"><div><div className="bvp-eyebrow">OFFERS</div><h1>How hard are they discounting, and can you match it?</h1><p>Effective public prices are compared with your Vault break-even. This does not imply competitor profitability.</p></div><div className="bvp-floor-pill">Your break-even {money(analytics.breakEvenPrice)}</div></div><div className="bvp-offer-grid">{competitors.map((competitor) => <div key={competitor.slot}><div className="bvp-column-title"><span className={`bvp-dot dot-${competitor.slot}`} />{competitor.name}</div>{competitor.topOffers.slice(0, 6).map((offer, index) => <OfferRow offer={offer} key={`${offer.label}-${index}`} saveAction={saveAction} slot={competitor.slot} />)}</div>)}</div></section>;
}

function OfferRow({ offer, saveAction, slot }: { offer: OfferItem; saveAction: WorkspaceSectionProps["saveAction"]; slot: 1 | 2 | 3 }) {
  const label = offer.relation === "below" ? "Below floor" : offer.relation === "near" ? "Near floor" : offer.relation === "above" ? "Above floor" : "Unknown";
  return <div className="bvp-offer-row"><div><strong>{offer.label}</strong><small>{offer.count} ads · {offer.visiblePrice == null ? "price not visible" : money(offer.visiblePrice)}</small></div><em className={`relation-${offer.relation}`}>{label}</em><button className="bvp-row-save" onClick={() => void saveAction("save", `offer:${slot}:${offer.label}`, offer.label, offer as unknown as Record<string, unknown>)}>Save</button></div>;
}

function CompareSection({ analytics }: { analytics: BrandVaultAnalytics }) {
  return <section className="bvp-card bvp-module"><div className="bvp-module-head"><div><div className="bvp-eyebrow">COMPARE ALL 3</div><h1>One market set, side by side.</h1><p>Every row is a derived view over the same indexed advertiser history.</p></div></div><div className="bvp-table-wrap"><table className="bvp-table"><thead><tr><th>Competitor</th><th>Ads</th><th>Active</th><th>New tests</th><th>60d</th><th>Top product</th><th>Top hook</th><th>Top creator</th><th>Top language</th></tr></thead><tbody>{analytics.compareRows.map((row) => <tr key={row.slot}><td><span className={`bvp-dot dot-${row.slot}`} /> <strong>{row.name}</strong></td><td>{row.totalAds}</td><td>{row.activeAds}</td><td>{row.newTests}</td><td>{row.persistent60}</td><td>{row.topProduct ?? "—"}</td><td>{row.topHook ?? "—"}</td><td>{row.topCreator ?? "—"}</td><td>{row.topLanguage ?? "—"}</td></tr>)}</tbody></table></div></section>;
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

  return <div className="bvp-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="bvp-modal"><div className="bvp-modal-head"><div><div className="bvp-eyebrow">EDIT VAULT</div><h2>Your context + 3 exact rivals</h2></div><button className="bvp-close" onClick={onClose}>×</button></div>{error ? <div className="bvp-notice error">{error}</div> : null}<div className="bvp-settings-grid"><label>Brand name<input value={brandName} onChange={(event) => setBrandName(event.target.value)} /></label><label>Website<input value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} /></label><label>Hero product<input value={heroProduct} onChange={(event) => setHeroProduct(event.target.value)} /></label><label>Tone<input value={tone} onChange={(event) => setTone(event.target.value)} /></label><label className="wide">Audience<textarea value={audience} onChange={(event) => setAudience(event.target.value)} /></label><label>Main objection<textarea value={mainObjection} onChange={(event) => setMainObjection(event.target.value)} /></label><label>Do not say<textarea value={doNotSay} onChange={(event) => setDoNotSay(event.target.value)} /></label><label>Competitor focus<textarea value={competitorFocus} onChange={(event) => setCompetitorFocus(event.target.value)} /></label></div><div className="bvp-settings-block"><div className="bvp-eyebrow">COMPETITORS</div>{competitors.map((item) => <div className="bvp-settings-competitor" key={item.slot}><span className={`bvp-dot dot-${item.slot}`} /><input value={item.name ?? ""} placeholder={`Competitor ${item.slot}`} onChange={(event) => setCompetitor(item.slot, "name", event.target.value)} /><input value={item.advertiserPageId ?? ""} placeholder="Meta Page ID" onChange={(event) => setCompetitor(item.slot, "advertiserPageId", event.target.value)} /></div>)}</div><div className="bvp-settings-block"><div className="bvp-eyebrow">YOUR ECONOMICS</div><div className="bvp-economics-grid">{([["sellingPrice", "Selling price"], ["cogs", "COGS"], ["packagingCost", "Packaging"], ["shippingCost", "Shipping"], ["paymentFeePercent", "Payment %"], ["paymentFeeFixed", "Payment fixed"], ["rtoRatePercent", "RTO %"], ["rtoCost", "RTO cost"], ["refundAllowancePercent", "Refund %"], ["targetContributionMarginPercent", "Target margin %"]] as Array<[keyof BrandEconomics, string]>).map(([key, label]) => <label key={key}>{label}<input inputMode="decimal" value={economics[key] ?? ""} onChange={(event) => setNumber(key, event.target.value)} /></label>)}</div></div><div className="bvp-modal-actions"><button className="bvp-secondary" onClick={onClose}>Cancel</button><button className="bvp-primary" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save vault"}</button></div></section></div>;
}
