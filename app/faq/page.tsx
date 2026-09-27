import type { Metadata } from "next";
import { SiteTopBar } from "@/components/brand/SiteTopBar";
import { FAQ } from "@/components/marketing/faq";

export const metadata: Metadata = {
  title: "FAQ — how Zooptrack and AdSpy work",
  description: "Where the ad data comes from, how often it refreshes, what AdSpy shows, pricing and privacy — answered in plain words.",
  alternates: { canonical: "/faq" },
};

const faqs = FAQ;

export default function FaqPage() {
  return (
    <main className="main policy-page faq-page">
      <SiteTopBar />
      <header className="policy-hero">
        <p className="eyebrow">Support</p>
        <h1>FAQ</h1>
        <p className="muted-text">Quick answers for common questions.</p>
      </header>
      <section className="policy-grid">
        {faqs.map((faq) => (
          <article key={faq.q} className="policy-card">
            <h3>{faq.q}</h3>
            <p className="muted-text">{faq.a}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
