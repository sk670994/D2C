"use client";

import Link from "next/link";
import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { useRef, type ReactNode } from "react";
import styles from "./ZooptrackSite.module.css";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import { FAQ } from "./faq";
import { ProductStory } from "./ProductStory";
import { formatInr, FOUNDING_OFFER, PLANS, TRIAL_DAYS, yearlyPriceInr } from "@/lib/billing/plans";

type Scene = "home" | "radar" | "conveyor" | "ledger" | "unfold" | "cockpit" | "archive";

const nav = [
  ["AdSpy", "/adspy"],
  ["Brand ads", "/brand"],
  ["How it works", "/decision-loop"],
  ["Pricing", "/pricing"],
  ["FAQ", "/faq"],
] as const;

function SceneSVG({ scene }: { scene: Scene }) {
  if (scene === "radar") {
    return (
      <svg className={styles.sceneSvg} viewBox="0 0 700 520" aria-hidden>
        <g className={styles.rings}>
          <circle cx="350" cy="260" r="190" />
          <circle cx="350" cy="260" r="135" />
          <circle cx="350" cy="260" r="80" />
        </g>
        <path className={styles.radarBeam} d="M350 260 L520 120" />
        <path className={styles.radarAxis} d="M350 55V465M145 260H555" />
        {[[430,155],[500,310],[282,182],[220,350],[375,395]].map(([cx,cy], i) => (
          <g key={i} className={styles.signalDot} style={{ transformOrigin: `${cx}px ${cy}px`, animationDelay: `${i * .55}s` }}>
            <circle cx={cx} cy={cy} r="6" />
            <circle cx={cx} cy={cy} r="15" />
          </g>
        ))}
      </svg>
    );
  }

  if (scene === "conveyor") {
    const stations = ["RIVALS", "ADS", "CHECK", "DECODE", "BRIEF"];
    return (
      <svg className={styles.sceneSvg} viewBox="0 0 900 440" aria-hidden>
        <path className={styles.conveyorLine} d="M70 330 C230 150 320 150 450 270 S690 350 830 130" />
        {stations.map((name, i) => {
          const x = [95, 270, 450, 635, 815][i];
          const y = [300, 170, 235, 300, 125][i];
          return (
            <g key={name} className={styles.station}>
              <rect x={x - 60} y={y - 30} width="120" height="60" rx="18" />
              <text x={x} y={y + 5}>{name}</text>
              <circle cx={x} cy={y} r="5" />
            </g>
          );
        })}
        <circle className={styles.flowToken} cx="95" cy="300" r="13" />
      </svg>
    );
  }

  if (scene === "ledger") {
    return (
      <svg className={styles.sceneSvg} viewBox="0 0 760 520" aria-hidden>
        {[0,1,2,3].map((i) => (
          <g key={i} className={styles.ledgerPanel} style={{ transform: `translate(${i*26}px, ${i*42}px) rotate(${(i-1.5)*3}deg)` }}>
            <rect x="160" y="90" width="420" height="270" rx="24" />
            <path d="M205 150H510M205 195H450M205 245H500" />
            <circle cx="205" cy="302" r="12" />
            <text x="235" y="307">{["FREE","STARTER","GROWTH","PRO"][i]}</text>
          </g>
        ))}
      </svg>
    );
  }

  if (scene === "unfold") {
    return (
      <svg className={styles.sceneSvg} viewBox="0 0 760 500" aria-hidden>
        {[0,1,2,3].map((i) => (
          <g key={i} className={styles.unfoldCard} style={{ transform: `translateY(${i*62}px)` }}>
            <rect x="170" y="55" width="420" height="100" rx="18" />
            <path d="M205 92H530" />
            <path d="M530 92l-14-10M530 92l-14 10" />
          </g>
        ))}
      </svg>
    );
  }

  if (scene === "cockpit") {
    return (
      <svg className={styles.sceneSvg} viewBox="0 0 760 500" aria-hidden>
        <rect className={styles.cockpitFrame} x="95" y="70" width="570" height="360" rx="30" />
        <path className={styles.graphLine} d="M145 340 C220 250 250 320 320 240 S425 275 500 175 S570 230 620 125" />
        {[0,1,2,3,4].map((i) => <circle key={i} cx={155+i*105} cy={330-[0,65,20,110,175][i]} r="6" />)}
        <rect className={styles.cockpitTile} x="140" y="110" width="160" height="60" rx="14" />
        <rect className={styles.cockpitTile} x="320" y="110" width="150" height="60" rx="14" />
        <rect className={styles.cockpitTile} x="490" y="110" width="120" height="60" rx="14" />
      </svg>
    );
  }

  if (scene === "archive") {
    return (
      <svg className={styles.sceneSvg} viewBox="0 0 760 500" aria-hidden>
        {[0,1,2,3,4].map((i) => (
          <g key={i} className={styles.archiveRow} style={{ transform: `translateY(${i*58}px)` }}>
            <rect x="175" y="65" width="410" height="42" rx="10" />
            <path d="M205 86H520" />
          </g>
        ))}
      </svg>
    );
  }

  return (
    <svg className={styles.sceneSvg} viewBox="0 0 760 500" aria-hidden>
      <g className={styles.signalGrid}>
        {Array.from({ length: 9 }).map((_, i) => <path key={`v${i}`} d={`M${100+i*70} 70V430`} />)}
        {Array.from({ length: 6 }).map((_, i) => <path key={`h${i}`} d={`M90 ${90+i*62}H670`} />)}
      </g>
      {Array.from({ length: 22 }).map((_, i) => {
        const x = 110 + ((i * 103) % 560);
        const y = 82 + ((i * 73) % 330);
        return <circle key={i} className={styles.fieldDot} cx={x} cy={y} r={i % 5 === 0 ? 3.5 : 2} style={{ animationDelay: `${(i % 9) * .28}s` }} />;
      })}
      <path className={styles.signalOrbit} d="M110 330 C235 105 510 70 650 270 C540 430 250 435 110 330Z" />
      <circle className={styles.heroCore} cx="390" cy="250" r="34" />
    </svg>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong className={accent ? styles.metricAccent : undefined}>{value}</strong>
    </div>
  );
}

