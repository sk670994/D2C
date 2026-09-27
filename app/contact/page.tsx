import type { Metadata } from "next";
import { SiteTopBar } from "@/components/brand/SiteTopBar";

export const metadata: Metadata = {
  title: "Contact the Zooptrack team",
  description: "Questions about AdSpy, pricing, agency plans or a demo? Write to the Zooptrack team.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <main className="main policy-page contact-page">
      <SiteTopBar />
      <header className="policy-hero">
        <p className="eyebrow">Support</p>
        <h1>Contact Us</h1>
        <p className="muted-text">Write to hello.zooptrack@gmail.com. We reply within 1 business day.</p>
      </header>
      <section className="policy-grid">
        <article className="policy-card">
          <h3>General Support</h3>
          <p className="muted-text">Email: hello.zooptrack@gmail.com</p>
        </article>
        <article className="policy-card">
          <h3>Sales</h3>
          <p className="muted-text">Email: hello.zooptrack@gmail.com</p>
        </article>
        <article className="policy-card">
          <h3>Security</h3>
          <p className="muted-text">Email: hello.zooptrack@gmail.com</p>
        </article>
      </section>
    </main>
  );
}
