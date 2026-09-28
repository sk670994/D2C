export const dynamic = "force-dynamic";

/** Which build is live. Open tabs compare it with their own and reload quietly on a new deploy. */
export function GET() {
  const version = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || "dev";
  return Response.json({ version }, { headers: { "Cache-Control": "no-store" } });
}
