import { NextRequest, NextResponse } from "next/server";

// Kept for legacy links only; the protected integration route owns callbacks.
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/dashboard?meta_error=use_integrations", request.url));
}
