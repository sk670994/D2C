"use client";

import { useMemo, useState } from "react";
import type { CalculatorType } from "@/lib/seo/site";

const configs: Record<CalculatorType, Array<{ key: string; label: string }>> = {
  roas: [{key:"revenue",label:"Revenue (₹)"},{key:"spend",label:"Ad spend (₹)"}],
  "break-even-roas": [{key:"margin",label:"Contribution margin (%)"}],
  cac: [{key:"spend",label:"Acquisition spend (₹)"},{key:"customers",label:"New customers"}],
  "contribution-margin": [{key:"revenue",label:"Revenue (₹)"},{key:"costs",label:"Variable costs (₹)"}],
  rto: [{key:"shipped",label:"Shipped orders"},{key:"returned",label:"RTO orders"}],
};

export function SeoCalculator({ type }: { type: CalculatorType }) {
  const [values, setValues] = useState<Record<string,string>>({});
  const value = (key: string) => Number(values[key] || 0);
  const result = useMemo(() => {
    if (type === "roas") return value("spend") > 0 ? `${(value("revenue") / value("spend")).toFixed(2)}x` : "—";
    if (type === "break-even-roas") { const margin = value("margin") / 100; return margin > 0 && margin < 1 ? `${(1 / margin).toFixed(2)}x` : "—"; }
    if (type === "cac") return value("customers") > 0 ? `₹${Math.round(value("spend") / value("customers")).toLocaleString("en-IN")}` : "—";
    if (type === "contribution-margin") return value("revenue") > 0 ? `${(((value("revenue") - value("costs")) / value("revenue")) * 100).toFixed(1)}%` : "—";
    return value("shipped") > 0 ? `${((value("returned") / value("shipped")) * 100).toFixed(1)}%` : "—";
  }, [type, values]);

  return <div className="seo-calculator">
    <div className="seo-calculator-fields">
      {configs[type].map((field) => <label key={field.key}><span>{field.label}</span><input type="number" min="0" step="0.01" inputMode="decimal" value={values[field.key] || ""} onChange={(e) => setValues((current) => ({...current,[field.key]:e.target.value}))} /></label>)}
    </div>
    <div className="seo-calculator-result" aria-live="polite"><span>Calculated result</span><strong>{result}</strong></div>
  </div>;
}
