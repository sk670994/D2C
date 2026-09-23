import { NextResponse } from "next/server";

// Disabled for security: this debug endpoint was reachable without login.
// Safe to delete this file entirely once confirmed nothing depends on it.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
