import { jsonLd } from "@/lib/seo/schema";

/** Renders schema.org structured data. Server component; no client JS. */
export function JsonLd({ graph }: { graph: object[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(graph) }} />;
}
