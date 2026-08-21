"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import type { CalculatedReport, ParsedReport } from "@/lib/types/domain";
import { calculateReport } from "@/lib/calc/report";
import { DEFAULT_REPORT_INPUT } from "@/lib/constants/defaultInput";
import { createClient } from "@/lib/supabase/client";
import { generateDecisions, generateMoneyAlerts } from "@/lib/llm/decision-engine";
import type { OpportunityScan, MoneyAlert } from "@/lib/llm/decision-engine";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/components/ui/theme-toggle";
 
const sectionOptions = [
  { id: "all", label: "All" },
  { id: "unit", label: "Unit Economics" },
  { id: "ad", label: "Ad Metrics" },
  { id: "performance", label: "Ad Performance" },
  { id: "library", label: "Ad Library" },
  { id: "market", label: "Market Research" },
  { id: "scale", label: "Scale Planner" },
  { id: "pnl", label: "Monthly P&L" }
] as const;

type SectionId = (typeof sectionOptions)[number]["id"];
type ActiveSection = Exclude<SectionId, "all">;

type MetricTone = "good" | "warn" | "neutral";

type MetricItem = {
  title: string;
  value: string;
  hint: string;
  tone: MetricTone;
  benchmark?: string;
};

type ToastTone = "good" | "warn" | "neutral";

type ToastMessage = {
  id: number;
  text: string;
  tone: ToastTone;
};

type ScenarioSnapshot = {
  id: number;
  name: string;
  report: CalculatedReport;
  input: ParsedReport;
  createdAt: string;
};

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

type UserProfileRow = {
  user_id: string;
  user_email: string;
  full_name: string | null;
  phone: string | null;
};

type UserWorkspaceRow = {
  user_id: string;
  user_email: string;
  latest_report_input: ParsedReport | null;
  latest_report_data: CalculatedReport | null;
  scenarios: ScenarioSnapshot[] | null;
};

type AdminUserRow = {
  user_id: string;
  user_email: string;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
  workspace_updated_at: string | null;
  active_month_key: string | null;
  scenario_count: number;
};

type ConnectedAdAccount = {
  id: string;
  platform: "meta" | "google";
  account_id: string;
  account_name?: string | null;
};

type AdMetricRow = {
  id?: string;
  platform: "meta" | "google";
  ad_id?: string | null;
  ad_name?: string | null;
  adset_id?: string | null;
  adset_name?: string | null;
  campaign_id: string;
  campaign_name: string | null;
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpc: number;
  roas: number;
};

type LibraryAd = {
  id?: string;
  platform: "meta";
  pageName?: string;
  body?: string;
  title?: string;
  caption?: string;
  startedAt?: string;
  snapshotUrl?: string;
  publisherPlatforms?: string[];
};

type GoogleLibraryInfo = {
  transparencyUrl: string;
  note: string;
} | null;

type ShopifyResearch = {
  storeUrl: string;
  products: Array<{
    id?: number;
    title: string;
    productType: string;
    vendor: string;
    minPrice: number | null;
    maxPrice: number | null;
  }>;
  summary: {
    productCount: number;
    vendorCount: number;
    vendors: string[];
    productTypes: string[];
    minPrice: number | null;
    maxPrice: number | null;
  };
  note: string;
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } }
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } }
};

function pendingInsights(summary = "Insights not generated yet"): CalculatedReport["insights"] {
  return {
    summary,
    priorityFixes: [],
    growthLevers: [],
    riskAlerts: [],
    channelPlan: [],
    experimentBacklog: [],
    cashflowActions: [],
    watchlistKpis: [],
    next30Days: [],
    source: "pending",
    latencyMs: 0
  };
}

function normalizeInsightPayload(insights: Partial<CalculatedReport["insights"]> | null | undefined): CalculatedReport["insights"] {
  const base = pendingInsights();
  if (!insights) return base;
  const asList = (value: unknown) => (Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : []);
  return {
    ...base,
    ...insights,
    summary: typeof insights.summary === "string" ? insights.summary : base.summary,
    priorityFixes: asList(insights.priorityFixes),
    growthLevers: asList(insights.growthLevers),
    riskAlerts: asList(insights.riskAlerts),
    channelPlan: asList(insights.channelPlan),
    experimentBacklog: asList(insights.experimentBacklog),
    cashflowActions: asList(insights.cashflowActions),
    watchlistKpis: asList(insights.watchlistKpis),
    next30Days: asList(insights.next30Days)
  };
}

function inr(n: number | null | undefined): string {
  const value = Number(n ?? 0);

  return `INR ${value.toLocaleString("en-IN", {
    maximumFractionDigits: 2
  })}`;
}

function pct(n: number | null | undefined): string {
  const value = Number(n ?? 0);

  return `${(value * 100).toFixed(1)}%`;
}

function MetricTile({ item }: { item: MetricItem }) {
  return (
    <article className={`metric-tile tone-${item.tone}`}>
      <div className="metric-top">
        <p className="metric-title">{item.title}</p>
        {item.benchmark ? (
          <span className="hint-wrap" tabIndex={0}>
            i
            <span className="hint-bubble">{item.benchmark}</span>
          </span>
        ) : null}
      </div>
      <p className="metric-value">{item.value}</p>
      <p className="metric-hint">{item.hint}</p>
    </article>
  );
}

