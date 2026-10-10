import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { TodayShell } from "@/components/today/TodayShell";
import { createGlobalServiceClient } from "@/lib/ad-intelligence/global/supabase";
import { billingSummary, inr, userSummary, weeklySignups, type BillingRow, type UserRow } from "@/lib/admin/stats";
import { isAdminEmail } from "@/lib/billing/plans";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Founder dashboard", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const DAY = 86_400_000;

async function listAllUsers(): Promise<UserRow[]> {
  const admin = createGlobalServiceClient().auth.admin;
  const out: UserRow[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    for (const u of data.users) out.push({ id: u.id, email: u.email ?? null, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at ?? null });
    if (data.users.length < 1000) break;
  }
  return out;
}

async function load(now: number) {
  const db = createGlobalServiceClient();
  const since = (days: number) => new Date(now - days * DAY).toISOString();
  const [users, billing, watch, ads24, ads7, lastAd, events, reports] = await Promise.all([
    listAllUsers(),
    db.from("billing_subscriptions").select("user_id,plan,status,trial_ends_at,current_period_end").limit(10000),
    db.from("adspy_advertiser_watchlists").select("user_id").limit(20000),
    db.from("ad_intelligence_creatives").select("id", { count: "exact", head: true }).gt("created_at", since(1)),
    db.from("ad_intelligence_creatives").select("id", { count: "exact", head: true }).gt("created_at", since(7)),
    db.from("ad_intelligence_creatives").select("created_at").order("created_at", { ascending: false }).limit(1),
    db.from("billing_events").select("event,received_at").order("received_at", { ascending: false }).limit(8),
    db.from("report_preferences").select("user_id", { count: "exact", head: true }),
  ]);
  const rivals = new Map<string, number>();
  for (const r of (watch.data ?? []) as Array<{ user_id: string }>) rivals.set(r.user_id, (rivals.get(r.user_id) ?? 0) + 1);
  return {
    users,
    billing: (billing.data ?? []) as BillingRow[],
    rivals,
    ads24: ads24.count ?? 0,
    ads7: ads7.count ?? 0,
    lastAdAt: ((lastAd.data ?? []) as Array<{ created_at: string }>)[0]?.created_at ?? null,
    events: (events.data ?? []) as Array<{ event: string; received_at: string }>,
    reportUsers: reports.count ?? 0,
  };
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : "—");
const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—");

function Stat({ value, label, tone }: { value: string | number; label: string; tone?: "good" | "warn" }) {
  return (
    <div className="zd-card" style={{ gap: 4 }}>
      <span className="zd-h2" style={{ color: tone === "warn" ? "var(--zt-danger)" : undefined }}>{value}</span>
      <span className="zd-muted" style={{ fontSize: 13 }}>{label}</span>
    </div>
  );
}

