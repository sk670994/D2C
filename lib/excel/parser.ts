import * as XLSX from "xlsx";
import type { ParsedReport } from "@/lib/types/domain";

function getNumber(ws: XLSX.WorkSheet, ref: string, fallback = 0): number {
  const cell = ws[ref];
  if (!cell) return fallback;
  const n = Number(cell.v);
  return Number.isFinite(n) ? n : fallback;
}

export function parseWorkbookBuffer(buffer: Buffer): ParsedReport {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const unit = wb.Sheets["📊 Unit Economics"];
  const ads = wb.Sheets["📣 Ad Metrics"];

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
    }
  };
}