function SectionHeader({ kicker, title, copy }: { kicker: string; title: string; copy?: string }) {
  return (
    <div className={styles.sectionHeader}>
      <span className={styles.kicker}>{kicker}</span>
      <h2>{title}</h2>
      {copy ? <p>{copy}</p> : null}
    </div>
  );
}

function Scene({ scene }: { scene: Scene }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const rotate = useTransform(scrollYProgress, [0, 1], [-4, 5]);
  const y = useTransform(scrollYProgress, [0, 1], [30, -30]);
  const smoothRotate = useSpring(rotate, { stiffness: 90, damping: 20 });
  const smoothY = useSpring(y, { stiffness: 90, damping: 20 });

  return (
    <motion.div ref={ref} className={styles.sceneWrap} style={{ rotateX: smoothRotate, y: smoothY }}>
      <div className={styles.sceneGlow} />
      <SceneSVG scene={scene} />
    </motion.div>
  );
}

function Shell({ children, scene, eyebrow, title, copy, actions }: {
  children?: ReactNode;
  scene: Scene;
  eyebrow: string;
  title: ReactNode;
  copy: string;
  actions?: ReactNode;
}) {
  return (
    <main className={styles.site}>
      <header className={styles.navbar}>
        <Link className={styles.logo} href="/" aria-label="Zooptrack home">
          <ZooptrackLogo height={30} tone="blue" priority />
        </Link>
        <nav>
          {nav.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
        <Link className={styles.navCta} href="/login">Start free trial</Link>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.kicker}>{eyebrow}</span>
          <h1>{title}</h1>
          <p>{copy}</p>
          {actions ? <div className={styles.heroActions}>{actions}</div> : null}
        </div>
        <Scene scene={scene} />
      </section>

      {children}
    </main>
  );
}

