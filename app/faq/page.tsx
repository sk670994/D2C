const faqs = [
  {
    q: "What does Zooptrack do?",
    a: "Zooptrack helps DTC teams model unit economics, track performance, and decide when to scale."
  },
  {
    q: "Is my data safe?",
    a: "We store workspace data securely and follow privacy controls described in the Privacy Policy."
  },
  {
    q: "Do you offer team access?",
    a: "Yes. Team workspaces are available on paid plans."
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. You can cancel from your account settings and retain access until the billing period ends."
  }
];

export default function FaqPage() {
  return (
    <main className="main policy-page">
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
