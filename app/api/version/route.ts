// One static answer per deployment: built once, served from the CDN, and a
// new deploy naturally answers with its own value. Open tabs compare it with
// their own and reload quietly on a new deploy (components/app/VersionWatcher).
export const dynamic = "force-static";

const VERSION = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "dev";

/** Which build is live. */
export function GET() {
  return Response.json({ version: VERSION });
}
