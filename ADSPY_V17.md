# AdSpy v17 — diagnostic cleanup

Fixed:
- `normalizedCountry` is now properly scoped; URL builders outside the autocomplete effect use `countryInput`.
- `FILTERS` import warning is removed without changing filter behavior.
- stale `FileText` / `Play` imports in AdSpyCreativeModal are removed.

No data-provider or UI architecture changes are included in v17.
