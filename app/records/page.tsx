"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CalculatedReport, ParsedReport } from "@/lib/types/domain";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type MonthlyRecord = {
  id: string;
  user_id: string;
  user_email: string;
  month_key: string;
  report_input: ParsedReport;
  report_data: CalculatedReport;
  created_at: string;
  updated_at: string;
};

export default function RecordsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState<string>("");
  const [monthlyRecords, setMonthlyRecords] = useState<MonthlyRecord[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [adminTargetEmail, setAdminTargetEmail] = useState<string>("");
  const [monthKey, setMonthKey] = useState<string>(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    let active = true;
    async function hydrateUser() {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (!active) return;
        setUserId(data.user?.id ?? "");
        setUserEmail(data.user?.email ?? "");
      } catch {
        if (!active) return;
        setUserId("");
        setUserEmail("");
      }
    }
    void hydrateUser();
    return () => {
      active = false;
    };
  }, []);

  async function loadMonthlyRecords() {
    if (!userId) {
      setRecordsError("Login required to load monthly records");
      return;
    }
    setRecordsLoading(true);
    setRecordsError("");

    try {
      const supabase = createClient();
      let query = supabase
        .from("monthly_records")
        .select("*")
        .order("month_key", { ascending: false })
        .limit(24);

      const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "").trim().toLowerCase();
      const isAdmin = !!adminEmail && userEmail.toLowerCase() === adminEmail;

      if (isAdmin && adminTargetEmail.trim()) {
        const res = await fetch(`/api/admin/monthly-records?email=${encodeURIComponent(adminTargetEmail.trim().toLowerCase())}`);
        const json = (await res.json()) as { records?: MonthlyRecord[]; error?: string };
        if (!res.ok) throw new Error(json.error || "Unable to load admin records");
        setMonthlyRecords(json.records ?? []);
        return;
      } else {
        query = query.eq("user_id", userId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setMonthlyRecords((data ?? []) as MonthlyRecord[]);
    } catch (err) {
      setRecordsError(err instanceof Error ? err.message : "Failed to load monthly records");
    } finally {
      setRecordsLoading(false);
    }
  }

  function downloadAllRecordsCsv() {
    if (monthlyRecords.length === 0) return;
    const headerRow = [
      "Month",
      "Unit Economics: Contribution Margin %",
      "Unit Economics: Max Allowable CAC",
      "Ad Metrics: Blended ROAS",
      "Ad Metrics: Blended CAC",
      "Ad Metrics: Total Ad Spend",
      "Scale Planner: Readiness",
      "Scale Planner: Allocation Total %",
      "Monthly P&L: Net Revenue",
      "Monthly P&L: Net Profit",
      "Monthly P&L: Net Margin %"
    ];
    const rows = monthlyRecords.map((r) => [
      r.month_key,
      r.report_data.unitEconomics.contributionMarginPct,
      r.report_data.unitEconomics.maxAllowableCac,
      r.report_data.adMetrics.blendedRoas,
      r.report_data.adMetrics.blendedCac,
      r.report_data.adMetrics.totalAdSpend,
      r.report_data.scalePlanner.readiness,
      r.report_data.scalePlanner.allocationTotalPct,
      r.report_data.monthlyPnl.netRevenueMonth,
      r.report_data.monthlyPnl.netProfitMonth,
      r.report_data.monthlyPnl.netProfitMarginPct
    ]);
    const csv = [headerRow.join(","), ...rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, "\"\"")}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `monthly-records-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const totals = useMemo(
    () =>
      monthlyRecords.reduce(
        (acc, row) => {
          acc.revenue += row.report_data.monthlyPnl.netRevenueMonth;
          acc.profit += row.report_data.monthlyPnl.netProfitMonth;
          return acc;
        },
        { revenue: 0, profit: 0 }
      ),
    [monthlyRecords]
  );

  useEffect(() => {
    if (userId) {
      void loadMonthlyRecords();
    }
  }, [userId, adminTargetEmail]);

  function pct(n: number) {
    return `${(n * 100).toFixed(1)}%`;
  }

  function inr(n: number) {
    return `INR ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <main className="main records-page">
      <div className="section-head">
        <h2>Monthly Records Vault</h2>
        <p className="muted-text">Full archive of unit economics, ad metrics, scale planner, and P&L snapshots.</p>
      </div>
      <div className="action-row">
        <Button type="button" variant="secondary" onClick={() => router.push("/dashboard")}>
          ← Back to Dashboard
        </Button>
        <Button type="button" variant="secondary" onClick={downloadAllRecordsCsv} disabled={monthlyRecords.length === 0}>
          Download CSV
        </Button>
        <Button type="button" variant="secondary" onClick={loadMonthlyRecords} disabled={recordsLoading}>
          {recordsLoading ? "Refreshing..." : "Refresh"}
        </Button>
        <Label className="input-row" style={{ minWidth: 180 }}>
          <span>Month</span>
          <Input type="month" value={monthKey} onChange={(e) => setMonthKey(e.target.value)} />
        </Label>
        {process.env.NEXT_PUBLIC_ADMIN_EMAIL ? (
          <Label className="input-row" style={{ minWidth: 240 }}>
            <span>Admin: user email filter</span>
            <Input
              type="email"
              placeholder="user@example.com"
              value={adminTargetEmail}
              onChange={(e) => setAdminTargetEmail(e.target.value)}
            />
          </Label>
        ) : null}
      </div>

      {recordsError ? <p className="error-text">{recordsError}</p> : null}

      <div className="records-summary">
        <Badge variant="secondary">Months: {monthlyRecords.length}</Badge>
        <Badge variant="secondary">Total Revenue: {inr(totals.revenue)}</Badge>
        <Badge variant={totals.profit >= 0 ? "success" : "warning"}>Total Profit: {inr(totals.profit)}</Badge>
      </div>

      <div className="records-table-wrap scrollbar-styled">
        <table className="records-table">
          <thead>
           
            <tr>
              <th>Contribution Margin %</th>
              <th>Max Allowable CAC</th>
              <th>Blended ROAS</th>
              <th>Blended CAC</th>
              <th>Total Ad Spend</th>
              <th>Readiness</th>
              <th>Allocation %</th>
              <th>Net Revenue</th>
              <th>Net Profit</th>
              <th>Net Margin %</th>
            </tr>
          </thead>
          <tbody>
            {monthlyRecords.length === 0 ? (
              <tr>
                <td colSpan={12} className="muted-text">No records saved yet.</td>
              </tr>
            ) : (
              monthlyRecords.map((row) => (
                <React.Fragment key={row.id}>
                <tr>
                  <td>{row.month_key}</td>
                  <td>{pct(row.report_data.unitEconomics.contributionMarginPct)}</td>
                  <td>{inr(row.report_data.unitEconomics.maxAllowableCac)}</td>
                  <td>{row.report_data.adMetrics.blendedRoas.toFixed(2)}x</td>
                  <td>{inr(row.report_data.adMetrics.blendedCac)}</td>
                  <td>{inr(row.report_data.adMetrics.totalAdSpend)}</td>
                  <td>{row.report_data.scalePlanner.readiness}</td>
                  <td>{pct(row.report_data.scalePlanner.allocationTotalPct)}</td>
                  <td>{inr(row.report_data.monthlyPnl.netRevenueMonth)}</td>
                  <td>{inr(row.report_data.monthlyPnl.netProfitMonth)}</td>
                  <td>{pct(row.report_data.monthlyPnl.netProfitMarginPct)}</td>
                  <td>
                    <Button type="button" variant="secondary" onClick={() => toggleExpanded(row.id)}>
                      {expandedIds.has(row.id) ? "Hide" : "View"} →
                    </Button>
                  </td>
                </tr>
                {expandedIds.has(row.id) ? (
                  <tr className="records-detail-row">
                    <td colSpan={8} className="records-detail-cell">
                      <div className="records-detail">
                        <div className="records-detail-grid">
                          <article className="records-detail-card">
                              <h4>Unit Economics Input</h4>
                              <div className="records-detail-list">
                              <span>Selling Price: {inr(row.report_input.unitEconomicsInput.sellingPrice)}</span>
                              <span>Discount: {inr(row.report_input.unitEconomicsInput.discount)}</span>
                              <span>GST Rate: {pct(row.report_input.unitEconomicsInput.gstRate)}</span>
                              <span>COGS Parts: {row.report_input.unitEconomicsInput.cogsParts.map((p) => inr(p)).join(", ")}</span>
                              <span>Shipping: {inr(row.report_input.unitEconomicsInput.shipping)}</span>
                              <span>COD Fee: {inr(row.report_input.unitEconomicsInput.codFee)}</span>
                              <span>Payment Gateway %: {pct(row.report_input.unitEconomicsInput.paymentGatewayPct)}</span>
                              <span>Returns Rate: {pct(row.report_input.unitEconomicsInput.returnsRate)}</span>
                              <span>Return Shipping: {inr(row.report_input.unitEconomicsInput.returnShipping)}</span>
                              <span>Warehouse: {inr(row.report_input.unitEconomicsInput.warehouse)}</span>
                            </div>
                          </article>
                          <article className="records-detail-card">
                            <h4>Unit Economics Output</h4>
                            <div className="records-detail-list">
                              <span>Net Revenue Ex GST: {inr(row.report_data.unitEconomics.netRevenueExGst)}</span>
                              <span>Total COGS: {inr(row.report_data.unitEconomics.totalCogs)}</span>
                              <span>Fulfillment Cost: {inr(row.report_data.unitEconomics.fulfillmentCost)}</span>
                              <span>Gross Margin: {inr(row.report_data.unitEconomics.grossMargin)}</span>
                              <span>Contribution Margin: {inr(row.report_data.unitEconomics.contributionMargin)}</span>
                              <span>Contribution Margin %: {pct(row.report_data.unitEconomics.contributionMarginPct)}</span>
                              <span>Max Allowable CAC: {inr(row.report_data.unitEconomics.maxAllowableCac)}</span>
                            </div>
                          </article>
                          <article className="records-detail-card">
                            <h4>Ad Metrics Input</h4>
                            <div className="records-detail-list">
                              <span>Total Ad Spend: {inr(row.report_input.adMetricsInput.totalAdSpend)}</span>
                              <span>Impressions: {row.report_input.adMetricsInput.impressions.toLocaleString("en-IN")}</span>
                              <span>Clicks: {row.report_input.adMetricsInput.clicks.toLocaleString("en-IN")}</span>
                              <span>Orders: {row.report_input.adMetricsInput.orders.toLocaleString("en-IN")}</span>
                              <span>Revenue: {inr(row.report_input.adMetricsInput.revenue)}</span>
                            </div>
                          </article>
                          <article className="records-detail-card">
                            <h4>Ad Metrics Output</h4>
                            <div className="records-detail-list">
                              <span>Blended ROAS: {row.report_data.adMetrics.blendedRoas.toFixed(2)}x</span>
                              <span>Blended CAC: {inr(row.report_data.adMetrics.blendedCac)}</span>
                              <span>Blended CTR: {pct(row.report_data.adMetrics.blendedCtr)}</span>
                              <span>Blended CVR: {pct(row.report_data.adMetrics.blendedCvr)}</span>
                              <span>CPC: {inr(row.report_data.adMetrics.cpc)}</span>
                              <span>CPM: {inr(row.report_data.adMetrics.cpm)}</span>
                              <span>Total Orders: {row.report_data.adMetrics.totalOrders.toLocaleString("en-IN")}</span>
                              <span>Total Revenue: {inr(row.report_data.adMetrics.totalRevenue)}</span>
                            </div>
                          </article>
                          <article className="records-detail-card">
                            <h4>Scale Planner Input</h4>
                            <div className="records-detail-list">
                              <span>Revenue Growth Target %: {pct(row.report_input.scalePlannerInput.revenueGrowthTargetPct)}</span>
                              <span>Ad Spend Growth Target %: {pct(row.report_input.scalePlannerInput.adSpendGrowthTargetPct)}</span>
                              <span>Orders Growth Target %: {pct(row.report_input.scalePlannerInput.ordersGrowthTargetPct)}</span>
                              <span>CAC Improvement Target %: {pct(row.report_input.scalePlannerInput.cacImprovementTargetPct)}</span>
                              <span>Allocation Meta %: {pct(row.report_input.scalePlannerInput.allocationMetaPct)}</span>
                              <span>Allocation Google %: {pct(row.report_input.scalePlannerInput.allocationGooglePct)}</span>
                              <span>Allocation Other %: {pct(row.report_input.scalePlannerInput.allocationOtherPct)}</span>
                            </div>
                          </article>
                          <article className="records-detail-card">
                            <h4>Scale Planner Output</h4>
                            <div className="records-detail-list">
                              <span>Target Revenue: {inr(row.report_data.scalePlanner.targetRevenue)}</span>
                              <span>Target Ad Spend: {inr(row.report_data.scalePlanner.targetAdSpend)}</span>
                              <span>Target Orders: {row.report_data.scalePlanner.targetOrders.toLocaleString("en-IN")}</span>
                              <span>Target CAC: {inr(row.report_data.scalePlanner.targetCac)}</span>
                              <span>Budget Meta: {inr(row.report_data.scalePlanner.budgetMeta)}</span>
                              <span>Budget Google: {inr(row.report_data.scalePlanner.budgetGoogle)}</span>
                              <span>Budget Other: {inr(row.report_data.scalePlanner.budgetOther)}</span>
                              <span>Expected Orders Meta: {row.report_data.scalePlanner.expectedOrdersMeta.toLocaleString("en-IN")}</span>
                              <span>Expected Orders Google: {row.report_data.scalePlanner.expectedOrdersGoogle.toLocaleString("en-IN")}</span>
                              <span>Expected Orders Other: {row.report_data.scalePlanner.expectedOrdersOther.toLocaleString("en-IN")}</span>
                              <span>Allocation Total %: {pct(row.report_data.scalePlanner.allocationTotalPct)}</span>
                              <span>Readiness: {row.report_data.scalePlanner.readiness}</span>
                            </div>
                          </article>
                          <article className="records-detail-card">
                            <h4>Monthly P&L Output</h4>
                            <div className="records-detail-list">
                              <span>Net Revenue: {inr(row.report_data.monthlyPnl.netRevenueMonth)}</span>
                              <span>COGS: {inr(row.report_data.monthlyPnl.cogsMonth)}</span>
                              <span>Fulfillment: {inr(row.report_data.monthlyPnl.fulfillmentMonth)}</span>
                              <span>Contribution: {inr(row.report_data.monthlyPnl.contributionMonth)}</span>
                              <span>Marketing: {inr(row.report_data.monthlyPnl.marketingMonth)}</span>
                              <span>Net Profit: {inr(row.report_data.monthlyPnl.netProfitMonth)}</span>
                              <span>Net Margin %: {pct(row.report_data.monthlyPnl.netProfitMarginPct)}</span>
                            </div>
                          </article>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
