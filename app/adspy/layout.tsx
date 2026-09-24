import "@/components/dashboard/adspy/adspy.css";
import "@/components/dashboard/adspy/adspy-workspace.css";
import "@/components/dashboard/adspy/adspy-cinema.css";

import { Space_Grotesk } from "next/font/google";

import { ZwirkDock } from "@/components/zwirk/ZwirkDock";

const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-display", display: "swap" });

export default function AdSpyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={display.variable}>
      {children}
      {/* ZWIRK research copilot: receives AdSpy context via window events. */}
      <ZwirkDock />
    </div>
  );
}
