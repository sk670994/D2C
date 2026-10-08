import type { Metadata } from "next";
import { ZooptrackHome } from "@/components/marketing/ZooptrackSite";
import { JsonLd } from "@/components/seo/JsonLd";
import { faqSchema, softwareSchema } from "@/lib/seo/schema";
import { FAQ } from "@/components/marketing/faq";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function HomePage() {
  return (
    <>
      <JsonLd graph={[softwareSchema(), faqSchema(FAQ)]} />
      <ZooptrackHome />
    </>
  );
}
