import "@/components/dashboard/adspy/adspy.css";
import "@/components/dashboard/adspy/adspy-workspace.css";

import { ZwirkDock } from "@/components/zwirk/ZwirkDock";

export default function AdSpyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {/* ZWIRK research copilot: receives AdSpy context via window events. */}
      <ZwirkDock />
    </>
  );
}