/** Founder-only scoreboard: signups, trials, paying customers, MRR and data health. */
export default async function FounderPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect("/login?next=/today/founder");
  const adminList = process.env.ZOOPTRACK_ADMIN_EMAILS;
  if (!isAdminEmail(user.email, adminList)) notFound();

  const now = Date.now();
  let data: Awaited<ReturnType<typeof load>>;
  try {
    data = await load(now);
  } catch (e) {
    return (
      <TodayShell active="founder" email={user.email}>
        <p className="zd-error" role="alert">Could not load stats: {e instanceof Error ? e.message : "unknown error"}</p>
      </TodayShell>
    );
  }

  // Founder and test accounts (ZOOPTRACK_ADMIN_EMAILS) are left out of every number.
  const founders = new Set<string>(data.users.filter((u) => isAdminEmail(u.email, adminList)).map((u) => u.id));
  const customers = data.users.filter((u) => !founders.has(u.id));
  const us = userSummary(customers, now);
  const bs = billingSummary(data.billing, now, founders);
  const weeks = weeklySignups(customers, now, 8);
  const maxWeek = Math.max(1, ...weeks.map((w) => w.count));
  const withRivals = customers.filter((u) => (data.rivals.get(u.id) ?? 0) > 0).length;
  const billingByUser = new Map(data.billing.map((b) => [b.user_id, b]));
  const recent = [...customers].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 15);
  const collectorStale = !data.lastAdAt || now - Date.parse(data.lastAdAt) > 2 * DAY;

  return (
    <TodayShell active="founder" email={user.email}>
      <div className="zd-col" style={{ gap: 28 }}>
        <header className="zd-col" style={{ gap: 8 }}>
          <div className="zd-eyebrow">Founder only</div>
          <h1 className="zd-h1">{bs.mrr ? `${inr(bs.mrr)} MRR` : "No paying customers yet."}</h1>
          <p className="zd-lede">
            {bs.payingTotal} paying · {bs.trialsLive} live trials · {us.new7} signups this week. Founder and test accounts are not counted.
          </p>
        </header>

        <section className="zd-section" aria-label="Revenue">
          <h2 className="zd-h3">Revenue</h2>
          <div className="zd-grid-4">
            <Stat value={inr(bs.mrr)} label="Monthly recurring revenue" />
            <Stat value={bs.payingTotal} label={`Paying: ${bs.paying.starter} Starter · ${bs.paying.growth} Growth · ${bs.paying.agency} Agency`} />
            <Stat value={bs.trialsLive} label={`Live trials (${bs.trialsEnded} ended without paying)`} />
            <Stat value={bs.pastDue + bs.cancelled} label={`Past due ${bs.pastDue} · cancelled ${bs.cancelled}`} tone={bs.pastDue ? "warn" : undefined} />
          </div>
        </section>

        <section className="zd-section" aria-label="Users">
          <h2 className="zd-h3">Users</h2>
          <div className="zd-grid-4">
            <Stat value={us.total} label="Total signups" />
            <Stat value={us.new7} label={`New this week (${us.new30} in 30 days)`} />
            <Stat value={us.active7} label="Came back in the last 7 days" />
            <Stat value={withRivals} label={`Set up rivals (${us.total ? Math.round((withRivals / us.total) * 100) : 0}% of signups) · ${data.reportUsers} report schedules`} />
          </div>
          <div className="zd-card" style={{ gap: 10 }}>
            <span className="zd-muted" style={{ fontSize: 13 }}>Signups per week, last 8 weeks</span>
            <div className="zd-spark" aria-label="Signups per week">
              {weeks.map((w) => (
                <span key={w.start} className={w.count ? undefined : "is-zero"} title={`Week from ${w.start}: ${w.count}`} style={{ height: `${Math.max(3, (w.count / maxWeek) * 100)}%` }} />
              ))}
            </div>
            <div className="zd-row" style={{ justifyContent: "space-between", fontSize: 12 }}>
              <span className="zd-muted">{fmtDate(weeks[0]?.start ?? null)}</span>
              <span className="zd-muted">This week: {weeks.at(-1)?.count ?? 0}</span>
            </div>
          </div>
        </section>

        <section className="zd-section" aria-label="Latest signups">
          <h2 className="zd-h3">Latest signups</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th style={{ padding: "8px 6px" }}>Email</th>
                  <th style={{ padding: "8px 6px" }}>Joined</th>
                  <th style={{ padding: "8px 6px" }}>Last seen</th>
                  <th style={{ padding: "8px 6px" }}>Plan</th>
                  <th style={{ padding: "8px 6px" }}>Rivals</th>
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="zd-muted" style={{ padding: 12 }}>No signups yet. Share a rival teardown to get the first one.</td>
                  </tr>
                ) : (
                  recent.map((u) => {
                    const b = billingByUser.get(u.id);
                    return (
                      <tr key={u.id} style={{ borderTop: "1px solid var(--zt-border-subtle)" }}>
                        <td style={{ padding: "8px 6px" }}>{u.email ?? "—"}</td>
                        <td style={{ padding: "8px 6px" }}>{fmtDate(u.created_at)}</td>
                        <td style={{ padding: "8px 6px" }}>{fmtDate(u.last_sign_in_at)}</td>
                        <td style={{ padding: "8px 6px" }}>{b ? `${b.plan} · ${b.status}` : "—"}</td>
                        <td style={{ padding: "8px 6px" }}>{data.rivals.get(u.id) ?? 0}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="zd-section" aria-label="Data and payments health">
          <h2 className="zd-h3">Health</h2>
          <div className="zd-grid-3">
            <Stat value={data.ads24.toLocaleString("en-IN")} label={`Ads collected in 24 h (${data.ads7.toLocaleString("en-IN")} in 7 days)`} tone={data.ads24 ? undefined : "warn"} />
            <Stat value={fmtTime(data.lastAdAt)} label={collectorStale ? "Last ad collected: collector may be down" : "Last ad collected"} tone={collectorStale ? "warn" : undefined} />
            <Stat value={data.events.length ? fmtTime(data.events[0].received_at) : "—"} label={data.events.length ? `Last Razorpay event: ${data.events[0].event}` : "No Razorpay events yet"} />
          </div>
          {data.events.length ? (
            <ul className="zd-muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {data.events.map((e, i) => (
                <li key={`${e.received_at}-${i}`}>
                  {fmtTime(e.received_at)} · {e.event}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </TodayShell>
  );
}