function InsightList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <article className="fix-card">
      <p className="metric-title" style={{ marginBottom: 8 }}>{title}</p>
      <ul className="insight-list">
        {items.map((item, idx) => (
          <li key={`${title}-${idx}`}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = "1"
}: {
  label: string;
  value: number;
  onChange: (value: string) => void;
  step?: string;
}) {
  return (
    <Label className="input-row">
      <span>{label}</span>
      <Input type="number" step={step} value={value} onChange={(e) => onChange(e.target.value)} />
    </Label>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const percentPaths = new Set([
    "unitEconomicsInput.gstRate",
    "unitEconomicsInput.paymentGatewayPct",
    "unitEconomicsInput.returnsRate",
    "scalePlannerInput.revenueGrowthTargetPct",
    "scalePlannerInput.adSpendGrowthTargetPct",
    "scalePlannerInput.ordersGrowthTargetPct",
    "scalePlannerInput.cacImprovementTargetPct",
    "scalePlannerInput.allocationMetaPct",
    "scalePlannerInput.allocationGooglePct",
    "scalePlannerInput.allocationOtherPct"
  ]);
  const [reportInput, setReportInput] = useState<ParsedReport>(DEFAULT_REPORT_INPUT);
  const [report, setReport] = useState<CalculatedReport>(() => calculateReport(DEFAULT_REPORT_INPUT));
  const [selectedSection, setSelectedSection] = useState<SectionId>("all");
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [scenarios, setScenarios] = useState<ScenarioSnapshot[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<number | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [appliedFixes, setAppliedFixes] = useState<number[]>([]);
  const [monthKey, setMonthKey] = useState<string>(new Date().toISOString().slice(0, 7));
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState<string>("");
  const [monthlyRecords, setMonthlyRecords] = useState<MonthlyRecord[]>([]);
  const [adminTargetEmail, setAdminTargetEmail] = useState<string>("");
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState<string>("");
  const [profileName, setProfileName] = useState<string>("");
  const [profilePhone, setProfilePhone] = useState<string>("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [workspaceSyncing, setWorkspaceSyncing] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [adMetrics, setAdMetrics] = useState<AdMetricRow[]>([]);
  const [adMetricsLoading, setAdMetricsLoading] = useState(false);
  const [decisions, setDecisions] = useState<OpportunityScan | null>(null);
  const [moneyAlerts, setMoneyAlerts] = useState<MoneyAlert[]>([]);
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAdAccount[]>([]);
  const [adLibraryQuery, setAdLibraryQuery] = useState("");
  const [adLibraryCountry, setAdLibraryCountry] = useState("IN");
  const [metaLibraryAds, setMetaLibraryAds] = useState<LibraryAd[]>([]);
  const [googleLibraryInfo, setGoogleLibraryInfo] = useState<GoogleLibraryInfo>(null);
  const [adLibraryLoading, setAdLibraryLoading] = useState(false);
  const [metaLibraryError, setMetaLibraryError] = useState("");
  const [adIntegrationSetupRequired, setAdIntegrationSetupRequired] = useState(false);
  const [shopifyStoreUrl, setShopifyStoreUrl] = useState("");
  const [shopifyResearch, setShopifyResearch] = useState<ShopifyResearch | null>(null);
  const [shopifyResearchLoading, setShopifyResearchLoading] = useState(false);
  const [shopifyResearchError, setShopifyResearchError] = useState("");
  const lastToastRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });

  function pushToast(text: string, tone: ToastTone = "neutral") {
    const now = Date.now();
    if (lastToastRef.current.text === text && now - lastToastRef.current.at < 1200) return;
    lastToastRef.current = { text, at: now };
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2400);
  }

  async function syncProfileToDatabase(
    supabase: ReturnType<typeof createClient>,
    id: string,
    email: string,
    fullName: string,
    phone: string
  ) {
    const payload = {
      user_id: id,
      user_email: email.toLowerCase(),
      full_name: fullName || null,
      phone: phone || null
    };
    const { error } = await supabase.from("user_profiles").upsert(payload, { onConflict: "user_id" });
    if (error) throw error;
  }

  async function loadProfileFromDatabase(supabase: ReturnType<typeof createClient>, id: string) {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("user_id,user_email,full_name,phone")
      .eq("user_id", id)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as UserProfileRow | null;
  }

  async function persistWorkspaceToDatabase(
    input: ParsedReport,
    data: CalculatedReport,
    scenarioList: ScenarioSnapshot[],
    scenarioId: number | null,
    month: string,
    muteToast = true
  ) {
    if (!userId || !userEmail) return;
    setWorkspaceSyncing(true);
    try {
      const supabase = createClient();
      const payload = {
        user_id: userId,
        user_email: userEmail.toLowerCase(),
        latest_report_input: input,
        latest_report_data: data,
        scenarios: scenarioList,
        selected_scenario_id: scenarioId,
        month_key: month
      };
      const { error } = await supabase.from("user_workspaces").upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
      if (!muteToast) pushToast("Workspace synced to cloud", "good");
    } catch (err) {
      if (!muteToast) {
        pushToast(err instanceof Error ? err.message : "Unable to sync workspace", "warn");
      }
    } finally {
      setWorkspaceSyncing(false);
    }
  }

  async function loadWorkspaceFromDatabase(supabase: ReturnType<typeof createClient>, id: string) {
    const { data, error } = await supabase
      .from("user_workspaces")
      .select("user_id,user_email,latest_report_input,latest_report_data,scenarios,selected_scenario_id,month_key")
      .eq("user_id", id)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as (UserWorkspaceRow & { selected_scenario_id?: number | null; month_key?: string | null }) | null;
  }

  useEffect(() => {
    const savedInput = sessionStorage.getItem("reportInput");
    const savedReport = sessionStorage.getItem("report");

    if (savedInput) {
      try {
        const parsedInput = JSON.parse(savedInput) as ParsedReport;
        setReportInput(parsedInput);
        setReport(calculateReport(parsedInput));
      } catch {
        setReportInput(DEFAULT_REPORT_INPUT);
        setReport(calculateReport(DEFAULT_REPORT_INPUT));
      }
    }

    if (savedReport) {
      try {
        const parsedReport = JSON.parse(savedReport) as CalculatedReport;
        if (parsedReport?.insights) {
          setReport((prev) => ({ ...prev, insights: normalizeInsightPayload(parsedReport.insights) }));
        }
      } catch {
        // no-op
      }
    }
  }, []);

  useEffect(() => {
    const seen = localStorage.getItem("seenOnboardingV1");
    if (!seen) setShowOnboarding(true);
  }, []);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    const applyUserContext = async (user: { id?: string; email?: string; user_metadata?: Record<string, unknown> } | null | undefined) => {
      if (!active) return;
      try {
        const email = user?.email ?? "";
        const id = user?.id ?? "";
        const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
        const fullName = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : "";
        const phone = typeof meta.phone === "string" ? meta.phone : "";

        setUserEmail(email);
        setUserId(id);

        if (!id || !email) {
          setUserName("");
          setAuthChecked(true);
          return;
        }

        await syncProfileToDatabase(supabase, id, email, fullName.trim(), phone.trim());
        const profile = await loadProfileFromDatabase(supabase, id);
        if (active) {
          const resolvedName = (profile?.full_name ?? fullName).trim();
          const resolvedPhone = (profile?.phone ?? phone).trim();
          setUserName(resolvedName);
          setProfileName(resolvedName);
          setProfilePhone(resolvedPhone);
          if (!resolvedName || !resolvedPhone) {
            setProfileOpen(true);
          }
        }

        const workspace = await loadWorkspaceFromDatabase(supabase, id);
        if (active && workspace?.latest_report_input) {
          const nextInput = workspace.latest_report_input;
          const calculated = calculateReport(nextInput);
          const loadedReport = workspace.latest_report_data
            ? { ...calculated, ...workspace.latest_report_data, insights: normalizeInsightPayload(workspace.latest_report_data.insights) }
            : { ...calculated, insights: pendingInsights() };

          setReportInput(nextInput);
          setReport(loadedReport);
          setScenarios(Array.isArray(workspace.scenarios) ? workspace.scenarios.slice(0, 3) : []);
          setSelectedScenarioId(typeof workspace.selected_scenario_id === "number" ? workspace.selected_scenario_id : null);
          if (workspace.month_key) setMonthKey(workspace.month_key);
          setDirty(false);
        }
      } catch {
        if (!active) return;
        setUserEmail("");
        setUserId("");
        setUserName("");
      } finally {
        if (active) setAuthChecked(true);
      }
    };

    async function hydrateUserContext() {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session?.user) {
          await applyUserContext(sessionData.session.user);
          return;
        }
        const { data } = await supabase.auth.getUser();
        await applyUserContext(data.user);
      } catch {
        if (!active) return;
        setUserEmail("");
        setUserId("");
        setUserName("");
      }
    }

    void hydrateUserContext();
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      void applyUserContext(session?.user ?? null);
    });

    return () => {
      active = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (authChecked && !userId) {
      router.push("/login?next=/dashboard");
    }
  }, [authChecked, userId, router]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setPaletteOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    loadMonthlyRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, adminTargetEmail]);

  useEffect(() => {
    const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "").trim().toLowerCase();
    const canViewAdminUsers = !!adminEmail && userEmail.toLowerCase() === adminEmail;
    if (!userId || !canViewAdminUsers) return;
    void loadAdminUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, userEmail, adminTargetEmail]);

  useEffect(() => {
    if (!userId) return;
    void loadAdMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const allocationTotal = useMemo(
    () =>
      reportInput.scalePlannerInput.allocationMetaPct +
      reportInput.scalePlannerInput.allocationGooglePct +
      reportInput.scalePlannerInput.allocationOtherPct,
    [reportInput]
  );

  const sectionStatus = useMemo(() => {
    return {
      unit: report.unitEconomics.contributionMarginPct >= 0.3 ? "Healthy" : "Warning",
      ad: report.adMetrics.blendedRoas >= 3 && report.adMetrics.blendedCac <= report.unitEconomics.maxAllowableCac ? "Healthy" : "Warning",
      performance: connectedAccounts.length > 0 ? "Connected" : "Not Connected",
      library: metaLibraryAds.length > 0 || googleLibraryInfo ? "Ready" : "Not Searched",
      market: metaLibraryAds.length > 0 || shopifyResearch ? "Ready" : "Not Searched",
      scale: report.scalePlanner.readiness === "READY TO SCALE" ? "Ready" : "Hold",
      pnl: report.monthlyPnl.netProfitMarginPct >= 0.1 ? "Healthy" : "Low Margin"
    };
  }, [report, connectedAccounts.length, metaLibraryAds.length, googleLibraryInfo]);

  const heroKpis = useMemo(
    () => [
      {
        title: "Contribution Margin",
        value: pct(report.unitEconomics.contributionMarginPct),
        hint: report.unitEconomics.contributionMarginPct >= 0.3 ? "Healthy unit economics" : "Focus on margin leak points",
        tone: report.unitEconomics.contributionMarginPct >= 0.3 ? "good" : "warn",
        benchmark: "Target > 30% contribution margin"
      },
      {
        title: "Retained Revenue",
        value: inr(report.monthlyPnl.retainedRevenueMonth),
        hint: "Revenue after returns and fees",
        tone: "neutral"
      },
      {
        title: "Profit Leak",
        value: inr(report.monthlyPnl.profitLeakMonth),
        hint: report.monthlyPnl.profitLeakMonth > 0 ? "Current ad spend exceeds contribution" : "Marketing is covered by contribution",
        tone: report.monthlyPnl.profitLeakMonth > 0 ? "warn" : "good"
      },
      {
        title: "Scale Verdict",
        value: report.scalePlanner.readiness,
        hint: dirty ? "Draft not applied" : "Based on latest applied plan",
        tone: report.scalePlanner.readiness === "READY TO SCALE" ? "good" : "neutral",
        benchmark: "Clear only when economics and CAC match"
      }
    ],
    [report, dirty]
  );

  function normalizePercentValue(path: string, value: number) {
    if (!percentPaths.has(path)) return value;
    return Math.abs(value) > 1 ? value / 100 : value;
  }

  function updateNumber(path: string, value: string) {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    const sanitized = normalizePercentValue(path, n);

    setReportInput((prev) => {
      const next = structuredClone(prev);
      const keys = path.split(".");
      let ref: unknown = next;

      for (let i = 0; i < keys.length - 1; i += 1) {
        ref = (ref as Record<string, unknown>)[keys[i]];
      }

      (ref as Record<string, unknown>)[keys[keys.length - 1]] = sanitized;
      return next;
    });

    setDirty(true);
  }

  function applyChanges(scopeLabel = "All", nextInput?: ParsedReport) {
   setRecalcLoading(true);

try {
  const inputToUse = nextInput ?? reportInput;

  if (nextInput) {
    setReportInput(nextInput);
  }

  const next = calculateReport(inputToUse);


// Preserve the previously generated AI insights.
// They are still valid for the previous calculation and should
// remain visible until the user explicitly regenerates them.
const merged = {
  ...next,
  insights: report.insights
    ? {
        ...report.insights,
        // Keep the existing source/latency and mark that these
        // insights were generated from the previous calculation.
      }
    : pendingInsights()
};

setReport(merged);

  // Generate decisions and alerts automatically
  const newDecisions = generateDecisions(next);
  const newAlerts = generateMoneyAlerts(next);

  setDecisions(newDecisions);
  setMoneyAlerts(newAlerts);

  sessionStorage.setItem("reportInput", JSON.stringify(inputToUse));
  sessionStorage.setItem("report", JSON.stringify(merged));

  void persistWorkspaceToDatabase(
    inputToUse,
    merged,
    scenarios,
    selectedScenarioId,
    monthKey
  );

  setDirty(false);

  pushToast(`${scopeLabel} changes applied`, "good");
} finally {
  setRecalcLoading(false);
}
  }

  function applySectionChanges(id: ActiveSection) {
    setSelectedSection(id);
    const sectionLabel = sectionOptions.find((opt) => opt.id === id)?.label ?? id;
    applyChanges(sectionLabel);
  }

 function resetToDefaults() {
  setReportInput(DEFAULT_REPORT_INPUT);

  const next = calculateReport(DEFAULT_REPORT_INPUT);

  const previousInsights = report.insights;

  const merged: CalculatedReport = {
    ...next,

    insights:
      previousInsights?.source === "gemini"
        ? {
            ...previousInsights,
            basedOnPreviousCalculation: true,
          }
        : previousInsights?.source === "fallback"
          ? {
              ...previousInsights,
              basedOnPreviousCalculation: true,
            }
          : pendingInsights(),
  };

  setReport(merged);

  setScenarios([]);
  setSelectedScenarioId(null);

  sessionStorage.setItem(
    "reportInput",
    JSON.stringify(DEFAULT_REPORT_INPUT)
  );

  sessionStorage.setItem(
    "report",
    JSON.stringify(merged)
  );

  void persistWorkspaceToDatabase(
    DEFAULT_REPORT_INPUT,
    merged,
    [],
    null,
    monthKey
  );

  setDirty(false);

  pushToast("Default assumptions loaded", "neutral");
}

  function loadSampleData() {
  setSelectedSection("all");
  setReportInput(DEFAULT_REPORT_INPUT);

  const next = calculateReport(DEFAULT_REPORT_INPUT);

  setReport({ ...next, insights: pendingInsights() });

  setScenarios([]);
  setSelectedScenarioId(null);
  setDirty(false);
  setAppliedFixes([]);

  sessionStorage.setItem(
    "reportInput",
    JSON.stringify(DEFAULT_REPORT_INPUT)
  );

  sessionStorage.setItem("report", JSON.stringify({ ...next, insights: pendingInsights() }));
  void persistWorkspaceToDatabase(DEFAULT_REPORT_INPUT, { ...next, insights: pendingInsights() }, [], null, monthKey);
  setInsightsError(null);
  setAppliedFixes([]);
  pushToast("Sample data loaded. Click Get AI Insights when ready.", "good");
}

  function closeOnboarding() {
    setShowOnboarding(false);
    localStorage.setItem("seenOnboardingV1", "1");
  }

  function saveScenario() {
    const nextScenario: ScenarioSnapshot = {
      id: Date.now(),
      name: `Scenario ${scenarios.length + 1}`,
      report,
      input: reportInput,
      createdAt: new Date().toLocaleString()
    };
    setScenarios((prev) => [nextScenario, ...prev].slice(0, 3));
    setSelectedScenarioId(nextScenario.id);
    const nextScenarios = [nextScenario, ...scenarios].slice(0, 3);
    void persistWorkspaceToDatabase(reportInput, report, nextScenarios, nextScenario.id, monthKey);
    pushToast(`${nextScenario.name} saved`, "good");
  }

  function loadScenario(id: number) {
    const scenario = scenarios.find((s) => s.id === id);
    if (!scenario) return;
    setReportInput(structuredClone(scenario.input));
    setReport(structuredClone(scenario.report));
    setSelectedScenarioId(id);
    setDirty(false);
    sessionStorage.setItem("reportInput", JSON.stringify(scenario.input));
    sessionStorage.setItem("report", JSON.stringify(scenario.report));
    void persistWorkspaceToDatabase(scenario.input, scenario.report, scenarios, id, monthKey);
    pushToast(`${scenario.name} loaded`, "neutral");
  }

  function applyPriorityFix(index: number) {
    if (appliedFixes.includes(index)) return;
    const fix = report.insights.priorityFixes[index];
    if (!fix) return;

    const nextInput = structuredClone(reportInput);
    const lower = fix.toLowerCase();

    if (lower.includes("roas")) {
      nextInput.adMetricsInput.revenue = Math.round(nextInput.adMetricsInput.revenue * 1.1);
    } else if (lower.includes("contribution")) {
      nextInput.unitEconomicsInput.cogsParts = nextInput.unitEconomicsInput.cogsParts.map((v) => Math.max(0, Math.round(v * 0.95)));
    } else if (lower.includes("cac")) {
      nextInput.adMetricsInput.totalAdSpend = Math.round(nextInput.adMetricsInput.totalAdSpend * 0.9);
    } else {
      nextInput.unitEconomicsInput.discount = Math.max(0, Math.round(nextInput.unitEconomicsInput.discount * 0.95));
    }

    setReportInput(nextInput);
    setDirty(true);
    setAppliedFixes((prev) => [...prev, index]);
    pushToast("Applied AI fix draft to inputs", "good");
  }

  function dismissPriorityFix(index: number) {
    const nextFixes = report.insights.priorityFixes.filter((_, i) => i !== index);
    const merged = {
      ...report,
      insights: {
        ...report.insights,
        priorityFixes: nextFixes
      }
    };
    setReport(merged);
    sessionStorage.setItem("report", JSON.stringify(merged));
    setAppliedFixes([]);
    pushToast("Priority fix dismissed", "neutral");
  }

  async function generateInsights() {
    setInsightsLoading(true);
    setInsightsError(null);
      try {
        const res = await fetch("/api/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(report)
        });
        if (!res.ok) {
          const errorJson = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(errorJson?.error || "Insights API failed");
        }
        const insights = normalizeInsightPayload((await res.json()) as Partial<CalculatedReport["insights"]>);
      const merged = { ...report, insights };
      setReport(merged);
      sessionStorage.setItem("report", JSON.stringify(merged));
      void persistWorkspaceToDatabase(reportInput, merged, scenarios, selectedScenarioId, monthKey);
      setAppliedFixes([]);
      pushToast("AI insights generated", "good");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to generate insights";
      setInsightsError(message);
      pushToast(message, "warn");
    } finally {
      setInsightsLoading(false);
    }
  }

  async function saveProfileDetails() {
    const fullName = profileName.trim();
    const phone = profilePhone.trim();
    if (!userId || !userEmail) {
      pushToast("Login required to save profile", "warn");
      return;
    }
    if (!fullName || !phone) {
      pushToast("Name and phone are required", "warn");
      return;
    }

    setProfileSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: fullName,
          phone
        }
      });
      if (error) throw error;
      await syncProfileToDatabase(supabase, userId, userEmail, fullName, phone);
      setUserName(fullName);
      setProfileOpen(false);
      pushToast("Profile details saved", "good");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Unable to save profile details", "warn");
    } finally {
      setProfileSaving(false);
    }
  }

  function runCommand(commandId: string) {
    switch (commandId) {
      case "go-all":
        setSelectedSection("all");
        break;
      case "go-unit":
        setSelectedSection("unit");
        break;
      case "go-ad":
        setSelectedSection("ad");
        break;
      case "go-zwirk":
        router.push("/zwirk");
        break;
      case "go-scale":
        setSelectedSection("scale");
        break;
      case "go-pnl":
        setSelectedSection("pnl");
        break;
      case "apply":
        applyChanges();
        break;
      case "reset":
        resetToDefaults();
        break;
      case "sample":
        loadSampleData();
        break;
      case "scenario":
        saveScenario();
        break;
      case "insights":
        generateInsights();
        break;
      default:
        break;
    }
    setPaletteOpen(false);
    setPaletteQuery("");
  }

  function getSectionMetrics(id: SectionId, data: CalculatedReport): MetricItem[] {
    if (id === "unit") {
      return [
        { title: "Net Revenue / Order", value: inr(data.unitEconomics.netRevenueExGst), hint: "Post GST adjustment", tone: "neutral" },
        { title: "Total COGS / Order", value: inr(data.unitEconomics.totalCogs), hint: "Material + packaging + freight", tone: "neutral" },
        { title: "Fulfillment / Order", value: inr(data.unitEconomics.fulfillmentCost), hint: "Shipping + returns + warehouse", tone: "neutral" },
        { title: "Gross Margin / Order", value: inr(data.unitEconomics.grossMargin), hint: "Revenue minus direct product costs", tone: "neutral" },
        {
          title: "Contribution / Order",
          value: inr(data.unitEconomics.contributionMargin),
          hint: data.unitEconomics.contributionMargin > 0 ? "Positive after variable costs" : "Negative contribution",
          tone: data.unitEconomics.contributionMargin > 0 ? "good" : "warn"
        },
        {
          title: "Contribution Margin %",
          value: pct(data.unitEconomics.contributionMarginPct),
          hint: data.unitEconomics.contributionMarginPct >= 0.3 ? "Above 30% benchmark" : "Below 30% benchmark",
          tone: data.unitEconomics.contributionMarginPct >= 0.3 ? "good" : "warn",
          benchmark: "Target > 30%"
        },
        { title: "Max Allowable CAC", value: inr(data.unitEconomics.maxAllowableCac), hint: "Upper bound before losing contribution", tone: "neutral" }
      ];
    }

    if (id === "ad") {
      return [
        { title: "Total Ad Spend", value: inr(data.adMetrics.totalAdSpend), hint: "Current media budget", tone: "neutral" },
        { title: "Ad Revenue", value: inr(data.adMetrics.totalRevenue), hint: "Attributed topline", tone: "neutral" },
        { title: "Orders", value: String(data.adMetrics.totalOrders), hint: "Converted purchases", tone: "neutral" },
        {
          title: "Blended ROAS",
          value: `${data.adMetrics.blendedRoas.toFixed(2)}x`,
          hint: data.adMetrics.blendedRoas >= 3 ? "Efficient spend" : "Efficiency below 3x",
          tone: data.adMetrics.blendedRoas >= 3 ? "good" : "warn",
          benchmark: "Target >= 3x"
        },
        {
          title: "Blended CAC",
          value: inr(data.adMetrics.blendedCac),
          hint: data.adMetrics.blendedCac <= data.unitEconomics.maxAllowableCac ? "Within allowable CAC" : "Above allowable CAC",
          tone: data.adMetrics.blendedCac <= data.unitEconomics.maxAllowableCac ? "good" : "warn",
          benchmark: "Should stay below Max Allowable CAC"
        },
        { title: "CTR", value: pct(data.adMetrics.blendedCtr), hint: "Creative and targeting response", tone: "neutral" },
        { title: "CVR", value: pct(data.adMetrics.blendedCvr), hint: "Landing and checkout conversion", tone: "neutral" },
        { title: "CPC / CPM", value: `${inr(data.adMetrics.cpc)} / ${inr(data.adMetrics.cpm)}`, hint: "Traffic pricing", tone: "neutral" }
      ];
    }

    if (id === "scale") {
      return [
        { title: "Target Revenue", value: inr(data.scalePlanner.targetRevenue), hint: "Projected topline", tone: "neutral" },
        { title: "Target Ad Spend", value: inr(data.scalePlanner.targetAdSpend), hint: "Projected media budget", tone: "neutral" },
        { title: "Target Orders", value: String(data.scalePlanner.targetOrders), hint: "Projected demand", tone: "neutral" },
        { title: "Target CAC", value: inr(data.scalePlanner.targetCac), hint: "Required customer cost", tone: "neutral" },
        { title: "Meta Budget", value: inr(data.scalePlanner.budgetMeta), hint: "Platform allocation", tone: "neutral" },
        { title: "Google Budget", value: inr(data.scalePlanner.budgetGoogle), hint: "Platform allocation", tone: "neutral" },
        { title: "Other Budget", value: inr(data.scalePlanner.budgetOther), hint: "Platform allocation", tone: "neutral" },
        {
          title: "Scale Verdict",
          value: data.scalePlanner.readiness,
          hint: data.scalePlanner.readiness === "READY TO SCALE" ? "Current profile supports growth" : "Fix unit/media constraints first",
          tone: data.scalePlanner.readiness === "READY TO SCALE" ? "good" : "warn",
          benchmark: "Needs margin + CAC + ROAS + 100% allocation"
        }
      ];
    }

    if (id === "performance") {
      const platforms = adMetrics.reduce<Record<string, AdMetricRow[]>>((acc, m) => {
        if (!acc[m.platform]) acc[m.platform] = [];
        acc[m.platform].push(m);
        return acc;
      }, {});

      const stats = Object.entries(platforms).map(([platform, metrics]) => {
        const totalSpend = metrics.reduce((sum, m) => sum + (m.spend || 0), 0);
        const totalRoas = metrics.reduce((sum, m) => sum + (m.roas || 0), 0) / metrics.length;
        const totalImpressions = metrics.reduce((sum, m) => sum + (m.impressions || 0), 0);
        const tone: MetricTone = totalRoas >= 3 ? "good" : totalRoas >= 2 ? "warn" : "neutral";

        return {
          title: `${platform.toUpperCase()}: Total Spend`,
          value: inr(totalSpend),
          hint: `${metrics.length} campaigns, ${totalImpressions} impressions`,
          tone
        };
      });

      return stats.length > 0 ? stats : [
        { title: "No Data", value: "—", hint: "Connect ad accounts to see performance", tone: "neutral" }
      ];
    }

    if (id === "library") {
      return [
        {
          title: "Meta Library Ads",
          value: String(metaLibraryAds.length),
          hint: metaLibraryAds.length > 0 ? "Public Meta ads found" : "Search a brand or keyword",
          tone: metaLibraryAds.length > 0 ? "good" : "neutral"
        },
        {
          title: "Google Transparency",
          value: googleLibraryInfo ? "Link Ready" : "Not Searched",
          hint: "Google public competitor discovery opens in Transparency Center",
          tone: googleLibraryInfo ? "good" : "neutral"
        }
      ];
    }

    if (id === "market") {
      return [
        {
          title: "Meta Ads",
          value: String(metaLibraryAds.length),
          hint: "Public competitor creatives found",
          tone: metaLibraryAds.length > 0 ? "good" : "neutral"
        },
        {
          title: "Shopify Products",
          value: String(shopifyResearch?.summary.productCount || 0),
          hint: shopifyResearch ? "Public catalog products" : "Add a Shopify store URL",
          tone: shopifyResearch ? "good" : "neutral"
        },
        {
          title: "Observed Price Range",
          value: shopifyResearch && shopifyResearch.summary.minPrice !== null && shopifyResearch.summary.maxPrice !== null
            ? `${inr(shopifyResearch.summary.minPrice)} - ${inr(shopifyResearch.summary.maxPrice)}`
            : "Not searched",
          hint: "Public catalog benchmark",
          tone: shopifyResearch ? "good" : "neutral"
        }
      ];
    }

    return [
      { title: "Net Revenue", value: inr(data.monthlyPnl.netRevenueMonth), hint: "Topline after returns", tone: "neutral" },
      { title: "Retained Revenue", value: inr(data.monthlyPnl.retainedRevenueMonth), hint: "Revenue left after returns", tone: "neutral" },
      { title: "Return Loss", value: inr(data.monthlyPnl.returnLossMonth), hint: "Revenue lost to returns", tone: data.monthlyPnl.returnLossMonth > 0 ? "warn" : "neutral" },
      { title: "Contribution", value: inr(data.monthlyPnl.contributionMonth), hint: "What remains before marketing", tone: "neutral" },
      { title: "Marketing Cost", value: inr(data.monthlyPnl.marketingMonth), hint: "Media spend for the period", tone: "neutral" },
      { title: "Profit Leak", value: inr(data.monthlyPnl.profitLeakMonth), hint: "Amount marketing exceeds contribution", tone: data.monthlyPnl.profitLeakMonth > 0 ? "warn" : "good" },
      {
        title: "Net Profit",
        value: inr(data.monthlyPnl.netProfitMonth),
        hint: data.monthlyPnl.netProfitMonth > 0 ? "Profitable month" : "Loss-making month",
        tone: data.monthlyPnl.netProfitMonth > 0 ? "good" : "warn"
      },
      {
        title: "Net Profit Margin",
        value: pct(data.monthlyPnl.netProfitMarginPct),
        hint: data.monthlyPnl.netProfitMarginPct >= 0.1 ? "Above 10% benchmark" : "Below 10% benchmark",
        tone: data.monthlyPnl.netProfitMarginPct >= 0.1 ? "good" : "warn",
        benchmark: "Target > 10%"
      }
    ];
  }

  function getSectionInputSnapshot(id: ActiveSection) {
    if (id === "unit") return reportInput.unitEconomicsInput;
    if (id === "ad") return reportInput.adMetricsInput;
    if (id === "performance") return { connectedAccounts, adMetricsCount: adMetrics.length };
    if (id === "library") return { adLibraryQuery, adLibraryCountry, metaLibraryCount: metaLibraryAds.length };
    if (id === "market") return { adLibraryQuery, adLibraryCountry, shopifyStoreUrl, shopifyResearch };
    if (id === "scale") return reportInput.scalePlannerInput;
    return {
      note: "Monthly P&L is derived from other sections",
      dependencies: {
        unitEconomicsInput: reportInput.unitEconomicsInput,
        adMetricsInput: reportInput.adMetricsInput,
        scalePlannerInput: reportInput.scalePlannerInput
      }
    };
  }

  function saveSectionSheet(id: ActiveSection) {
    const sheet = {
      section: id,
      exportedAt: new Date().toISOString(),
      input: getSectionInputSnapshot(id),
      output: getSectionMetrics(id, report)
    };

    const blob = new Blob([JSON.stringify(sheet, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${id}-sheet-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    pushToast(`${sectionOptions.find((opt) => opt.id === id)?.label ?? id} sheet saved`, "good");
  }

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
        const message = err instanceof Error ? err.message : "Failed to load monthly records";
        setRecordsError(message);
        pushToast(message, "warn");
      } finally {
        setRecordsLoading(false);
      }
    }

  async function loadAdminUsers() {
    const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "").trim().toLowerCase();
    const canViewAdminUsers = !!adminEmail && userEmail.toLowerCase() === adminEmail;
    if (!userId || !canViewAdminUsers) return;

    setAdminUsersLoading(true);
    setAdminUsersError("");
    try {
      const queryEmail = adminTargetEmail.trim().toLowerCase();
      const path = queryEmail ? `/api/admin/users?email=${encodeURIComponent(queryEmail)}&limit=200` : "/api/admin/users?limit=200";
      const res = await fetch(path);
      const json = (await res.json()) as { users?: AdminUserRow[]; error?: string };
      if (!res.ok) throw new Error(json.error || "Unable to load users");
      setAdminUsers(json.users ?? []);
    } catch (err) {
      setAdminUsersError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setAdminUsersLoading(false);
    }
  }

  async function loadAdMetrics() {
    if (!userId) return;

    setAdMetricsLoading(true);
    try {
      // Load connected accounts
      const accountsRes = await fetch("/api/integrations/meta-ads/accounts");
      const googleAccountsRes = await fetch("/api/integrations/google-ads/accounts");

      const [metaAccounts, googleAccounts] = await Promise.all([
        accountsRes.ok ? accountsRes.json() : { accounts: [] },
        googleAccountsRes.ok ? googleAccountsRes.json() : { accounts: [] }
      ]);

      setAdIntegrationSetupRequired(Boolean(metaAccounts.setupRequired || googleAccounts.setupRequired));
      setConnectedAccounts([...(metaAccounts.accounts || []), ...(googleAccounts.accounts || [])]);

      // Load recent metrics (last 30 days)
      const supabase = createClient();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: metrics, error } = await supabase
        .from("ad_metrics")
        .select("*")
        .eq("user_id", userId)
        .gte("date", thirtyDaysAgo.toISOString().split('T')[0])
        .order("date", { ascending: false })
        .limit(100);

      if (error) throw error;
      setAdMetrics(metrics || []);
    } catch (error) {
      console.error("Failed to load ad metrics:", error);
      pushToast(error instanceof Error ? error.message : "Failed to load ad metrics", "warn");
    } finally {
      setAdMetricsLoading(false);
    }
  }

  async function connectMetaAds() {
    try {
      const response = await fetch("/api/integrations/meta-ads", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.oauth_url) {
        throw new Error(data.error || "Unable to start Meta connection");
      }
      window.location.href = data.oauth_url;
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Unable to connect Meta Ads", "warn");
    }
  }

  async function connectGoogleAds() {
    try {
      const response = await fetch("/api/integrations/google-ads", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.oauth_url) {
        throw new Error(data.error || "Unable to start Google connection");
      }
      window.location.href = data.oauth_url;
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Unable to connect Google Ads", "warn");
    }
  }

  async function fetchMetaAccountMetrics(accountId: string) {
    setAdMetricsLoading(true);
    try {
      const response = await fetch("/api/integrations/meta-ads/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, datePreset: "last_30d" })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to fetch Meta metrics");
      }
      pushToast(`Fetched ${data.metricsCount || 0} Meta ad rows`, "good");
      await loadAdMetrics();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Unable to fetch Meta metrics", "warn");
    } finally {
      setAdMetricsLoading(false);
    }
  }

  async function fetchGoogleAccountMetrics(accountId: string) {
    setAdMetricsLoading(true);
    try {
      const response = await fetch("/api/integrations/google-ads/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, dateRange: "LAST_30_DAYS" })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to fetch Google metrics");
      }
      pushToast(`Fetched ${data.metricsCount || 0} Google ad rows`, "good");
      await loadAdMetrics();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Unable to fetch Google metrics", "warn");
    } finally {
      setAdMetricsLoading(false);
    }
  }

  async function searchAdLibraries() {
    const query = adLibraryQuery.trim();
    if (!query) {
      pushToast("Enter a brand or keyword to search", "warn");
      return;
    }

    setAdLibraryLoading(true);
    try {
      const params = new URLSearchParams({ q: query, country: adLibraryCountry || "IN" });
      const [metaResponse, googleResponse] = await Promise.all([
        fetch(`/api/ad-library/meta?${params.toString()}`),
        fetch(`/api/ad-library/google?${params.toString()}`)
      ]);

      const googleData = await googleResponse.json();
      setGoogleLibraryInfo({
        transparencyUrl: googleData.transparencyUrl,
        note: googleData.note
      });

      const metaData = await metaResponse.json();
      if (!metaResponse.ok) {
        setMetaLibraryAds([]);
        const providerDetails = [metaData.providerCode, metaData.providerType].filter(Boolean).join(" / ");
        const message = `${metaData.error || "Meta library search failed"}${providerDetails ? ` (${providerDetails})` : ""}`;
        setMetaLibraryError(message);
        pushToast(message, "warn");
      } else {
        setMetaLibraryError("");
        setMetaLibraryAds(metaData.ads || []);
        pushToast(`Found ${(metaData.ads || []).length} Meta library ads`, "good");
      }
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Unable to search ad libraries", "warn");
    } finally {
      setAdLibraryLoading(false);
    }
  }

  async function searchShopifyStore() {
    const store = shopifyStoreUrl.trim();
    if (!store) {
      pushToast("Enter a Shopify store URL", "warn");
      return;
    }

    setShopifyResearchLoading(true);
    setShopifyResearchError("");
    try {
      const response = await fetch(`/api/market-research/shopify?store=${encodeURIComponent(store)}`);
      const data = (await response.json()) as ShopifyResearch & { error?: string };
      if (!response.ok) throw new Error(data.error || "Shopify catalog search failed");
      setShopifyResearch(data);
      pushToast(`Found ${data.summary.productCount} public Shopify products`, "good");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Shopify catalog search failed";
      setShopifyResearchError(message);
      pushToast(message, "warn");
    } finally {
      setShopifyResearchLoading(false);
    }
  }

  async function saveCurrentMonthRecord() {
    if (!userId || !userEmail) {
      pushToast("Login required to save monthly records", "warn");
      return;
    }

    try {
      const supabase = createClient();
      const payload = {
        user_id: userId,
        user_email: userEmail.toLowerCase(),
        month_key: monthKey,
        report_input: reportInput,
        report_data: report
      };

      const { error } = await supabase
        .from("monthly_records")
        .upsert(payload, { onConflict: "user_id,month_key" });
      if (error) throw error;

      pushToast(`Record saved for ${monthKey}`, "good");
      void persistWorkspaceToDatabase(reportInput, report, scenarios, selectedScenarioId, monthKey);
      await loadMonthlyRecords();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Unable to save month record", "warn");
    }
  }

  function loadRecordToWorkspace(record: MonthlyRecord) {
    setReportInput(record.report_input);
    setReport(record.report_data);
    sessionStorage.setItem("reportInput", JSON.stringify(record.report_input));
    sessionStorage.setItem("report", JSON.stringify(record.report_data));
    void persistWorkspaceToDatabase(record.report_input, record.report_data, scenarios, selectedScenarioId, record.month_key);
    setDirty(false);
    pushToast(`Loaded ${record.month_key} record`, "neutral");
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

  function sectionInputs(id: ActiveSection): React.ReactNode {
    if (id === "unit") {
      return (
        <div className="editor-grid">
          <NumberField label="Selling Price (MRP)" value={reportInput.unitEconomicsInput.sellingPrice} onChange={(v) => updateNumber("unitEconomicsInput.sellingPrice", v)} />
          <NumberField label="Discount" value={reportInput.unitEconomicsInput.discount} onChange={(v) => updateNumber("unitEconomicsInput.discount", v)} />
          <NumberField label="GST Rate" step="0.01" value={reportInput.unitEconomicsInput.gstRate} onChange={(v) => updateNumber("unitEconomicsInput.gstRate", v)} />
          <NumberField label="Raw Material" value={reportInput.unitEconomicsInput.cogsParts[0]} onChange={(v) => updateNumber("unitEconomicsInput.cogsParts.0", v)} />
          <NumberField label="Packaging" value={reportInput.unitEconomicsInput.cogsParts[1]} onChange={(v) => updateNumber("unitEconomicsInput.cogsParts.1", v)} />
          <NumberField label="Quality/Wastage" value={reportInput.unitEconomicsInput.cogsParts[2]} onChange={(v) => updateNumber("unitEconomicsInput.cogsParts.2", v)} />
          <NumberField label="Inbound Freight" value={reportInput.unitEconomicsInput.cogsParts[3]} onChange={(v) => updateNumber("unitEconomicsInput.cogsParts.3", v)} />
          <NumberField label="Shipping" value={reportInput.unitEconomicsInput.shipping} onChange={(v) => updateNumber("unitEconomicsInput.shipping", v)} />
          <NumberField label="COD Fee" value={reportInput.unitEconomicsInput.codFee} onChange={(v) => updateNumber("unitEconomicsInput.codFee", v)} />
          <NumberField label="Payment Gateway %" step="0.01" value={reportInput.unitEconomicsInput.paymentGatewayPct} onChange={(v) => updateNumber("unitEconomicsInput.paymentGatewayPct", v)} />
          <NumberField label="Returns Rate" step="0.01" value={reportInput.unitEconomicsInput.returnsRate} onChange={(v) => updateNumber("unitEconomicsInput.returnsRate", v)} />
          <NumberField label="Return Shipping" value={reportInput.unitEconomicsInput.returnShipping} onChange={(v) => updateNumber("unitEconomicsInput.returnShipping", v)} />
          <NumberField label="Warehouse / 3PL" value={reportInput.unitEconomicsInput.warehouse} onChange={(v) => updateNumber("unitEconomicsInput.warehouse", v)} />
        </div>
      );
    }

    if (id === "ad") {
      return (
        <div className="editor-grid">
          <NumberField label="Total Ad Spend" value={reportInput.adMetricsInput.totalAdSpend} onChange={(v) => updateNumber("adMetricsInput.totalAdSpend", v)} />
          <NumberField label="Impressions" value={reportInput.adMetricsInput.impressions} onChange={(v) => updateNumber("adMetricsInput.impressions", v)} />
          <NumberField label="Clicks" value={reportInput.adMetricsInput.clicks} onChange={(v) => updateNumber("adMetricsInput.clicks", v)} />
          <NumberField label="Orders" value={reportInput.adMetricsInput.orders} onChange={(v) => updateNumber("adMetricsInput.orders", v)} />
          <NumberField label="Revenue" value={reportInput.adMetricsInput.revenue} onChange={(v) => updateNumber("adMetricsInput.revenue", v)} />
        </div>
      );
    }

    if (id === "scale") {
      return (
        <>
          <div className="editor-grid">
            <NumberField label="Revenue Growth Target %" step="0.01" value={reportInput.scalePlannerInput.revenueGrowthTargetPct} onChange={(v) => updateNumber("scalePlannerInput.revenueGrowthTargetPct", v)} />
            <NumberField label="Ad Spend Growth Target %" step="0.01" value={reportInput.scalePlannerInput.adSpendGrowthTargetPct} onChange={(v) => updateNumber("scalePlannerInput.adSpendGrowthTargetPct", v)} />
            <NumberField label="Orders Growth Target %" step="0.01" value={reportInput.scalePlannerInput.ordersGrowthTargetPct} onChange={(v) => updateNumber("scalePlannerInput.ordersGrowthTargetPct", v)} />
            <NumberField label="CAC Improvement Target %" step="0.01" value={reportInput.scalePlannerInput.cacImprovementTargetPct} onChange={(v) => updateNumber("scalePlannerInput.cacImprovementTargetPct", v)} />
            <NumberField label="Meta Allocation %" step="0.01" value={reportInput.scalePlannerInput.allocationMetaPct} onChange={(v) => updateNumber("scalePlannerInput.allocationMetaPct", v)} />
            <NumberField label="Google Allocation %" step="0.01" value={reportInput.scalePlannerInput.allocationGooglePct} onChange={(v) => updateNumber("scalePlannerInput.allocationGooglePct", v)} />
            <NumberField label="Other Allocation %" step="0.01" value={reportInput.scalePlannerInput.allocationOtherPct} onChange={(v) => updateNumber("scalePlannerInput.allocationOtherPct", v)} />
          </div>
          <div style={{ marginTop: 10 }}>
            <span className={Math.abs(allocationTotal - 1) < 0.001 ? "tag tag-good" : "tag tag-warn"}>Allocation {(allocationTotal * 100).toFixed(1)}%</span>
          </div>
        </>
      );
    }

    if (id === "performance") {
      return (
        <div className="editor-grid">
          {connectedAccounts.length === 0 ? (
            <div>
              <p className="muted-text">
                {adIntegrationSetupRequired
                  ? "Ad tables are not created yet. Run supabase-ad-integrations-migration.sql in Supabase, then refresh."
                  : "No ad accounts connected. Connect Meta or Google to show customer ad spend, clicks, impressions, and ROAS here."}
              </p>
              <div className="action-row" style={{ marginTop: 12 }}>
                <Button type="button" variant="secondary" onClick={connectMetaAds}>
                  Connect Meta Ads
                </Button>
                <Button type="button" variant="secondary" onClick={connectGoogleAds}>
                  Connect Google Ads
                </Button>
                <Button type="button" variant="secondary" onClick={loadAdMetrics} disabled={adMetricsLoading}>
                  {adMetricsLoading ? "Refreshing..." : "Refresh"}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <h4>Connected Accounts</h4>
                <ul style={{ fontSize: "0.9em", marginTop: 8 }}>
                  {connectedAccounts.map((acc) => (
                    <li key={acc.id}>
                      {acc.platform}: {acc.account_name || acc.account_id}
                      {acc.platform === "meta" ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => fetchMetaAccountMetrics(acc.account_id)}
                          disabled={adMetricsLoading}
                          style={{ marginLeft: 8 }}
                        >
                          Fetch Metrics
                        </Button>
                      ) : null}
                      {acc.platform === "google" ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => fetchGoogleAccountMetrics(acc.account_id)}
                          disabled={adMetricsLoading}
                          style={{ marginLeft: 8 }}
                        >
                          Fetch Metrics
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <div className="action-row" style={{ marginTop: 12 }}>
                  <Button type="button" variant="secondary" onClick={connectMetaAds}>
                    Connect Another Meta Account
                  </Button>
                  <Button type="button" variant="secondary" onClick={connectGoogleAds}>
                    Connect Google Ads
                  </Button>
                  <Button type="button" variant="secondary" onClick={loadAdMetrics} disabled={adMetricsLoading}>
                    {adMetricsLoading ? "Refreshing..." : "Refresh Dashboard"}
                  </Button>
                </div>
              </div>
              <div>
                <h4>Recent Ad Metrics</h4>
                {adMetricsLoading ? (
                  <p className="muted-text">Loading metrics...</p>
                ) : adMetrics.length === 0 ? (
                  <p className="muted-text">No metrics data yet. Click Fetch Metrics beside a connected Meta account.</p>
                ) : (
                  <table style={{ width: "100%", fontSize: "0.85em", marginTop: 8 }}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Ad</th>
                        <th>Campaign</th>
                        <th>Spend</th>
                        <th>Clicks</th>
                        <th>CTR</th>
                        <th>ROAS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adMetrics.slice(0, 10).map((m) => (
                        <tr key={`${m.platform}-${m.ad_id || m.campaign_id}-${m.date}`}>
                          <td>{m.date}</td>
                          <td>{m.ad_name || m.ad_id || "Campaign row"}</td>
                          <td>{m.campaign_name}</td>
                          <td>INR {m.spend?.toFixed(0)}</td>
                          <td>{m.clicks}</td>
                          <td>{m.ctr?.toFixed(2)}%</td>
                          <td>{m.roas?.toFixed(2)}x</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      );
    }

    if (id === "library") {
      return (
        <div className="editor-grid">
          <Label className="input-row">
            <span>Brand or keyword</span>
            <Input
              type="text"
              placeholder="competitor brand, product, offer"
              value={adLibraryQuery}
              onChange={(e) => setAdLibraryQuery(e.target.value)}
            />
          </Label>
          <Label className="input-row">
            <span>Country</span>
            <Input
              type="text"
              value={adLibraryCountry}
              onChange={(e) => setAdLibraryCountry(e.target.value.toUpperCase())}
            />
          </Label>
          <div className="action-row">
            <Button type="button" onClick={searchAdLibraries} disabled={adLibraryLoading}>
              {adLibraryLoading ? "Searching..." : "Search Ad Libraries"}
            </Button>
            {googleLibraryInfo ? (
              <Button type="button" variant="secondary" onClick={() => window.open(googleLibraryInfo.transparencyUrl, "_blank", "noopener,noreferrer")}>
                Open Google Transparency
              </Button>
            ) : null}
          </div>
          {googleLibraryInfo ? <p className="muted-text">{googleLibraryInfo.note}</p> : null}
          {metaLibraryError ? <p className="error-text">{metaLibraryError}</p> : null}
          <div>
            <h4>Meta Ad Library Results</h4>
            {metaLibraryAds.length === 0 ? (
              <p className="muted-text">No Meta library results yet. Search a competitor brand or keyword.</p>
            ) : (
              <div className="fix-grid">
                {metaLibraryAds.slice(0, 12).map((ad) => (
                  <article key={ad.id || ad.snapshotUrl} className="fix-card">
                    <p className="metric-title">{ad.pageName || "Meta advertiser"}</p>
                    <p>{ad.title || ad.body || "Creative text unavailable"}</p>
                    {ad.caption ? <p className="muted-text">{ad.caption}</p> : null}
                    <div className="insight-meta-row">
                      <Badge variant="secondary">{ad.startedAt || "Active"}</Badge>
                      {ad.publisherPlatforms?.slice(0, 3).map((platform) => (
                        <Badge key={`${ad.id}-${platform}`} variant="secondary">{platform}</Badge>
                      ))}
                    </div>
                    {ad.snapshotUrl ? (
                      <Button type="button" variant="secondary" onClick={() => window.open(ad.snapshotUrl, "_blank", "noopener,noreferrer")}>
                        View Ad
                      </Button>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (id === "market") {
      return (
        <div className="editor-grid">
          <Label className="input-row">
            <span>Meta competitor or keyword</span>
            <Input
              type="text"
              placeholder="competitor brand, product, offer"
              value={adLibraryQuery}
              onChange={(e) => setAdLibraryQuery(e.target.value)}
            />
          </Label>
          <Label className="input-row">
            <span>Market country</span>
            <Input
              type="text"
              value={adLibraryCountry}
              onChange={(e) => setAdLibraryCountry(e.target.value.toUpperCase())}
            />
          </Label>
          <div className="action-row">
            <Button type="button" variant="secondary" onClick={searchAdLibraries} disabled={adLibraryLoading}>
              {adLibraryLoading ? "Searching Meta..." : "Research Meta Ads"}
            </Button>
          </div>
          <Label className="input-row">
            <span>Shopify store URL</span>
            <Input
              type="url"
              placeholder="https://store.example.com"
              value={shopifyStoreUrl}
              onChange={(e) => setShopifyStoreUrl(e.target.value)}
            />
          </Label>
          <div className="action-row">
            <Button type="button" onClick={searchShopifyStore} disabled={shopifyResearchLoading}>
              {shopifyResearchLoading ? "Reading Catalog..." : "Research Shopify Store"}
            </Button>
          </div>
          <p className="muted-text">
            Meta competitor ads are searched in Ad Library. Shopify research uses only a store's public product catalog; private sales and customer data are unavailable.
          </p>
          {shopifyResearchError ? <p className="error-text">{shopifyResearchError}</p> : null}
          {shopifyResearch ? (
            <>
              <div className="metrics-grid metrics-grid-tight">
                <MetricTile item={{ title: "Products", value: String(shopifyResearch.summary.productCount), hint: "Public catalog size", tone: "good" }} />
                <MetricTile item={{ title: "Vendors", value: String(shopifyResearch.summary.vendorCount), hint: "Observed brands/vendors", tone: "neutral" }} />
                <MetricTile
                  item={{
                    title: "Price Range",
                    value: shopifyResearch.summary.minPrice !== null && shopifyResearch.summary.maxPrice !== null ? `${inr(shopifyResearch.summary.minPrice)} - ${inr(shopifyResearch.summary.maxPrice)}` : "Unavailable",
                    hint: "Observed public prices",
                    tone: "neutral"
                  }}
                />
              </div>
              <p className="muted-text">{shopifyResearch.note}</p>
              <div className="fix-grid">
                {shopifyResearch.products.slice(0, 12).map((product) => (
                  <article key={product.id || product.title} className="fix-card">
                    <p className="metric-title">{product.title}</p>
                    <p className="muted-text">{product.productType || "Product"}{product.vendor ? ` · ${product.vendor}` : ""}</p>
                    <p>{product.minPrice !== null && product.maxPrice !== null ? `${inr(product.minPrice)} - ${inr(product.maxPrice)}` : "Price unavailable"}</p>
                  </article>
                ))}
              </div>
            </>
          ) : <p className="muted-text">No Shopify catalog researched yet.</p>}
        </div>
      );
    }

    return <p className="muted-text">Monthly P&L is auto-derived from the previous sections and updates when you apply changes.</p>;
  }

  function statusTone(status: string): MetricTone {
    if (status === "Healthy" || status === "Ready" || status === "Connected") return "good";
    if (status === "Warning" || status === "Low Margin" || status === "Hold") return "warn";
    return "neutral";
  }

  function goToSection(id: SectionId) {
    setSelectedSection(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderSectionBlock(id: ActiveSection) {
    const sectionHealth = sectionStatus[id];
    const tone = statusTone(sectionHealth);

    return (
      <motion.section
        className={`surface section-surface section-block tone-${tone}`}
        key={id}
        variants={fadeUp}
      >
        <div className="section-head section-head-rich">
          <h3>{sectionOptions.find((opt) => opt.id === id)?.label ?? id}</h3>
          <span className={`status-dot status-${tone}`}>{sectionHealth}</span>
        </div>
        <div className="section-block-grid">
          <article className="input-cluster">
            <h4>{id === "pnl" ? "Input Dependencies" : "Section Inputs"}</h4>
            {sectionInputs(id)}
            <div className="section-actions">
              <Button type="button" onClick={() => applySectionChanges(id)} disabled={recalcLoading}>
                {recalcLoading ? "Applying..." : `Apply ${sectionOptions.find((opt) => opt.id === id)?.label} Changes`}
              </Button>
              <Button type="button" variant="secondary" onClick={() => saveSectionSheet(id)}>
                Save Sheet
              </Button>
            </div>
          </article>
          <article className="output-cluster">
            <h4>Section Output</h4>
            <div className="metrics-grid metrics-grid-tight">
              {getSectionMetrics(id, report).map((item) => (
                <MetricTile key={`${id}-${item.title}`} item={item} />
              ))}
            </div>
          </article>
        </div>
      </motion.section>
    );
  }

  const commands = [
    { id: "go-all", label: "Go to All Sections" },
    { id: "go-unit", label: "Go to Unit Economics" },
    { id: "go-ad", label: "Go to Ad Metrics" },
    { id: "go-performance", label: "Go to Ad Performance" },
    { id: "go-library", label: "Go to Ad Library" },
    { id: "go-zwirk", label: "Open ZWIRK Assistant" },
    { id: "go-scale", label: "Go to Scale Planner" },
    { id: "go-pnl", label: "Go to Monthly P&L" },
    { id: "apply", label: "Apply Changes" },
    { id: "reset", label: "Reset Defaults" },
    { id: "sample", label: "Load Sample Data" },
    { id: "scenario", label: "Save Scenario Snapshot" },
    { id: "insights", label: "Generate Profit Report" }
  ];

  const filteredCommands = commands.filter((c) => c.label.toLowerCase().includes(paletteQuery.toLowerCase()));
  const sectionSequence: ActiveSection[] = ["unit", "ad", "performance", "library", "market", "scale", "pnl"];
  const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const isAdmin = !!adminEmail && userEmail.toLowerCase() === adminEmail;
  const completedSections = sectionSequence.filter((id) => statusTone(sectionStatus[id]) === "good").length;
  const checklist = [
    { label: "Unit Economics Healthy", done: sectionStatus.unit === "Healthy" },
    { label: "Ad Metrics Healthy", done: sectionStatus.ad === "Healthy" },
    { label: "Scale Planner Ready", done: sectionStatus.scale === "Ready" },
    { label: "Monthly Margin Healthy", done: sectionStatus.pnl === "Healthy" }
  ];
  const tally = useMemo(() => {
    return monthlyRecords.reduce(
      (acc, row) => {
        acc.revenue += row.report_data.monthlyPnl.netRevenueMonth;
        acc.profit += row.report_data.monthlyPnl.netProfitMonth;
        return acc;
      },
      { revenue: 0, profit: 0 }
    );
  }, [monthlyRecords]);

  return (
    <motion.div className="dashboard-shell" initial="hidden" animate="visible" variants={stagger}>
      <aside className="command-rail surface">
        <div className="rail-top">
          <p className="eyebrow">Control</p>
          <h3>Sections</h3>
        </div>
        <div className="section-list">
          {sectionOptions.map((opt) => {
            const key = opt.id === "all" ? "unit" : opt.id;
            const status = opt.id === "all" ? (dirty ? "Unsaved" : "Synced") : sectionStatus[key as "unit" | "ad" | "scale" | "pnl"];
            const tone = opt.id === "all" ? (dirty ? "warn" : "good") : statusTone(status);

            return (
              <button
                key={opt.id}
                type="button"
                className={`section-chip ${selectedSection === opt.id ? "active" : ""}`}
                onClick={() => goToSection(opt.id)}
              >
                <span>{opt.label}</span>
                <small className={`rail-status rail-${tone}`}>{status}</small>
              </button>
            );
          })}
        </div>
        <div className="rail-controls">
          <Button type="button" variant="secondary" onClick={() => setPaletteOpen(true)}>
            Open Command Palette
          </Button>
          <Button type="button" variant="secondary" onClick={loadSampleData}>
            Load Sample Data
          </Button>
          <Button type="button" variant="secondary" onClick={saveScenario}>
            Save Scenario
          </Button>
          <Badge variant="secondary">{completedSections}/{sectionSequence.length} sections healthy</Badge>
          <Badge variant={dirty ? "warning" : "success"}>{dirty ? "Unsaved Draft" : "All Saved"}</Badge>
          <Badge variant={workspaceSyncing ? "warning" : "secondary"}>{workspaceSyncing ? "Syncing cloud data..." : "Cloud sync ready"}</Badge>
        </div>
        <div className="rail-shortcuts">
          <p>Command Palette</p>
          <kbd>Ctrl</kbd>
          <span>+</span>
          <kbd>K</kbd>
        </div>
      </aside>

      <main className="dashboard-content-grid">
        <motion.section className="surface hero-surface" variants={fadeUp}>
          <div>
            <p className="eyebrow">Profitability Command Center</p>
            <h1>Turn ad spend into real profit, not just clicks.</h1>
            <p className="hero-copy">Measure true retained revenue, find hidden campaign losses, and only scale when the math is solid.</p>
          </div>
          <div className="hero-meta">
            <span className="muted-text">
              {userEmail ? `Signed in as ${userName ? `${userName} (${userEmail})` : userEmail}` : "Not signed in"}
            </span>
            <Link href="/zwirk">
              <Button type="button">Open ZWIRK</Button>
            </Link>
            <ThemeToggle />
            {userEmail ? (
              <SignOutButton />
            ) : (
              <Link href="/login">
                <Button type="button" variant="secondary">Sign In</Button>
              </Link>
            )}
          </div>
        </motion.section>

        <motion.section className="hero-kpi-grid" variants={fadeUp}>
          {heroKpis.map((item) => (
            <MetricTile key={item.title} item={item as MetricItem} />
          ))}
        </motion.section>

        <motion.section className="surface action-surface" variants={fadeUp}>
          <div className="section-head">
            <h3>Execution Controls</h3>
            <p>Apply changes, reset assumptions, and keep the profit story simple.</p>
          </div>
          <div className="action-row">
            <Button type="button" onClick={() => applyChanges()} disabled={recalcLoading}>
              {recalcLoading ? "Applying..." : "Apply All Changes"}
            </Button>
            <Button type="button" variant="secondary" onClick={generateInsights} disabled={insightsLoading}>
              {insightsLoading ? "Generating..." : "Get AI Insights"}
            </Button>
            <Button type="button" variant="secondary" onClick={resetToDefaults}>
              Reset Defaults
            </Button>
          </div>
        </motion.section>

        <motion.section className="surface checklist-surface" variants={fadeUp}>
          <div className="section-head">
            <h3>Launch Checklist</h3>
            <p>Track the readiness gates before scaling budgets.</p>
          </div>
          <div className="checklist-grid">
            {checklist.map((item) => (
              <div key={item.label} className={`check-item ${item.done ? "done" : ""}`}>
                <span>{item.done ? "OK" : "\.\.\."}</span>
                <p>{item.label}</p>
              </div>
            ))}
          </div>
        </motion.section>

        {selectedSection === "all" ? sectionSequence.map((id) => renderSectionBlock(id)) : renderSectionBlock(selectedSection as ActiveSection)}

        <motion.section className="surface section-surface" variants={fadeUp}>
          <div className="section-head">
            <h3>Scenario Lab</h3>
            <p>Save and compare up to 3 scenarios for revenue, profit and ROAS.</p>
          </div>
          <div className="scenario-grid">
            {scenarios.length === 0 ? <p className="muted-text">No scenario saved yet. Use "Save Scenario" after applying changes.</p> : null}
            {scenarios.map((scenario) => (
              <article key={scenario.id} className={`scenario-card ${selectedScenarioId === scenario.id ? "active" : ""}`}>
                <h4>{scenario.name}</h4>
                <p className="muted-text">{scenario.createdAt}</p>
                <div className="scenario-bars">
                  <label>
                    Revenue
                    <div className="bar-track">
                      <span style={{ width: `${Math.min(100, (scenario.report.monthlyPnl.netRevenueMonth / Math.max(report.monthlyPnl.netRevenueMonth, 1)) * 100)}%` }} />
                    </div>
                  </label>
                  <label>
                    Profit
                    <div className="bar-track">
                      <span style={{ width: `${Math.min(100, Math.max(5, (scenario.report.monthlyPnl.netProfitMonth / Math.max(report.monthlyPnl.netProfitMonth, 1)) * 100))}%` }} />
                    </div>
                  </label>
                  <label>
                    ROAS
                    <div className="bar-track">
                      <span style={{ width: `${Math.min(100, (scenario.report.adMetrics.blendedRoas / Math.max(report.adMetrics.blendedRoas, 0.1)) * 100)}%` }} />
                    </div>
                  </label>
                </div>
                <Button type="button" variant="secondary" onClick={() => loadScenario(scenario.id)}>
                  Load Scenario
                </Button>
              </article>
            ))}
          </div>
        </motion.section>

        {isAdmin ? (
          <motion.section className="surface section-surface" variants={fadeUp}>
            <div className="section-head">
              <h3>Admin Users Vault</h3>
              <p>Cross-user profile and workspace visibility for operations.</p>
            </div>
            <div className="action-row">
              <Button type="button" variant="secondary" onClick={loadAdminUsers} disabled={adminUsersLoading}>
                {adminUsersLoading ? "Refreshing..." : "Refresh Users"}
              </Button>
              <Badge variant="secondary">Users: {adminUsers.length}</Badge>
            </div>
            {adminUsersError ? <p className="error-text" style={{ marginTop: 10 }}>{adminUsersError}</p> : null}
            <div className="records-table-wrap">
              <table className="records-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Month</th>
                    <th>Scenarios</th>
                    <th>Workspace Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {adminUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="muted-text">No users found.</td>
                    </tr>
                  ) : (
                    adminUsers.map((row) => (
                      <tr key={row.user_id}>
                        <td>{row.user_email}</td>
                        <td>{row.full_name ?? "-"}</td>
                        <td>{row.phone ?? "-"}</td>
                        <td>{row.active_month_key ?? "-"}</td>
                        <td>{row.scenario_count}</td>
                        <td>{row.workspace_updated_at ? new Date(row.workspace_updated_at).toLocaleString() : "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </motion.section>
        ) : null}

        <motion.section className="surface section-surface" variants={fadeUp}>
          <div className="section-head">
            <h3>Monthly Records Vault</h3>
            <p>Save current month data, review history, tally totals, and export records.</p>
          </div>
          <div className="action-row">
            <Label className="input-row" style={{ minWidth: 180 }}>
              <span>Month</span>
              <Input type="month" value={monthKey} onChange={(e) => setMonthKey(e.target.value)} />
            </Label>
            <Button type="button" onClick={saveCurrentMonthRecord}>Save Month Record</Button>
            <Button type="button" variant="secondary" onClick={downloadAllRecordsCsv} disabled={monthlyRecords.length === 0}>
              Download CSV
            </Button>
            <Button type="button" variant="secondary" onClick={loadMonthlyRecords} disabled={recordsLoading}>
              {recordsLoading ? "Refreshing..." : "Refresh"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => router.push("/records")}>
              See Monthly Records {" >"}
            </Button>
            {isAdmin ? (
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

          {recordsError ? (
            <div style={{ marginTop: 10 }}>
              <p className="error-text">{recordsError}</p>
              {!userId ? (
                <p className="muted-text" style={{ margin: 0 }}>
                  Please sign in to access your records.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="records-summary">
            <Badge variant="secondary">Months: {monthlyRecords.length}</Badge>
            <Badge variant="secondary">Total Revenue: {inr(tally.revenue)}</Badge>
            <Badge variant={tally.profit >= 0 ? "success" : "warning"}>Total Profit: {inr(tally.profit)}</Badge>
          </div>
        </motion.section>

        <motion.section className="surface section-surface insights-surface" variants={fadeUp}>
          <div className="section-head">
            <h3>AI Insights</h3>
            <p>Operator-grade insights for profitability, scaling, and execution.</p>
            <Button type="button" onClick={generateInsights} disabled={insightsLoading}>
              {insightsLoading ? "Generating..." : "Get AI Insights"}
            </Button>
          </div>
        <div className="insight-meta-row">
  <Badge variant="secondary">
    Source: {report.insights.source}
  </Badge>

  <Badge variant="secondary">
    Latency: {report.insights.latencyMs}ms
  </Badge>

  <Badge variant={insightsLoading ? "warning" : "success"}>
    {insightsLoading
      ? "Generating"
      : report.insights.basedOnPreviousCalculation
        ? "Needs Refresh"
        : "Ready"}
  </Badge>

  <Badge variant="secondary">
    Confidence: {report.insights.source === "gemini" ? "High" : "Medium"}
  </Badge>
</div>

{report.insights.source !== "pending" && (
  <div className="mt-2 text-sm text-muted-foreground">
    {report.insights.basedOnPreviousCalculation ? (
      <>
        Based on last generated analysis. Your assumptions have changed.
      </>
    ) : (
      <>
        Based on current calculation.
      </>
    )}
  </div>
)}
          {insightsError ? <p className="error-text">{insightsError}</p> : null}
          {report.insights.priorityFixes.length > 0 ? (
            <div className="fix-grid">
              {report.insights.priorityFixes.map((fix, index) => (
                <article key={`${fix}-${index}`} className="fix-card">
                  <p>{fix}</p>
                  <div className="fix-actions">
                    <Button type="button" onClick={() => applyPriorityFix(index)} disabled={appliedFixes.includes(index)}>
                      {appliedFixes.includes(index) ? "Applied" : "Apply Draft"}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => dismissPriorityFix(index)}>Dismiss</Button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
          <article className="fix-card">
            <p className="metric-title">Executive Summary</p>
            <p className="muted-text">{report.insights.summary}</p>
          </article>
          <div className="fix-grid">
            <InsightList title="Growth Levers" items={report.insights.growthLevers} />
            <InsightList title="Risk Alerts" items={report.insights.riskAlerts} />
            <InsightList title="Channel Plan" items={report.insights.channelPlan} />
            <InsightList title="Experiment Backlog" items={report.insights.experimentBacklog} />
            <InsightList title="Cashflow Actions" items={report.insights.cashflowActions} />
            <InsightList title="KPI Watchlist" items={report.insights.watchlistKpis} />
            <InsightList title="Next 30 Days" items={report.insights.next30Days} />
          </div>
          <Textarea readOnly value={report.insights.summary} />
        </motion.section>
      </main>

      {toasts.length > 0 ? (
        <div className="toast-stack" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast-card toast-${toast.tone}`}>
              {toast.text}
            </div>
          ))}
        </div>
      ) : null}

      {paletteOpen ? (
        <div className="palette-backdrop" onClick={() => setPaletteOpen(false)}>
          <div className="palette-card" onClick={(e) => e.stopPropagation()}>
            <input autoFocus placeholder="Type a command..." value={paletteQuery} onChange={(e) => setPaletteQuery(e.target.value)} className="palette-input" />
            <div className="palette-list">
              {filteredCommands.map((cmd) => (
                <button key={cmd.id} type="button" className="palette-item" onClick={() => runCommand(cmd.id)}>
                  {cmd.label}
                </button>
              ))}
              {filteredCommands.length === 0 ? <p className="muted-text">No commands found</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      <nav className="mobile-nav">
        {sectionSequence.map((id) => (
          <button key={id} type="button" className={selectedSection === id ? "active" : ""} onClick={() => goToSection(id)}>
            {sectionOptions.find((opt) => opt.id === id)?.label?.split(" ")[0]}
          </button>
        ))}
      </nav>

      {showOnboarding ? (
        <div className="palette-backdrop" onClick={closeOnboarding}>
          <div className="palette-card onboarding-card" onClick={(e) => e.stopPropagation()}>
            <h3>Welcome to Zooptrack Command Center</h3>
            <p className="muted-text">Quick start in 3 steps:</p>
            <ol>
              <li>Load sample data to see a full working model.</li>
              <li>Edit inputs section-by-section and apply changes.</li>
              <li>Review profit leak signals and save the scenario that makes sense.</li>
            </ol>
            <div className="action-row">
              <Button type="button" onClick={() => { loadSampleData(); closeOnboarding(); }}>Load Sample + Start</Button>
              <Button type="button" variant="secondary" onClick={closeOnboarding}>Skip</Button>
            </div>
          </div>
        </div>
      ) : null}

      {profileOpen ? (
        <div className="palette-backdrop">
          <div className="palette-card onboarding-card" onClick={(e) => e.stopPropagation()}>
            <h3>Complete Your Profile</h3>
            <p className="muted-text">Name and phone are required for account setup.</p>
            <div className="auth-field">
              <Label htmlFor="profileName">Full Name</Label>
              <Input id="profileName" type="text" value={profileName} onChange={(e) => setProfileName(e.target.value)} />
            </div>
            <div className="auth-field">
              <Label htmlFor="profilePhone">Phone Number</Label>
              <Input id="profilePhone" type="tel" value={profilePhone} onChange={(e) => setProfilePhone(e.target.value)} />
            </div>
            <div className="action-row">
              <Button type="button" onClick={saveProfileDetails} disabled={profileSaving}>
                {profileSaving ? "Saving..." : "Save Profile"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </motion.div>
  );
}
