import Link from "next/link";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="main marketing-page">
      <header className="marketing-hero">
        <div>
          <p className="eyebrow">D2C Intelligence Platform</p>
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

      <footer className="site-footer">
        <div>
          <p className="eyebrow">D2C Growth Intelligence</p>
          <p className="muted-text">Built for performance teams that want scale clarity.</p>
        </div>
        <div className="footer-links">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/login">Sign In</Link>
        </div>
      </footer>
    </main>
  );
}
