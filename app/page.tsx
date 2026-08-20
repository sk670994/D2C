import Link from "next/link";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="main marketing-page">
      <header className="marketing-hero">
        <div>
          <p className="eyebrow">Profitability OS for Indian D2C brands</p>
          <h1>Know which ads actually make money.</h1>
          <p className="hero-copy">
            Track true profit after COD, returns, shipping and payment fees. Find hidden loss points, recover margin, and scale with confidence.
          </p>
          <div className="hero-actions">
            <Link href="/login">
              <Button type="button">Start Free Workspace</Button>
            </Link>
            <Link href="/dashboard">
              <Button type="button" variant="secondary">View Live Dashboard</Button>
            </Link>
          </div>
          <div className="hero-meta-row">
            <span className="tag tag-good">COD & returns adjusted profit</span>
            <span className="tag">Daily loss alerts</span>
            <span className="tag">India D2C margin guardrails</span>
          </div>
        </div>
        <Card className="hero-card">
          <CardHeader>
            <div className="hero-card-header">
              <div>
                <CardTitle>Daily Profit Pulse</CardTitle>
                <CardDescription>Clear financial signals, not just charts.</CardDescription>
              </div>
              <ThemeToggle />
            </div>
          </CardHeader>
          <CardContent className="hero-card-content">
            <div className="hero-kpi-stack">
              <div className="hero-kpi">
                <span>Contribution Margin</span>
                <strong>39.9%</strong>
              </div>
              <div className="hero-kpi">
                <span>Retained Revenue</span>
                <strong>INR 31.2K</strong>
              </div>
              <div className="hero-kpi">
                <span>Scale Verdict</span>
                <strong>Ready with guardrails</strong>
              </div>
            </div>
            <Button type="button">See Full Breakdown</Button>
          </CardContent>
        </Card>
      </header>

      <section className="logo-strip">
        <p className="muted-text">Trusted by operators from</p>
        <div className="logo-row">
          {["Retentia", "Bluemarch", "Fieldhouse", "Nexura", "Atlas D2C", "Brightlane"].map((logo) => (
            <span key={logo} className="logo-pill">{logo}</span>
          ))}
        </div>
      </section>

      <section className="marketing-grid">
        {[
          {
            title: "True Profit Visibility",
            body: "Stop relying on vanity ROAS. See profit after COD, returns, shipping, and fees."
          },
          {
            title: "Hidden Loss Detection",
            body: "Identify the campaigns, channels and checkout leaks that are draining cash."
          },
          {
            title: "Scale with Margin Guardrails",
            body: "Only increase spend when your unit economics and break-even math are healthy."
          },
          {
            title: "Transparent Calculations",
            body: "Every number is traceable so founders can trust the output and explain it to their team."
          }
        ].map((item) => (
          <article key={item.title} className="marketing-card">
            <h3>{item.title}</h3>
            <p className="muted-text">{item.body}</p>
          </article>
        ))}
      </section>

      <section className="pathway-section">
        <div className="section-head">
          <h2>From raw spend to real profit</h2>
          <p className="muted-text">A simple workflow designed for brands that need clarity fast.</p>
        </div>
        <div className="pathway-grid">
          {[
            {
              title: "Connect ad, order and cost data",
              body: "Bring ad spend, store orders, COD and product costs together in one place."
            },
            {
              title: "Measure your true margin",
              body: "See what cash you actually keep after returns, COD, shipping and fees."
            },
            {
              title: "Spot the worst leaks",
              body: "Identify exactly where campaigns and channels are losing money."
            },
            {
              title: "Scale only when it pays",
              body: "Use simple guardrails to increase spend safely and avoid blind growth."
            }
          ].map((step, index) => (
            <div key={step.title} className="pathway-step">
              <span className="pathway-index">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{step.title}</h3>
                <p className="muted-text">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="testimonial-section">
        <div className="section-head">
          <h2>Echoes from growth teams</h2>
          <p className="muted-text">Operators describe the clarity they gain in the first week.</p>
        </div>
        <div className="testimonial-grid">
          {[
            {
              quote:
                "We stopped guessing where margin was leaking. The scenario lab surfaced our top two fixes in 24 hours.",
              name: "Aarav Mehta",
              role: "Growth Lead, Fablet Studio"
            },
            {
              quote:
                "The readiness gates finally gave us a confident signal to scale spend without panic.",
              name: "Lea Thompson",
              role: "VP Performance, Lumenly"
            },
            {
              quote:
                "The dashboard feels like an operator co-pilot. Everything is concrete, not just charts.",
              name: "Ray Chen",
              role: "GM, Northlane D2C"
            }
          ].map((item) => (
            <article key={item.name} className="testimonial-card">
              <p className="testimonial-quote">“{item.quote}”</p>
              <div className="testimonial-meta">
                <span>{item.name}</span>
                <span className="muted-text">{item.role}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="pricing-section">
        <div className="section-head">
          <h2>Pricing built for Indian D2C operators</h2>
          <p className="muted-text">Start free, then upgrade when you need agency-grade reporting and multi-brand control.</p>
        </div>
        <div className="pricing-grid">
          <article className="pricing-card">
            <h3>Starter</h3>
            <p className="pricing-price">Free</p>
            <ul>
              <li>Core profit calculator + weekly summary</li>
              <li>Connect one store</li>
              <li>Basic loss alerts</li>
            </ul>
            <Button type="button" variant="secondary">Get Started</Button>
          </article>
          <article className="pricing-card featured">
            <h3>Growth</h3>
            <p className="pricing-price">₹999 / month</p>
            <ul>
              <li>Profit leak reports + channel profitability</li>
              <li>WhatsApp & email summaries</li>
              <li>Scale guardrails + export-ready numbers</li>
            </ul>
            <Button type="button">Start 14-day Trial</Button>
          </article>
          <article className="pricing-card">
            <h3>Agency</h3>
            <p className="pricing-price">₹4999+ / month</p>
            <ul>
              <li>Multi-brand reporting</li>
              <li>Client-ready profitability dashboards</li>
              <li>Dedicated onboarding and support</li>
            </ul>
            <Button type="button" variant="secondary">Talk to Sales</Button>
          </article>
        </div>
      </section>

      <section className="faq-section">
        <div className="section-head">
          <h2>Got a quick question?</h2>
          <p className="muted-text">Everything you need before you jump into the workspace.</p>
        </div>
        <div className="faq-grid">
          {[
            {
              q: "How fast can we get set up?",
              a: "Most teams connect data and run their first scenario in under two minutes."
            },
            {
              q: "Can we invite multiple operators?",
              a: "Yes. Growth plan includes team workspaces and admin visibility."
            },
            {
              q: "Is this built for agencies?",
              a: "The Agency tier supports multi-brand portfolios and client reporting."
            },
            {
              q: "Do you replace existing dashboards?",
              a: "No. We sit on top and translate raw metrics into decisions."
            }
          ].map((item) => (
            <article key={item.q} className="faq-card">
              <h3>{item.q}</h3>
              <p className="muted-text">{item.a}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cta-section">
        <Card className="cta-card">
          <CardHeader>
            <CardTitle>Ready to diagnose your growth engine?</CardTitle>
            <CardDescription>Spin up a workspace in under 2 minutes.</CardDescription>
          </CardHeader>
          <CardContent className="cta-actions">
            <Link href="/login">
              <Button type="button">Start Free Workspace</Button>
            </Link>
            <Link href="/dashboard">
              <Button type="button" variant="secondary">View Demo</Button>
            </Link>
          </CardContent>
        </Card>
      </section>

    </main>
  );
}
