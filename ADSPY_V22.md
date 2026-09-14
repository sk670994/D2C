# AdSpy v22

Build-only fixes from the v21 TypeScript output:

1. `AdSpy3DCreativeReel.tsx`
   - Imports `Ad` from the real shared type module: `../adspy-types`.
   - Does not depend on `AdSpySection` for a non-exported local type.

2. `AdSpy3DJokePulse.tsx`
   - Removes unsupported `onPointerLeaveCapture` from the Framer Motion section.
   - Resets the pulse pause state inside the supported `onPointerLeave` handler.

No visual or data-layer behavior changes beyond that.
