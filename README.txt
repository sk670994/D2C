AdSpy v34 hotfix

Run from PowerShell:

Set-ExecutionPolicy -Scope Process Bypass
.\apply-adspy-v34.ps1

What it fixes:
1. Adds the missing collectMetaAdsInBatches export expected by the collection job.
2. Changes Meta advertiser suggestion discovery so it captures Meta network responses before public Ad Library navigation.
3. Uses the actual public Meta query URL as the primary suggestion path instead of depending on one specific input selector.
4. Tries interactive Meta typing only as a secondary path when a usable textbox actually exists.
5. Stops queueing stale keystroke lookups behind one another.
6. Forces AdSpy suggestion/primary/secondary controls to navy/blue/white.
7. Clears .next so the next dev run uses the patched modules.

The script creates .bak-adspy-v34 backups before touching existing files.
