import "@/components/today/today.css";

import { ZwirkDock } from "@/components/zwirk/ZwirkDock";

export default function TodayLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {/* ZWIRK copilot: the "Brief a counter-ad" and prompt buttons send it context. */}
      <ZwirkDock />
    </>
  );
}
