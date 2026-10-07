import type { Metadata } from "next";
import { SiteTopBar } from "@/components/brand/SiteTopBar";

export const metadata: Metadata = {
  title: "Cancellation and refund policy",
  description: "How cancellations and refunds work for Zooptrack subscriptions.",
  alternates: { canonical: "/refund-policy" },
};

const sections = [
  {
    title: "Free trial",
    body:
      "New accounts get a 7-day free trial. No payment details are needed for the trial and nothing is charged during it."
  },
  {
    title: "Cancelling a subscription",
    body:
      "You can cancel any time from Plan & billing inside Zooptrack, or by writing to hello.zooptrack@gmail.com. Cancellation stops the next renewal. You keep access until the end of the billing period you have already paid for."
  },
  {
    title: "Refunds",
    body:
      "Subscription fees are billed monthly in advance and are not refunded for partly used periods, except where the law requires it. If you were charged twice, charged after cancelling, or charged for a failed or incomplete transaction, we refund the full amount."
  },
  {
    title: "How refunds are paid",
    body:
      "Approved refunds are processed within 5\u20137 working days to the original payment method through Razorpay. Your bank or card issuer may take a few more days to show the credit."
  },
  {
    title: "Contact",
    body:
      "For any billing question or refund request, write to hello.zooptrack@gmail.com with your account email and the payment date. We reply within 2 working days."
  }
];

export default function CancellationRefundPolicyPage() {
  return (
    <main className="main policy-page refund-policy">
      <SiteTopBar />
      <header className="policy-hero">
        <p className="eyebrow">Legal</p>
        <h1>Cancellation & Refund Policy</h1>
        <p className="muted-text">
          This policy explains how you can cancel a Zooptrack subscription and when payments are refunded.
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
