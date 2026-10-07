import type { Metadata } from "next";
import { SiteTopBar } from "@/components/brand/SiteTopBar";

export const metadata: Metadata = {
  title: "Shipping and delivery policy",
  description: "How Zooptrack is delivered after purchase.",
  alternates: { canonical: "/shipping-policy" },
};

const sections = [
  {
    title: "Delivery of the service",
    body:
      "Zooptrack is delivered online at zooptrack.co.in. Your paid plan is activated on your account within a few minutes of a successful payment. You sign in with the same email you used to sign up."
  },
  {
    title: "Reports and emails",
    body:
      "Rival reports and alerts are delivered by email to your account address at the schedule you choose in Zooptrack, and are always available inside the app."
  },
  {
    title: "No physical shipping",
    body:
      "We do not ship any physical goods, so no shipping charges apply and there is no shipping address to provide."
  },
  {
    title: "If access is delayed",
    body:
      "If your plan is not active within 1 hour of payment, write to hello.zooptrack@gmail.com with your account email and payment ID. We fix it within 1 working day or refund the payment in full."
  }
];

export default function ShippingDeliveryPolicyPage() {
  return (
    <main className="main policy-page shipping-policy">
      <SiteTopBar />
      <header className="policy-hero">
        <p className="eyebrow">Legal</p>
        <h1>Shipping & Delivery Policy</h1>
        <p className="muted-text">
          Zooptrack is an online software service. Nothing physical is shipped.
        </p>
        <p className="policy-meta">Effective date: October 7, 2026</p>
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
