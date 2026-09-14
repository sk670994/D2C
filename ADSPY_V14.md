# AdSpy v14 — compile/lint cleanup

Fixed from v13 diagnostics:
- Removed stale `setIntelligence` call.
- Removed unused `pageIdForSearch`.
- Moved autocomplete cache/state updates into the debounced callback so React's `set-state-in-effect` lint rule is not triggered by synchronous effect-body writes.
- Added `selectedPageId` to the `runSearch` callback dependency list.
- Added required `aria-selected` to suggestion listbox options.
- Removed the unused `FileText` and `Play` icon imports from AdSpyCreativeModal.

The Tailwind IntelliSense canonical-class suggestions remain advisory.
