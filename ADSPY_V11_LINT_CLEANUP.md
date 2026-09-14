# AdSpy v11 — lint cleanup

Fixed:
- `react-hooks/set-state-in-effect` in `AdSpySearchBar.tsx` by removing local-storage state initialization.
- `jsx-a11y/role-supports-aria-props` by making the search input an explicit combobox.
- unused `secondary` declaration in `AdSpyStats.tsx`.

Also includes:
- `cleanup-adspy-lint-v11.ps1` for the three unused declarations reported in `AdSpySection.tsx`.

After extraction into F:\D2C:

```powershell
powershell -ExecutionPolicy Bypass -File .\cleanup-adspy-lint-v11.ps1
npm run build
```

Tailwind IntelliSense canonical-class messages are advisory and are not part of the blocking lint cleanup.
