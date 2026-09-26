"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
      nextMove: "Add your competitors in Edit vault.",
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
    const text = [analytics.mondayDigest.headline, ...analytics.mondayDigest.lines, `Your move: ${analytics.mondayDigest.nextMove}`].join("\n\n");
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

type SaveAction = (actionType: "save" | "brief" | "alert", referenceKey: string, title: string, payload: Record<string, unknown>) => Promise<void>;

function periodWord(period: BrandVaultPeriod) {
  return period === "week" ? "this week" : period === "month" ? "this month" : "in 3 months";
}

function adspyHref(c: CompetitorAnalytics) {
  const params = new URLSearchParams({ q: c.name, country: c.country || "IN" });
  if (c.pageId) params.set("pid", c.pageId);
  return `/adspy?${params.toString()}`;
}

function WorkspaceSection({ section, analytics, visibleCompetitors, focus, saveAction, openWhatsApp, activeBrandName, openSection }: {
  section: NavKey;
  analytics: BrandVaultAnalytics;
  visibleCompetitors: CompetitorAnalytics[];
  focus: Focus;
  saveAction: SaveAction;
  openWhatsApp: () => void;
  activeBrandName: string;
  openSection: (section: NavKey) => void;
}) {
  switch (section) {
    case "overview":
      return <OverviewSection analytics={analytics} competitors={visibleCompetitors} focus={focus} saveAction={saveAction} openWhatsApp={openWhatsApp} activeBrandName={activeBrandName} openSection={openSection} />;
    case "hooks":
      return <HooksSection competitors={visibleCompetitors} saveAction={saveAction} />;
    case "creators":
      return <CreatorsSection competitors={visibleCompetitors} period={analytics.period} saveAction={saveAction} />;
    case "changes":
      return <ChangesSection competitors={visibleCompetitors} period={analytics.period} saveAction={saveAction} />;
    case "products":
      return <ProductsSection competitors={visibleCompetitors} saveAction={saveAction} />;
    case "languages":
      return <LanguagesSection competitors={visibleCompetitors} />;
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

/* One card shape everywhere: insight first, label, evidence, then actions. */
function Card({ title, label, children, actions }: { title: string; label?: "Source" | "Derived" | "Heuristic"; children?: ReactNode; actions?: ReactNode }) {
  return (
    <section className="bvp-card">
      <div className="bvp-section-line"><h2>{title}</h2>{label ? <Provenance label={label} /> : null}</div>
      {children}
      {actions ? <div className="bvp-feed-actions">{actions}</div> : null}
    </section>
  );
}

function CompetitorEyebrow({ c }: { c: CompetitorAnalytics }) {
  return (
    <div className={`bvp-comp-eyebrow slot-${c.slot}`}>
      <span className={`bvp-dot dot-${c.slot}`} />{c.name}
      {c.identity === "name" ? <span className="bvp-identity-warn" title="Matched by exact name, not by Meta Page ID. Add the Page ID in Edit vault.">name match</span> : null}
    </div>
  );
}

function Bar({ pct, slot }: { pct: number; slot: 1 | 2 | 3 }) {
  return <div className="bvp-bar"><i className={`fill-${slot}`} style={{ width: `${Math.max(3, Math.min(100, pct))}%` }} /></div>;
}

function NoData({ c }: { c: CompetitorAnalytics }) {
  return (
    <div className="bvp-empty-text">
      {c.collectionState === "collecting"
        ? "Collecting their ads now. This fills in once the first batch is indexed."
        : c.dataCoverage === "none"
          ? "No indexed ads yet for this competitor."
          : "Nothing in this period."}
    </div>
  );
}

function OverviewSection({ analytics, competitors, focus, saveAction, openWhatsApp, activeBrandName, openSection }: { analytics: BrandVaultAnalytics; competitors: CompetitorAnalytics[]; focus: Focus; saveAction: SaveAction; openWhatsApp: () => void; activeBrandName: string; openSection: (section: NavKey) => void }) {
  const feed = competitors.flatMap((c) => c.changes.slice(0, 2).map((change) => ({ competitor: c.name, slot: c.slot, ...change })));
  const withData = competitors.filter((c) => c.dataCoverage !== "none");
  const testing = withData.slice().sort((a, b) => b.newTests - a.newTests)[0];
  const cutting = withData.slice().sort((a, b) => b.retiredAds - a.retiredAds)[0];
  const scope = analytics.period === "quarter" ? "These 3 months" : analytics.period === "month" ? "This month" : "This week";
  const headline = !withData.length
    ? `${scope} in one line: waiting for indexed ads.`
    : focus === "all" && withData.length > 1
      ? `${scope} in one line: ${testing.name} is testing hardest (+${testing.newTests} new)${cutting && cutting.retiredAds > 0 && cutting.slot !== testing.slot ? `; ${cutting.name} is cutting the most ads (−${cutting.retiredAds})` : ""}.`
      : `${scope} in one line: ${feed[0] ? feed[0].label : `${withData[0].name} has ${withData[0].activeAds} active ads and no change signal yet`}.`;
  return (
    <div className="bvp-stack">
      <div className="bvp-kpi-grid">
        {competitors.map((c) => (
          <article key={c.slot} className="bvp-kpi-card">
            <div className="bvp-kpi-brand"><span className={`bvp-dot dot-${c.slot}`} />{c.name} · active ads</div>
            <strong>{c.dataCoverage === "none" ? "—" : c.activeAds}</strong>
            <span className="bvp-kpi-delta">{c.dataCoverage === "none" ? (c.collectionState === "collecting" ? "Collecting…" : "No indexed ads yet") : `+${c.newTests} new ${periodWord(analytics.period)}`}</span>
          </article>
        ))}
      </div>
      <Card
        title={headline}
        label="Derived"
        actions={<><button className="bvp-primary" onClick={openWhatsApp}>Send to WhatsApp</button><button className="bvp-secondary" onClick={() => openSection("changes")}>Open full changes</button></>}
      >
        {feed.length ? feed.map((change, index) => <ChangeFeedRow key={`${change.slot}-${change.type}-${index}`} change={change} saveAction={saveAction} />) : <div className="bvp-empty-text">No new, stopped or changed ads in this period.</div>}
      </Card>
      <Card
        title="Your next move"
        label="Heuristic"
        actions={<button className="bvp-primary" onClick={() => void saveAction("brief", "counter-brief", "Counter-brief", { text: analytics.counterBrief, brand: activeBrandName })}>Write brief with ZWIRK</button>}
      >
        <p className="bvp-card-text">{analytics.mondayDigest.nextMove}</p>
      </Card>
    </div>
  );
}

const CHANGE_BADGE: Record<ChangeItem["type"], string> = { new_test: "New test", new_offer: "New offer", new_message: "New message", retired: "Stopped" };

function ChangeFeedRow({ change, saveAction }: { change: ChangeItem & { competitor: string; slot: 1 | 2 | 3 }; saveAction: SaveAction }) {
  const when = change.type === "retired" ? change.supportingAds[0]?.lastSeenAt : change.supportingAds[0]?.firstSeenAt;
  return (
    <div className="bvp-feed-row">
      <div className="bvp-feed-main">
        <span className={`bvp-dot dot-${change.slot}`} />
        <div><strong>{change.competitor}: </strong><span>{change.label}</span><small>{daysLabel(when ?? null)}</small></div>
      </div>
      <div className={`bvp-signal-badge ${change.type}`}>{CHANGE_BADGE[change.type]}</div>
      <button className="bvp-row-save" onClick={() => void saveAction("save", `change:${change.slot}:${change.type}:${change.label}`, `${change.competitor}: ${change.label}`, { ...change })}>Save</button>
    </div>
  );
}

function HooksSection({ competitors, saveAction }: { competitors: CompetitorAnalytics[]; saveAction: SaveAction }) {
  return (
    <div className="bvp-stack">
      {competitors.map((c) => {
        const max = Math.max(1, ...c.topHooks.map((h) => h.activeCount ?? h.count));
        return (
          <Card
            key={c.slot}
            title={c.topHooks[0] ? `${c.name}'s most reused opening line: “${c.topHooks[0].label}”` : `${c.name}: no reused opening line yet`}
            label="Derived"
            actions={c.topHooks.length ? <><a className="bvp-secondary" href={adspyHref(c)}>See the ads</a><button className="bvp-secondary" onClick={() => void saveAction("save", `hooks:${c.slot}`, `${c.name}: top hooks`, { hooks: c.topHooks.map((h) => h.label) })}>Save to board</button></> : null}
          >
            <CompetitorEyebrow c={c} />
            {c.topHooks.length ? c.topHooks.map((h, i) => (
              <div className="bvp-rank-row" key={`${h.label}-${i}`}>
                <span className="bvp-rank-number">{i + 1}</span>
                <div><strong>“{h.label}”</strong><small>{h.activeCount ?? 0} active ads · longest {h.longestDays ?? 0} days</small><Bar pct={((h.activeCount ?? h.count) / max) * 100} slot={c.slot} /></div>
                <span className="bvp-metric">{h.count} ads</span>
              </div>
            )) : <NoData c={c} />}
          </Card>
        );
      })}
    </div>
  );
}

function CreatorsSection({ competitors, period, saveAction }: { competitors: CompetitorAnalytics[]; period: BrandVaultPeriod; saveAction: SaveAction }) {
  return (
    <div className="bvp-stack">
      {competitors.map((c) => (
        <Card
          key={c.slot}
          title={`${c.name} works with ${c.creatorsCount} creator${c.creatorsCount === 1 ? "" : "s"}; ${c.newCreators} new ${periodWord(period)}`}
          label="Source"
          actions={<button className="bvp-secondary" onClick={() => void saveAction("alert", `alert:new-creators:${c.slot}`, `Alert: new creators for ${c.name}`, { competitor: c.name, pageId: c.pageId })}>Alert me on new creators</button>}
        >
          <CompetitorEyebrow c={c} />
          {c.topCreators.length ? c.topCreators.map((x, i) => (
            <div className="bvp-rank-row" key={`${x.label}-${i}`}>
              <span className="bvp-rank-number">{i + 1}</span>
              <div><strong>{x.label} {x.isNew ? <span className="bvp-provenance derived">New</span> : null}</strong><small>{x.activeCount ?? 0} active ads · longest {x.longestDays ?? 0} days</small></div>
              <span className="bvp-metric">{x.count} ads</span>
            </div>
          )) : <NoData c={c} />}
        </Card>
      ))}
    </div>
  );
}

function ChangesSection({ competitors, period, saveAction }: { competitors: CompetitorAnalytics[]; period: BrandVaultPeriod; saveAction: SaveAction }) {
  const feed = competitors.flatMap((c) => c.changes.map((change) => ({ competitor: c.name, slot: c.slot, ...change })));
  return (
    <div className="bvp-stack">
      <div className="bvp-kpi-grid">
        {competitors.map((c) => (
          <article key={c.slot} className="bvp-kpi-card">
            <div className="bvp-kpi-brand"><span className={`bvp-dot dot-${c.slot}`} />{c.name}</div>
            <strong>+{c.newTests} / −{c.retiredAds}</strong>
            <span className="bvp-kpi-sub">{c.newOffers} new offer{c.newOffers === 1 ? "" : "s"} {periodWord(period)}</span>
          </article>
        ))}
      </div>
      <Card
        title={`What changed ${periodWord(period)}`}
        label="Derived"
        actions={<span className="bvp-muted-note">Compared with the {period === "week" ? "previous week" : period === "month" ? "previous month" : "previous 3 months"}.</span>}
      >
        {feed.length ? feed.map((change, index) => <ChangeFeedRow key={`${change.slot}-${change.type}-${index}`} change={change} saveAction={saveAction} />) : <div className="bvp-empty-text">No new, stopped or changed ads in this period.</div>}
      </Card>
    </div>
  );
}

function ProductsSection({ competitors, saveAction }: { competitors: CompetitorAnalytics[]; saveAction: SaveAction }) {
  return (
    <div className="bvp-stack">
      {competitors.map((c) => {
        const top = c.topProducts[0];
        const max = Math.max(1, ...c.topProducts.map((p) => p.activeAds || p.ads));
        return (
          <Card
            key={c.slot}
            title={top ? `${c.name} puts the most ad pressure on ${top.product.split("/").pop()}` : `${c.name}: no product pages found in their ads`}
            label="Derived"
            actions={top ? <><a className="bvp-secondary" href={adspyHref(c)}>Explore this product</a><button className="bvp-secondary" onClick={() => void saveAction("save", `product:${c.slot}:${top.product}`, `${c.name}: ${top.product}`, { ...top })}>Save</button></> : null}
          >
            <CompetitorEyebrow c={c} />
            {c.topProducts.length ? c.topProducts.map((p, i) => (
              <div className="bvp-rank-row" key={p.product}>
                <span className="bvp-rank-number">{i + 1}</span>
                <div><strong>{p.product}</strong><small>{p.activeAds} active ads · {p.variants} variants · longest {p.longestDays} days</small><Bar pct={((p.activeAds || p.ads) / max) * 100} slot={c.slot} /></div>
                <span className={`bvp-provenance ${p.status === "Likely proven" ? "source" : p.status === "New push" ? "derived" : "neutral"}`}>{p.status}</span>
              </div>
            )) : <NoData c={c} />}
            <p className="bvp-card-note">Most ad pressure is not the same as most sales. “Likely proven” = pushed with ads that stayed live for 60+ days.</p>
          </Card>
        );
      })}
    </div>
  );
}

function LanguagesSection({ competitors }: { competitors: CompetitorAnalytics[] }) {
  return (
    <div className="bvp-stack">
      {competitors.map((c) => (
        <Card key={c.slot} title={c.topLanguages[0] ? `${c.name} talks mostly in ${c.topLanguages[0].label} (${c.topLanguages[0].share}%)` : `${c.name}: language not detected yet`} label="Heuristic">
          <CompetitorEyebrow c={c} />
          {c.topLanguages.length ? c.topLanguages.map((l) => (
            <div className="bvp-lang-row" key={l.label}><span>{l.label}</span><Bar pct={l.share} slot={c.slot} /><span className="bvp-metric">{l.share}%</span></div>
          )) : <NoData c={c} />}
        </Card>
      ))}
    </div>
  );
}

function OffersSection({ competitors, analytics, saveAction }: { competitors: CompetitorAnalytics[]; analytics: BrandVaultAnalytics; saveAction: SaveAction }) {
  const floor = analytics.breakEvenPrice;
  return (
    <div className="bvp-stack">
      <div className="bvp-floor-line">Your break-even: <strong>{money(floor)}</strong>{floor == null ? <span> · add your costs in Edit vault</span> : null}</div>
      {competitors.map((c) => {
        const top = c.topOffers[0];
        const title = top
          ? `${c.name}: ${top.label}${top.depthPercent ? ` (up to ${top.depthPercent}%)` : ""}${top.visiblePrice != null ? ` → ${money(top.visiblePrice)} visible price` : ""}`
          : `${c.name}: no offer found in their ads`;
        return (
          <Card key={c.slot} title={title} label="Derived" actions={top ? <button className="bvp-secondary" onClick={() => void saveAction("brief", `counter-offer:${c.slot}:${top.type}`, `Counter-offer vs ${c.name}`, { competitor: c.name, offer: top })}>Try a counter-offer</button> : null}>
            <CompetitorEyebrow c={c} />
            {c.topOffers.length ? c.topOffers.map((o, i) => <OfferRow key={`${o.type}-${i}`} offer={o} floor={floor} />) : <NoData c={c} />}
          </Card>
        );
      })}
    </div>
  );
}

function OfferRow({ offer, floor }: { offer: OfferItem; floor: number | null }) {
  const verdict =
    offer.vsBreakEven == null || floor == null
      ? offer.visiblePrice == null ? "Price not visible in the ads." : "Add your costs to compare with your break-even."
      : offer.vsBreakEven < 0
        ? `Matching this puts you ${money(-offer.vsBreakEven)} per unit below break-even.`
        : `You can match this and stay ${money(offer.vsBreakEven)} per unit above break-even.`;
  return (
    <div className="bvp-offer-row">
      <div>
        <strong>{offer.label}{offer.depthPercent ? ` · up to ${offer.depthPercent}%` : ""}</strong>
        <small>{offer.count} ads{offer.example ? ` · e.g. “${offer.example}”` : ""}</small>
        <small className={`relation-${offer.relation}`}>{verdict}</small>
      </div>
    </div>
  );
}

function CompareSection({ analytics }: { analytics: BrandVaultAnalytics }) {
  const rows = analytics.compareRows;
  const p = periodWord(analytics.period);
  const lines: Array<[string, (r: BrandVaultAnalytics["compareRows"][number]) => string | number]> = [
    ["Active ads", (r) => r.activeAds],
    [`New ${p}`, (r) => `+${r.newTests}`],
    [`Stopped ${p}`, (r) => `−${r.retiredAds}`],
    ["Creators", (r) => r.creatorsCount],
    ["Top hook", (r) => r.topHook ?? "—"],
    ["Most pushed product", (r) => r.topProduct?.split("/").pop() ?? "—"],
    ["Main language", (r) => r.topLanguage ?? "—"],
    ["Current offer", (r) => r.topOffer ?? "—"],
  ];
  return (
    <Card title={`All ${rows.length} side by side`} label="Derived" actions={<button className="bvp-secondary" onClick={() => window.print()}>Export PDF</button>}>
      <div className="bvp-table-wrap">
        <table className="bvp-table">
          <thead><tr><th />{rows.map((r) => <th key={r.slot} className={`slot-text-${r.slot}`}>{r.name}</th>)}</tr></thead>
          <tbody>{lines.map(([label, get]) => <tr key={label}><td><strong>{label}</strong></td>{rows.map((r) => <td key={r.slot}>{get(r)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </Card>
  );
}

function DigestSection({ analytics, openWhatsApp, saveAction }: { analytics: BrandVaultAnalytics; openWhatsApp: () => void; saveAction: SaveAction }) {
  const digest = analytics.mondayDigest;
  const mail = `mailto:?subject=${encodeURIComponent(digest.headline)}&body=${encodeURIComponent([digest.headline, ...digest.lines, `Your move: ${digest.nextMove}`].join("\n\n"))}`;
  return (
    <div className="bvp-stack">
      <Card
        title="Monday 9:00 AM digest preview"
        label="Derived"
        actions={<><button className="bvp-primary" onClick={openWhatsApp}>Deliver to WhatsApp</button><a className="bvp-secondary" href={mail}>Email</a><button className="bvp-secondary" onClick={() => void saveAction("save", "monday-digest", "Monday digest", { ...digest })}>Save digest</button></>}
      >
        {analytics.competitors.map((c) => {
          const top = c.changes[0];
          return (
            <div className="bvp-feed-row" key={c.slot}>
              <div className="bvp-feed-main"><span className={`bvp-dot dot-${c.slot}`} /><div><strong>{c.name}: </strong><span>{top ? top.label : c.dataCoverage === "none" ? "no indexed ads yet" : "no change this period"}</span></div></div>
              <div className="bvp-signal-badge neutral">Top change</div>
            </div>
          );
        })}
        <div className="bvp-feed-row">
          <div className="bvp-feed-main"><span className="bvp-dot dot-good" /><div><strong>Your move: </strong><span>{digest.nextMove}</span></div></div>
          <div className="bvp-provenance source">Action</div>
        </div>
      </Card>
      <Card title="Counter-brief" label="Heuristic" actions={<button className="bvp-primary" onClick={() => void saveAction("brief", "counter-brief", "Counter-brief", { text: analytics.counterBrief })}>Write brief with ZWIRK</button>}>
        <p className="bvp-brief">{analytics.counterBrief}</p>
      </Card>
    </div>
  );
}

function BudgetSection({ analytics }: { analytics: BrandVaultAnalytics }) {
  return (
    <div className="bvp-stack">
      <div className="bvp-gate">
        <div><strong>Budget planner is part of Pro+</strong><small>Plan daily budget and ad sets from your own margin and RTO.</small></div>
        <button className="bvp-primary" type="button">Upgrade to Pro+</button>
      </div>
      <div className="bvp-blur" aria-hidden="true">
        <Card title="Daily budget from your economics">
          <div className="bvp-budget-preview">
            <div><span>Break-even</span><strong>{money(analytics.breakEvenPrice)}</strong></div>
            <div><span>Target margin price</span><strong>{money(analytics.targetMarginPrice)}</strong></div>
            <div><span>Contribution before ads</span><strong>{money(analytics.contributionBeforeAds)}</strong></div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Provenance({ label }: { label: "Source" | "Derived" | "Heuristic" }) {
  return <span className={`bvp-provenance ${label.toLowerCase()}`}>{label}</span>;
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
        if (!item.name?.trim()) {
          // Slot cleared: remove the saved competitor instead of silently keeping it.
          if (item.id) {
            const removed = await fetch("/api/brand-vault/pro/competitors", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) });
            if (!removed.ok) throw new Error(`Unable to remove competitor ${item.slot}.`);
          }
          continue;
        }
        const response = await fetch("/api/brand-vault/pro/competitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slot: item.slot, name: item.name.trim(), domain: item.domain?.trim() || null, advertiserPageId: item.advertiserPageId?.trim() || null, country: item.country ?? "IN" }) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result?.error || `Unable to save competitor ${item.slot}.`);
      }
      await onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save vault."); }
    finally { setSaving(false); }
  }

  const setCompetitor = (slot: 1 | 2 | 3, key: string, value: string) => setCompetitors((items) => items.map((item) => item.slot === slot ? { ...item, [key]: value } : item));
  const setNumber = (key: keyof BrandEconomics, value: string) => setEconomics((current) => ({ ...current, [key]: value.trim() === "" ? null : Number(value) }));

  return <div className="bvp-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="bvp-modal"><div className="bvp-modal-head"><div><div className="bvp-eyebrow">EDIT VAULT</div><h2>Your context + 3 exact rivals</h2></div><button className="bvp-close" onClick={onClose}>×</button></div>{error ? <div className="bvp-notice error">{error}</div> : null}<div className="bvp-settings-grid"><label>Brand name<input value={brandName} onChange={(event) => setBrandName(event.target.value)} /></label><label>Website<input value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} /></label><label>Hero product<input value={heroProduct} onChange={(event) => setHeroProduct(event.target.value)} /></label><label>Tone<input value={tone} onChange={(event) => setTone(event.target.value)} /></label><label className="wide">Audience<textarea value={audience} onChange={(event) => setAudience(event.target.value)} /></label><label>Main objection<textarea value={mainObjection} onChange={(event) => setMainObjection(event.target.value)} /></label><label>Do not say<textarea value={doNotSay} onChange={(event) => setDoNotSay(event.target.value)} /></label><label>Competitor focus<textarea value={competitorFocus} onChange={(event) => setCompetitorFocus(event.target.value)} /></label></div><div className="bvp-settings-block"><div className="bvp-eyebrow">COMPETITORS</div>{competitors.map((item) => <div className="bvp-settings-competitor" key={item.slot}><span className={`bvp-dot dot-${item.slot}`} /><input value={item.name ?? ""} placeholder={`Competitor ${item.slot}`} onChange={(event) => setCompetitor(item.slot, "name", event.target.value)} /><input value={item.advertiserPageId ?? ""} placeholder="Meta Page ID" onChange={(event) => setCompetitor(item.slot, "advertiserPageId", event.target.value)} /></div>)}</div><div className="bvp-settings-block"><div className="bvp-eyebrow">YOUR ECONOMICS</div><div className="bvp-economics-grid">{([["sellingPrice", "Selling price"], ["cogs", "COGS"], ["packagingCost", "Packaging"], ["shippingCost", "Shipping"], ["paymentFeePercent", "Payment %"], ["paymentFeeFixed", "Payment fixed"], ["rtoRatePercent", "RTO %"], ["rtoCost", "RTO cost"], ["refundAllowancePercent", "Refund %"], ["targetContributionMarginPercent", "Target margin %"]] as Array<[keyof BrandEconomics, string]>).map(([key, label]) => <label key={key}>{label}<input inputMode="decimal" value={economics[key] ?? ""} onChange={(event) => setNumber(key, event.target.value)} /></label>)}</div></div><div className="bvp-modal-actions"><button className="bvp-secondary" onClick={onClose}>Cancel</button><button className="bvp-primary" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save vault"}</button></div></section></div>;
}
