const sections = [
  {
    title: "Why We Use Cookies",
    body: "Cookies help us keep you signed in, remember your workspace settings, and measure platform usage."
  },
  {
    title: "Types of Cookies",
    body: "We use essential cookies for authentication and preferences, plus optional analytics cookies for performance insights."
  },
  {
    title: "Your Choices",
    body: "You can disable non-essential cookies in your browser settings. Some features may not work as expected."
  }
];

export default function CookiesPage() {
  return (
    <main className="main policy-page cookies-page">
      <header className="policy-hero">
        <p className="eyebrow">Legal</p>
        <h1>Cookie Policies</h1>
        <p className="muted-text">How Zooptrack uses cookies and similar technologies.</p>
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
