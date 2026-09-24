import type { Metadata } from "next";
import { ZooptrackPricing } from "@/components/marketing/ZooptrackSite";

export const metadata: Metadata = {
  title: "Pricing — plans for D2C brands and agencies",
  description: "Simple plans to track competitor Meta ads, spot new launches and get weekly briefs. Start free, upgrade when you track more brands.",
  alternates: { canonical: "/pricing" },
};


export default function PricingPage() {
  return <ZooptrackPricing />;
}
