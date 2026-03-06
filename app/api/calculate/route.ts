import { NextResponse } from "next/server";
import type { ParsedReport } from "@/lib/types/domain";
import { calculateReport } from "@/lib/calc/report";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ParsedReport;
    const report = calculateReport(body);
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Calculation error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
