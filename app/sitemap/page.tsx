const links = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/zwirk", label: "ZWIRK Assistant" },
  { href: "/login", label: "Sign In" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact Us" },
  { href: "/cookies", label: "Cookie Policies" }
];

export default function SitemapPage() {
  return (
    <main className="main policy-page">
      <header className="policy-hero">
        <p className="eyebrow">Navigation</p>
        <h1>Sitemap</h1>
        <p className="muted-text">All primary pages in the Zooptrack workspace.</p>
      </header>
      <section className="policy-grid">
        {links.map((item) => (
          <article key={item.href} className="policy-card">
            <h3>{item.label}</h3>
            <p className="muted-text">
              <a href={item.href}>{item.href}</a>
            </p>
          </article>
        ))}
      </section>
    </main>
  );
}
