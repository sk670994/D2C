# AdSpy backend audit v1

Run this from PowerShell in the repository:

Set-ExecutionPolicy -Scope Process Bypass
.\apply-adspy-audit-v1.ps1

This patch:
- changes status polling auth from getUser() to verified getClaims()
- detects stale jobs inside /status/[jobId]
- automatically restarts a stale job from the open tab via the existing /refresh route
- splits Meta quick and deep collection into separate asynchronous phases
- preserves already-persisted counts between phases
- keeps 25-ad incremental persistence
- removes the known unused `useAdSpyCollection.ts` and `meta-searchapi.ts`
- does not delete unknown scratch files automatically

After applying:
Remove-Item -Recurse -Force ".next" -ErrorAction SilentlyContinue
npm run build
npm run dev
