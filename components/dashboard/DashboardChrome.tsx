import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SignOutButton } from "@/components/auth/SignOutButton";
import type { MetricTone } from "@/components/dashboard/DashboardPrimitives";

export type DashboardNavItem = {
  id: string;
  label: string;
};

export function DashboardCommandRail({
  items,
  selected,
  statuses,
  onSelect,
  onOpenPalette,
  onLoadSample,
  onSaveScenario,
  completed,
  total,
  dirty,
  syncing
}: {
  items: ReadonlyArray<DashboardNavItem>;
  selected: string;
  statuses: Record<string, { label: string; tone: MetricTone }>;
  onSelect: (id: string) => void;
  onOpenPalette: () => void;
  onLoadSample: () => void;
  onSaveScenario: () => void;
  completed: number;
  total: number;
  dirty: boolean;
  syncing: boolean;
}) {
  return (
    <aside className="command-rail surface">
      <div className="rail-top">
        <p className="eyebrow">Control</p>
        <h3>Workspaces</h3>
      </div>
      <div className="section-list">
        <Link href="/adspy" className="section-chip">
          <span>Market</span>
          <small className="rail-status rail-neutral">AdSpy</small>
        </Link>
        <Link href="/zwirk" className="section-chip">
          <span>ZWIRK</span>
          <small className="rail-status rail-neutral">Copilot</small>
        </Link>
        {items.map((item) => {
          const status = statuses[item.id] ?? { label: "Not Searched", tone: "neutral" as MetricTone };
          return (
            <button
              key={item.id}
              type="button"
              className={`section-chip ${selected === item.id ? "active" : ""}`}
              onClick={() => onSelect(item.id)}
            >
              <span>{item.label}</span>
              <small className={`rail-status rail-${status.tone}`}>{status.label}</small>
            </button>
          );
        })}
      </div>
      <div className="rail-controls">
        <Button type="button" variant="secondary" onClick={onOpenPalette}>Open Command Palette</Button>
        <Button type="button" variant="secondary" onClick={onLoadSample}>Load Sample Data</Button>
        <Button type="button" variant="secondary" onClick={onSaveScenario}>Save Scenario</Button>
        <Badge variant="secondary">{completed}/{total} sections healthy</Badge>
        <Badge variant={dirty ? "warning" : "success"}>{dirty ? "Unsaved Draft" : "All Saved"}</Badge>
        <Badge variant={syncing ? "warning" : "secondary"}>{syncing ? "Syncing cloud data..." : "Cloud sync ready"}</Badge>
      </div>
      <div className="rail-shortcuts">
        <p>Command Palette</p>
        <kbd>Ctrl</kbd><span>+</span><kbd>K</kbd>
      </div>
    </aside>
  );
}

export function DashboardHero({
  userEmail,
  userName,
  onOpenZwirk
}: {
  userEmail: string;
  userName: string;
  onOpenZwirk?: () => void;
}) {
  return (
    <section className="surface hero-surface">
      <div>
        <p className="eyebrow">Command Center</p>
        <h1>Tell me where I am losing money and what to do next.</h1>
        <p className="hero-copy">Profit, market, recommendation, experiment. Inputs below are the model — the brief above is the product.</p>
      </div>
      <div className="hero-meta">
        <span className="muted-text">{userEmail ? `Signed in as ${userName ? `${userName} (${userEmail})` : userEmail}` : "Not signed in"}</span>
        <Link href="/adspy"><Button type="button" variant="secondary">Open AdSpy</Button></Link>
        <Link href="/zwirk" onClick={onOpenZwirk}><Button type="button">Open ZWIRK</Button></Link>
        <ThemeToggle />
        {userEmail ? <SignOutButton /> : <Link href="/login"><Button type="button" variant="secondary">Sign In</Button></Link>}
      </div>
    </section>
  );
}

export function DashboardExecutionControls({
  recalculating,
  generating,
  onApply,
  onGenerate,
  onReset
}: {
  recalculating: boolean;
  generating: boolean;
  onApply: () => void;
  onGenerate: () => void;
  onReset: () => void;
}) {
  return (
    <section className="surface action-surface">
      <div className="section-head">
        <h3>Execution Controls</h3>
        <p>Apply changes, reset assumptions, and keep the profit story simple.</p>
      </div>
      <div className="action-row">
        <Button type="button" onClick={onApply} disabled={recalculating}>{recalculating ? "Applying..." : "Apply All Changes"}</Button>
        <Button type="button" variant="secondary" onClick={onGenerate} disabled={generating}>{generating ? "Generating..." : "Get AI Insights"}</Button>
        <Button type="button" variant="secondary" onClick={onReset}>Reset Defaults</Button>
      </div>
    </section>
  );
}
