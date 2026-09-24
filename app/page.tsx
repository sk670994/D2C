import type { Metadata } from "next";
import { ZooptrackHome } from "@/components/marketing/ZooptrackSite";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function HomePage() {
  return <ZooptrackHome />;
}
