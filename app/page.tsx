import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="main marketing-page">
      <header className="marketing-hero">
        <div>
          <p className="eyebrow">ZOOPTRACK / D2C OPERATING INTELLIGENCE</p>
          <h1>Your ads. Your margins. Your market.<br />One decision loop.</h1>
          <p className="hero-copy">
            Connect your store economics and ad accounts. Zooptrack shows what is actually profitable after COD, returns, shipping and fees, what competitors are testing, and what you should do next.
          </p>
          <div className="hero-actions">
            <Link href="/login">
              <Button type="button">Start free</Button>
            </Link>
            <Link href="/dashboard">
              <Button type="button" variant="secondary">Open Command Center</Button>
            </Link>
          </div>
          <div className="hero-meta-row" aria-label="Product principles">
            <span>01 / SEE THE BUSINESS</span>
            <span>02 / SEE THE MARKET</span>
            <span>03 / ACT WITH EVIDENCE</span>
          </div>
        </div>
        <div className="hero-instrument">
          <div className="instrument-topline"><span>FRI 04 SEP 2026</span><span>LIVE BRIEF / 09:42</span></div>
          <div className="instrument-metric"><strong>₹63,240</strong><span>NET CONTRIBUTION</span></div>
          <div className="instrument-grid">
            <div><strong>2.7x</strong><span>TRUE ROAS</span></div>
            <div><strong>+14%</strong><span>PROFITABLE REVENUE</span></div>
            <div><strong className="metric-alert">+33%</strong><span>CAC / GUARDRAIL</span></div>
          </div>
          <div className="instrument-rule" />
          <div className="instrument-attention"><span>ATTENTION 01</span><strong>CAC is drifting above allowable</strong><small>Meta prospecting / estimated leakage ₹18.4k weekly</small></div>
        </div>
      </header>

      <section className="decision-loop-section">
        <div className="section-head">
          <p className="eyebrow">THE DECISION LOOP</p>
          <h2>Observe the signal. Find the leak. Make the next move.</h2>
        </div>
        <div className="decision-loop" aria-label="Market to action decision loop">
          {[
            ["01", "MARKET"],
            ["02", "ADS"],
            ["03", "ECONOMICS"],
            ["04", "DIAGNOSIS"],
            ["05", "ACTION"],
          ].map(([index, label]) => <div key={label} className="loop-node"><span>{index}</span><strong>{label}</strong></div>)}
          <i className="loop-signal" aria-hidden="true" />
        </div>
      </section>

      <section className="pathway-section">
        <div className="section-head">
          <h2>The product is the loop, not the modules</h2>
          <p className="muted-text">You should never have to understand AdSpy, Brand Vault or Scenario Lab. You should understand the next action.</p>
        </div>
        <ol className="marketing-loop">
          <li>Understand the business — true profit after COD, RTO, shipping, COGS and fees</li>
          <li>Understand the market — competitor creatives, offers and hooks</li>
          <li>Find the leak or the opening</li>
          <li>ZWIRK explains why, with evidence</li>
          <li>Create an experiment, then measure whether it worked</li>
        </ol>
      </section>

      <section className="marketing-grid">
        {[
          {
            title: "True profit visibility",
            body: "Platform ROAS is a starting point. Contribution after returns and fees is the number you scale on."
          },
          {
            title: "Market, not a database",
            body: "Paste a product URL. See recurring angles, offers and formats — then what that means for your economics."
          },
          {
            title: "Decisions with a why",
            body: "Every recommendation carries evidence, expected rupee impact, and a next action. AI does not invent your P&L."
          },
          {
            title: "Transparent math",
            body: "Open any headline metric and see the subtraction. Trust is a product feature when you are dealing with money."
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
          <h2>Price the decision loop, not extra dashboards</h2>
          <p className="muted-text">Higher plans unlock history, tracked competitors, ZWIRK, alerts and experiments — not more charts.</p>
        </div>
        <div className="pricing-grid">
          <article className="pricing-card">
            <h3>Free</h3>
            <p className="pricing-price">₹0</p>
            <ul>
              <li>One brand · contribution model</li>
              <li>Daily attention brief</li>
              <li>Limited ZWIRK</li>
            </ul>
            <Link href="/login"><Button type="button" variant="secondary">Get started</Button></Link>
          </article>
          <article className="pricing-card">
            <h3>Starter</h3>
            <p className="pricing-price">₹999 / month</p>
            <ul>
              <li>Product URL → market search</li>
              <li>WhatsApp-ready daily brief</li>
              <li>Basic experiments</li>
            </ul>
            <Link href="/login"><Button type="button" variant="secondary">Start trial</Button></Link>
          </article>
          <article className="pricing-card featured">
            <h3>Growth</h3>
            <p className="pricing-price">₹2,499 / month</p>
            <ul>
              <li>Tracked competitors + market radar</li>
              <li>Full ZWIRK on your numbers</li>
              <li>True ROAS vs platform ROAS</li>
            </ul>
            <Link href="/login"><Button type="button">Start 14-day trial</Button></Link>
          </article>
          <article className="pricing-card">
            <h3>Pro</h3>
            <p className="pricing-price">₹4,999 / month</p>
            <ul>
              <li>Historical intelligence</li>
              <li>Team workspace · exports</li>
              <li>Alerts on CAC, RTO and leaks</li>
            </ul>
            <Link href="/contact"><Button type="button" variant="secondary">Talk to us</Button></Link>
          </article>
        </div>
      </section>

      <section className="faq-section">
        <div className="section-head">
          <h2>Before you connect data</h2>
        </div>
        <div className="faq-grid">
          {[
            {
              q: "Do you replace Shopify or Ads Manager?",
              a: "No. We sit on top and turn those tabs into one decision: pause, test, or scale."
            },
            {
              q: "Will ZWIRK invent my profit?",
              a: "No. Dashboard facts stay facts. AdSpy observations stay observations. Assumptions are labeled."
            },
            {
              q: "How fast is the first diagnosis?",
              a: "Load sample economics immediately, or enter COGS and spend. The Command Center is the first screen, not an empty dashboard."
            },
            {
              q: "Is this built for Indian D2C?",
              a: "Yes. COD, returns, shipping, GST-aware selling price and INR are first-class, not localization afterthoughts."
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
          <div className="cta-card">
            <p className="eyebrow">READY WHEN YOU ARE</p>
            <h2>Stop opening eleven dashboards to make one decision.</h2>
            <p className="muted-text">Open Command Center. See what needs attention. Ask ZWIRK. Test it.</p>
            <div className="cta-actions">
            <Link href="/login">
              <Button type="button">Start free workspace</Button>
            </Link>
            <Link href="/dashboard">
              <Button type="button" variant="secondary">View Command Center</Button>
            </Link>
            </div>
          </div>
      </section>
    </main>
  );
}
