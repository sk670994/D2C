import { NextResponse } from "next/server";
import { parseWorkbookBuffer } from "@/lib/excel/parser";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const parsed = parseWorkbookBuffer(buf);
    return NextResponse.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Parse error";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    console.info(`[api/parse-excel] completed in ${Date.now() - startedAt}ms`);
  }
}
