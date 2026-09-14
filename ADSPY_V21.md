# AdSpy v21 — compile/lint cleanup

- Restored `FILTERS` as a runtime value import because `AdSpySection.tsx` uses it to render/filter controls.
- Removed stale `FileText` and `Play` icon imports from `AdSpyCreativeModal`.
- No UI, animation, search, or collection behavior changes.
