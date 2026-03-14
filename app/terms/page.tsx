const sections = [
  {
    title: "Service Scope",
    body:
      "The platform provides planning tools for unit economics, paid media efficiency, and scale readiness. Outputs are guidance, not financial or legal advice."
  },
  {
    title: "Accounts",
    body:
      "You are responsible for maintaining the confidentiality of your credentials and for activity that occurs under your account."
  },
  {
    title: "Payments",
    body:
      "If paid plans are enabled, subscription fees will be billed in advance. You may cancel at any time, with access until the end of the billing period."
  },
  {
    title: "Acceptable Use",
    body:
      "You agree not to misuse the service, attempt to access data that is not yours, or interfere with platform performance."
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
      "For questions about these terms, contact support@yourcompany.com."
  }
];

export default function TermsPage() {
  return (
    <main className="main policy-page">
      <header className="policy-hero">
        <p className="eyebrow">Legal</p>
        <h1>Terms and Conditions</h1>
        <p className="muted-text">
          These terms govern use of the Zooptrack Growth Intelligence Command Center. Please read them carefully.
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
