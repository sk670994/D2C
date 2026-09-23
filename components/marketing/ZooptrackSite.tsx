"use client";

import Link from "next/link";
import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { useRef, type ReactNode } from "react";
import styles from "./ZooptrackSite.module.css";

type Scene = "home" | "radar" | "conveyor" | "ledger" | "unfold" | "cockpit" | "archive";

const nav = [
  ["AdSpy", "/adspy"],
  ["Decision Loop", "/decision-loop"],
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
    const stations = ["MARKET", "ADS", "ECONOMICS", "DIAGNOSIS", "ACTION"];
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
          <span className={styles.logoChip}>
            <span className={styles.logoCrop}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/zooptrack-logo.png" alt="Zooptrack" width={1408} height={768} className={styles.logoImage} />
            </span>
          </span>
        </Link>
        <nav>
          {nav.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
        <Link className={styles.navCta} href="/login">Start free</Link>
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
      eyebrow="D2C GROWTH INTELLIGENCE / LIVE SYSTEM"
      title={<>Know what makes money.<br /><em>Know what to do next.</em></>}
      copy="Zooptrack connects your economics, market signals and competitor creatives into one decision loop — so growth decisions come with evidence."
      actions={<><Button href="/login">Enter the command center</Button><Button href="/adspy" secondary>Explore AdSpy</Button></>}
    >
      <section className={styles.brief}>
        <div><span className={styles.kicker}>LIVE BRIEF / 09:42</span><strong>ATTENTION 01</strong><p>CAC is drifting above the allowable guardrail.</p><small>Meta prospecting / estimated leakage ₹18.4k weekly</small></div>
        <div className={styles.metricGrid}>
          <Metric label="NET CONTRIBUTION" value="₹63,240" />
          <Metric label="TRUE ROAS" value="2.7x" />
          <Metric label="PROFITABLE REVENUE" value="+14%" />
          <Metric label="CAC / GUARDRAIL" value="+33%" accent />
        </div>
      </section>

      <section className={styles.narrative}>
        <SectionHeader kicker="THE DECISION LOOP" title="One system. Five transformations." copy="Zooptrack moves from signal to diagnosis to action — not from dashboard to dashboard." />
        <div className={styles.nodeGrid}>
          {["01 MARKET","02 ADS","03 ECONOMICS","04 DIAGNOSIS","05 ACTION"].map((x, i) => (
            <motion.div key={x} className={styles.nodeCard} whileHover={{ y: -8, rotateX: 5 }}>
              <span>{x.slice(0,2)}</span><strong>{x.slice(3)}</strong><small>{["see the opening","see what they test","know the actual margin","find the leak","run the next move"][i]}</small>
            </motion.div>
          ))}
        </div>
      </section>

      <section className={styles.darkSection}>
        <div><span className={styles.kicker}>WHY ZOOPTRACK</span><h2>Stop opening eleven dashboards to make one decision.</h2></div>
        <div className={styles.statement}>DATA <b>→</b> DIAGNOSIS <b>→</b> RECOMMENDATION <b>→</b> ACTION</div>
      </section>
    </Shell>
  );
}

export function ZooptrackDecisionLoop() {
  return (
    <Shell
      scene="conveyor"
      eyebrow="THE DECISION LOOP"
      title={<>From market noise<br /><em>to the next move.</em></>}
      copy="A visual operating model for D2C growth: every signal becomes evidence, every diagnosis carries a why, and every action can be measured."
      actions={<Button href="/login">Open Command Center</Button>}
    >
      <section className={styles.narrative}>
        <SectionHeader kicker="FIVE STATIONS" title="Watch the signal transform." />
        <Scene scene="conveyor" />
        <div className={styles.stationRows}>
          {[
            ["01","MARKET","External signals, category movement and competitor context."],
            ["02","ADS","Creative angles, hooks, offers, formats and patterns."],
            ["03","ECONOMICS","Contribution after COGS, COD, RTO, shipping and fees."],
            ["04","DIAGNOSIS","The constraint, with evidence and expected rupee impact."],
            ["05","ACTION","A prioritized experiment or intervention to run next."],
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
      eyebrow="PRICING / DECISION CAPACITY"
      title={<>Price the<br /><em>decision loop.</em></>}
      copy="Plans unlock more history, tracked competitors, ZWIRK and alerts — not a pile of extra dashboards."
    >
      <section className={styles.pricingWrap}>
        {[
          ["FREE","₹0","One brand","Daily attention brief","Limited ZWIRK"],
          ["STARTER","₹999","Product URL → market search","WhatsApp-ready brief","Basic experiments"],
          ["GROWTH","₹2,499","Tracked competitors","Full ZWIRK","True ROAS vs platform ROAS"],
          ["PRO","₹4,999","Historical intelligence","Team workspace","Alerts on CAC, RTO and leaks"],
        ].map(([name, price, a, b, c], i) => (
          <motion.article key={name} className={`${styles.priceCard} ${i === 2 ? styles.featured : ""}`} whileHover={{ y: -14, rotateX: 6 }}>
            <span>{name}</span><strong>{price}</strong><small>/ month</small>
            <div><p>✓ {a}</p><p>✓ {b}</p><p>✓ {c}</p></div>
            <Button href="/login" secondary={i !== 2}>{i === 2 ? "Start 14-day trial" : "Get started"}</Button>
          </motion.article>
        ))}
      </section>
    </Shell>
  );
}

export function ZooptrackFaq() {
  const items = [
    ["Do you replace Shopify or Ads Manager?","No. Zooptrack sits above those systems and turns their signals into one decision: pause, test or scale."],
    ["Will ZWIRK invent my profit?","No. Dashboard facts remain facts; observations remain observations; assumptions are labeled."],
    ["How fast is the first diagnosis?","The Command Center starts with usable economics and attention signals rather than an empty dashboard."],
    ["Is this built for Indian D2C?","Yes. COD, RTO, shipping, GST-aware selling price and INR are first-class concepts."],
  ];
  return (
    <Shell
      scene="unfold"
      eyebrow="SUPPORT / FAQ"
      title={<>Every answer,<br /><em>one unfold away.</em></>}
      copy="A spatial FAQ that behaves like the rest of the product: concise, tactile and easy to scan."
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
