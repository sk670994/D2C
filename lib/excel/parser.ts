import * as XLSX from "xlsx";
import type { ParsedReport } from "@/lib/types/domain";

function getNumber(ws: XLSX.WorkSheet, ref: string, fallback = 0): number {
  const cell = ws[ref];
  if (!cell) return fallback;
  const n = Number(cell.v);
  return Number.isFinite(n) ? n : fallback;
}

function getText(ws: XLSX.WorkSheet, ref: string, fallback = ""): string {
  const cell = ws[ref];
  if (!cell) return fallback;
  const v = String(cell.v ?? "").trim();
  return v.length > 0 ? v : fallback;
}

function findSheetByKeyword(wb: XLSX.WorkBook, keyword: string): XLSX.WorkSheet | null {
  const match = wb.SheetNames.find((name) => name.toLowerCase().includes(keyword.toLowerCase()));
  return match ? wb.Sheets[match] : null;
}

export function parseWorkbookBuffer(buffer: Buffer): ParsedReport {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const unit = findSheetByKeyword(wb, "unit economics");
  const ads = findSheetByKeyword(wb, "ad metrics");
  const agency = findSheetByKeyword(wb, "agency fee");
  const scale = findSheetByKeyword(wb, "scale planner");

  if (!unit || !ads) {
    throw new Error("Workbook format mismatch: required sheets not found");
  }

  return {
    unitEconomicsInput: {
      sellingPrice: getNumber(unit, "C5"),
      discount: getNumber(unit, "C6"),
      gstRate: getNumber(unit, "C8"),
      cogsParts: [getNumber(unit, "C12"), getNumber(unit, "C13"), getNumber(unit, "C14"), getNumber(unit, "C15")],
      shipping: getNumber(unit, "C21"),
      codFee: getNumber(unit, "C22"),
      paymentGatewayPct: getNumber(unit, "C23"),
      returnsRate: getNumber(unit, "C25"),
      returnShipping: getNumber(unit, "C26"),
      warehouse: getNumber(unit, "C28")
    },
    adMetricsInput: {
      totalAdSpend: getNumber(ads, "F6"),
      impressions: getNumber(ads, "F7"),
      clicks: getNumber(ads, "F8"),
      orders: getNumber(ads, "F10"),
      revenue: getNumber(ads, "F12")
    },
    agencyInput: {
      growthStage: getText(agency ?? ads, "C10", "Early Stage")
    },
    scalePlannerInput: {
      revenueGrowthTargetPct: getNumber(scale ?? ads, "D14", 0.3),
      adSpendGrowthTargetPct: getNumber(scale ?? ads, "D15", 0.25),
      ordersGrowthTargetPct: getNumber(scale ?? ads, "D16", 0.3),
      cacImprovementTargetPct: getNumber(scale ?? ads, "D18", -0.1),
      allocationMetaPct: getNumber(scale ?? ads, "C22", 0.55),
      allocationGooglePct: getNumber(scale ?? ads, "C23", 0.35),
      allocationOtherPct: getNumber(scale ?? ads, "C24", 0.1)
    }
  };
}
