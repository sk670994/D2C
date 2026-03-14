import Link from "next/link";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="main marketing-page">
      <header className="marketing-hero">
        <div>
          <p className="eyebrow">Zooptrack Intelligence Platform</p>
          <h1>Turn unit economics into scale decisions, faster.</h1>
          <p className="hero-copy">
            Real-time unit economics, media efficiency, scale planning, and AI-backed priority fixes with scenario comparison
            for modern D2C operators.
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
            <span className="tag tag-good">Weekly KPI Health Checks</span>
            <span className="tag">Scenario Lab Included</span>
            <span className="tag">AI Insights Ready</span>
          </div>
        </div>
        <Card className="hero-card">
          <CardHeader>
            <div className="hero-card-header">
              <div>
                <CardTitle>Growth Readiness Snapshot</CardTitle>
                <CardDescription>Operator-grade signals you can act on now.</CardDescription>
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
                <span>Blended ROAS</span>
                <strong>8.02x</strong>
              </div>
              <div className="hero-kpi">
                <span>Scale Verdict</span>
                <strong>Ready to Scale</strong>
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
            title: "Unit Economics Engine",
            body: "Calculate contribution margin, CAC guardrails, and profitability in seconds."
          },
          {
            title: "Media Efficiency Tracking",
            body: "Blend ROAS, CAC, and budget allocation into one operator view."
          },
          {
            title: "Scale Planner",
            body: "Know when to scale and when to pause with readiness gates."
          },
          {
            title: "AI Priority Fixes",
            body: "Instantly surface the top 3 actions with clear next-step guidance."
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
          <h2>Pathway to confident scale decisions</h2>
          <p className="muted-text">A clear, repeatable flow built for D2C teams moving fast.</p>
        </div>
        <div className="pathway-grid">
          {[
            {
              title: "Connect your data",
              body: "Import orders, ad spend, and COGS to normalize signals."
            },
            {
              title: "Model scenarios",
              body: "Compare pricing, CAC, and retention changes in minutes."
            },
            {
              title: "Act on AI priorities",
              body: "Get the top fixes ranked by margin impact and effort."
            },
            {
              title: "Scale with guardrails",
              body: "Receive automated readiness alerts before budget increases."
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
          <h2>Pricing that scales with you</h2>
          <p className="muted-text">Start free, then upgrade when you need deeper collaboration and export power.</p>
        </div>
        <div className="pricing-grid">
          <article className="pricing-card">
            <h3>Starter</h3>
            <p className="pricing-price">Free</p>
            <ul>
              <li>Core calculator + scenario lab</li>
              <li>Up to 3 saved scenarios</li>
              <li>Basic AI insights</li>
            </ul>
            <Button type="button" variant="secondary">Get Started</Button>
          </article>
          <article className="pricing-card featured">
            <h3>Growth</h3>
            <p className="pricing-price">$39 / month</p>
            <ul>
              <li>Unlimited scenarios + monthly vault</li>
              <li>Team workspace + admin visibility</li>
              <li>Advanced AI insights + exports</li>
            </ul>
            <Button type="button">Start 14-day Trial</Button>
          </article>
          <article className="pricing-card">
            <h3>Agency</h3>
            <p className="pricing-price">Custom</p>
            <ul>
              <li>Multi-brand portfolios</li>
              <li>Dedicated onboarding</li>
              <li>Priority support + roadmap input</li>
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