const Button = ({ href, children, secondary = false }: { href: string; children: ReactNode; secondary?: boolean }) => (
  <Link href={href} className={secondary ? styles.buttonSecondary : styles.button}>{children}</Link>
);

export function ZooptrackHome() {
  return (
    <Shell
      scene="home"
      eyebrow="COMPETITOR AD INTELLIGENCE / INDIAN D2C"
      title={<>See every ad your rivals run.<br /><em>Know your next move first.</em></>}
      copy="Zooptrack reads your competitors' live Facebook and Instagram ads every night, checks its count against Meta's own, and tells you what changed: big pushes, new offers and the ads they keep paying for."
      actions={<><Button href="/login">Start 7-day free trial</Button><Button href="/brand" secondary>See any brand&apos;s ads free</Button></>}
    >
      <section className={styles.brief} aria-label="Example rival brief">
        <div>
          <span className={styles.kicker}>EXAMPLE / MONDAY BRIEF</span>
          <strong>BIG PUSH</strong>
          <p>Glowleaf launched 38 ads in 7 days, most on a Buy 1 Get 1 offer.</p>
          <small>What to do: answer with a bundle, not a discount. (Made-up brand; your brief uses your real rivals.)</small>
        </div>
        <div className={styles.metricGrid}>
          <Metric label="RIVALS WATCHED" value="5" />
          <Metric label="NEW ADS THIS WEEK" value="61" />
          <Metric label="LONGEST-RUNNING AD" value="64 days" />
          <Metric label="COVERAGE VS META" value="97%" accent />
        </div>
      </section>

      <ProductStory />

      <section className={styles.narrative}>
        <SectionHeader kicker="WHAT YOU GET" title="Five answers, every week." copy="From your rivals' ad libraries to one clear move, with the ads that prove it." />
        <div className={styles.nodeGrid}>
          {[
            ["01", "LAUNCHES", "who pushed hardest this week"],
            ["02", "OFFERS", "what they discount and bundle"],
            ["03", "WINNERS", "ads they keep paying for"],
            ["04", "HOOKS", "what they say first, decoded by AI"],
            ["05", "YOUR MOVE", "a counter-ad brief in one click"],
          ].map(([n, t, c]) => (
            <motion.div key={n} className={styles.nodeCard} whileHover={{ y: -8, rotateX: 5 }}>
              <span>{n}</span><strong>{t}</strong><small>{c}</small>
            </motion.div>
          ))}
        </div>
      </section>

      <section className={styles.darkSection}>
        <div><span className={styles.kicker}>WHY ZOOPTRACK</span><h2>Stop scrolling the Ad Library by hand.</h2></div>
        <div className={styles.statement}>META AD LIBRARY <b>→</b> EVERY AD, CHECKED <b>→</b> WHAT CHANGED <b>→</b> YOUR MOVE</div>
      </section>
    </Shell>
  );
}

export function ZooptrackDecisionLoop() {
  return (
    <Shell
      scene="conveyor"
      eyebrow="HOW IT WORKS"
      title={<>From a rival&apos;s ad library<br /><em>to your next move.</em></>}
      copy="Five steps run for you every night. You read the result in two minutes, daily or weekly, whenever you choose."
      actions={<Button href="/login">Start 7-day free trial</Button>}
    >
      <section className={styles.narrative}>
        <SectionHeader kicker="FIVE STEPS" title="What happens between Meta and your inbox." />
        <Scene scene="conveyor" />
        <div className={styles.stationRows}>
          {[
            ["01","RIVALS","You pick the brands you lose sales to. We lock each one to its exact Meta page, so lookalike pages never mix in."],
            ["02","ADS","Every night we read every ad they run on Facebook and Instagram in India, live and stopped."],
            ["03","CHECK","We compare our count with Meta's own total and show you the coverage, so you know how complete the data is."],
            ["04","DECODE","AI reads each ad: hook, offer, format, language and angle. Days live show which ads they keep paying for."],
            ["05","BRIEF","Today and your email report tell you what changed and what to do, with the ads as evidence. One click writes a counter-ad brief."],
          ].map(([n,t,c]) => <article key={n}><span>{n}</span><div><h3>{t}</h3><p>{c}</p></div></article>)}
        </div>
      </section>
    </Shell>
  );
}

