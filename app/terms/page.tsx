import type { Metadata } from "next";
import { SiteTopBar } from "@/components/brand/SiteTopBar";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms for using Zooptrack, AdSpy and ZWIRK.",
  alternates: { canonical: "/terms" },
};

const sections = [
  {
    title: "Service Scope",
    body:
      "Zooptrack shows ads from Meta's public Ad Library, summaries of what changed, AI labels and suggestions, plus planning tools for unit economics. Counts and labels are our best reading of public data and can be incomplete; suggestions are guidance, not financial or legal advice. Ad creatives belong to their owners and are shown for research."
  },
  {
    title: "Accounts",
    body:
      "You are responsible for maintaining the confidentiality of your credentials and for activity that occurs under your account."
  },
  {
    title: "Payments",
    body:
      "New accounts get a 7-day free trial. Paid plans are billed monthly in advance through Razorpay, in INR plus GST. You can cancel any time from Plan & billing and keep access until the end of the period you paid for. Fees already paid are not refunded, except where the law requires it."
  },
  {
    title: "Acceptable Use",
    body:
      "You agree not to misuse the service, resell or bulk-export its data, attempt to access data that is not yours, or interfere with platform performance."
  },
  {
    title: "Data Ownership",
    body:
      "You retain ownership of the data you input. You grant us a limited license to process it for providing the service."
  },
  {
    title: "Changes",
    body:
      "We may update these terms periodically. Continued use indicates acceptance of the updated terms."
  },
  {
    title: "Contact",
    body:
      "For questions about these terms, contact hello.zooptrack@gmail.com."
  }
];

export default function TermsPage() {
  return (
    <main className="main policy-page terms-page">
      <SiteTopBar />
      <header className="policy-hero">
        <p className="eyebrow">Legal</p>
        <h1>Terms and Conditions</h1>
        <p className="muted-text">
          These terms govern use of the Zooptrack service (competitor ad intelligence and the related tools). Please read them carefully.
        </p>
        <p className="policy-meta">Effective date: March 10, 2026</p>
      </header>
      <section className="policy-grid">
        {sections.map((section) => (
          <article key={section.title} className="policy-card">
            <h3>{section.title}</h3>
            <p className="muted-text">{section.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
