import { NextRequest, NextResponse } from "next/server";

// Legacy unauthenticated endpoint. OAuth now starts through the protected
// /api/integrations/meta-ads POST handler.
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/dashboard?meta_error=use_integrations", request.url));
}
