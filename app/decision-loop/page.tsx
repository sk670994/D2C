import type { Metadata } from "next";
import { ZooptrackDecisionLoop } from "@/components/marketing/ZooptrackSite";

export const metadata: Metadata = {
  title: "How Zooptrack works — from rivals' ads to your next move",
  description: "Pick rivals, we read every Meta ad nightly, check coverage against Meta, decode each ad with AI and brief you on what changed.",
  alternates: { canonical: "/decision-loop" },
};


export default function DecisionLoopPage() {
  return <ZooptrackDecisionLoop />;
}