export function ZooptrackPricing() {
  return (
    <Shell
      scene="ledger"
      eyebrow="PRICING"
      title={<>Simple plans.<br /><em>Cancel any time.</em></>}
      copy="Start with a 7-day free trial. Plans differ by how many rivals you watch and whether you get big-move alerts."
    >
      <p role="note" style={{ maxWidth: 760, margin: "0 auto 18px", textAlign: "center", fontWeight: 700 }}>
        Founding price: our first {FOUNDING_OFFER.spots} customers keep this price for {FOUNDING_OFFER.lockMonths} months.
      </p>
      <section className={styles.pricingWrap}>
        {(["trial", "starter", "growth", "agency"] as const).map((key, i) => {
          const plan = PLANS[key];
          return (
            <motion.article key={key} className={`${styles.priceCard} ${key === "growth" ? styles.featured : ""}`} whileHover={{ y: -14, rotateX: 6 }}>
              <span>{plan.name.toUpperCase()}</span>
              <strong>{key === "trial" ? "₹0" : formatInr(plan.priceInr)}</strong>
              <small>{key === "trial" ? `${TRIAL_DAYS} days · no card` : `/ month · or ${formatInr(yearlyPriceInr(key))}/year (2 months free)`}</small>
              <div>{plan.features.slice(0, 4).map((f) => <p key={f}>✓ {f}</p>)}</div>
              <Button href={key === "trial" ? "/login" : "/login?next=/today/billing"} secondary={key !== "growth"}>{i === 0 ? "Start free trial" : key === "growth" ? "Start with Growth" : "Get started"}</Button>
            </motion.article>
          );
        })}
      </section>
    </Shell>
  );
}

export function ZooptrackFaq() {
  const items = FAQ.map((f) => [f.q, f.a] as const);
  return (
    <Shell
      scene="unfold"
      eyebrow="FAQ"
      title={<>Straight<br /><em>answers.</em></>}
      copy="Where the data comes from, what it costs, and what we never guess."
    >
      <section className={styles.faqWrap}>
        {items.map(([q,a], i) => (
          <details key={q} className={styles.faqItem} open={i === 0}>
            <summary><span>0{i+1}</span><strong>{q}</strong><i>+</i></summary>
            <p>{a}</p>
          </details>
        ))}
      </section>
    </Shell>
  );
}

export function ZooptrackAdSpyIntro() {
  return (
    <section className={styles.adspyIntro}>
      <div><span className={styles.kicker}>ADSPY / RADAR</span><h1>See what the market is testing.</h1><p>Discover competitors, resolve creatives, collect history and turn raw ads into evidence for your next move.</p></div>
      <Scene scene="radar" />
    </section>
  );
}

export function ZooptrackLegal({ title, copy }: { title: string; copy: string }) {
  return (
    <Shell scene="archive" eyebrow="ZOOPTRACK / ARCHIVE" title={title} copy={copy}>
      <section className={styles.legalWrap}><span>DOCUMENT INDEX</span><div className={styles.legalRule} />{Array.from({ length: 10 }).map((_, i) => <div key={i} className={styles.legalLine}><small>0{i+1}</small><span>{["Scope","Definitions","Data","Security","Retention","Access","Cookies","Analytics","Changes","Contact"][i]}</span></div>)}</section>
    </Shell>
  );
}
