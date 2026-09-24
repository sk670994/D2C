import type { Metadata } from "next";
import { ZooptrackDecisionLoop } from "@/components/marketing/ZooptrackSite";

export const metadata: Metadata = {
  title: "The decision loop — from ad signals to what to do next",
  description: "How Zooptrack turns competitor ads and your numbers into clear next steps for Indian D2C brands.",
  alternates: { canonical: "/decision-loop" },
};


export default function DecisionLoopPage() {
  return <ZooptrackDecisionLoop />;
}
