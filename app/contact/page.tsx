export default function ContactPage() {
  return (
    <main className="main policy-page contact-page">
      <header className="policy-hero">
        <p className="eyebrow">Support</p>
        <h1>Contact Us</h1>
        <p className="muted-text">We respond within 1 business day.</p>
      </header>
      <section className="policy-grid">
        <article className="policy-card">
          <h3>General Support</h3>
          <p className="muted-text">Email: support@yourcompany.com</p>
        </article>
        <article className="policy-card">
          <h3>Sales</h3>
          <p className="muted-text">Email: sales@yourcompany.com</p>
        </article>
        <article className="policy-card">
          <h3>Security</h3>
          <p className="muted-text">Email: security@yourcompany.com</p>
        </article>
      </section>
    </main>
  );
}
