"use client";

import { motion, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "framer-motion";
import { useRef, type ReactNode } from "react";

import styles from "./ProductStory.module.css";

/*
 * "How it works" scroll story for the landing page: four steps, each with a
 * small product screen that assembles as it scrolls into view. The rail on
 * the left fills with scroll progress. Brand names in the mock screens are
 * invented. Reduced-motion users get the finished screens, no movement.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

type Step = { n: string; kicker: string; title: string; copy: string; screen: ReactNode };

function RivalsScreen() {
  const rivals = [
    ["G", "Glowleaf", "412 live ads"],
    ["R", "Rootkind", "188 live ads"],
    ["N", "Nuvra Skin", "96 live ads"],
  ];
  return (
    <div className={styles.screen}>
      <div className={styles.search}>
        <span aria-hidden="true">⌕</span> glow<span className={styles.caret} />
      </div>
      <ul className={styles.list}>
        {rivals.map(([initial, name, meta], i) => (
          <motion.li key={name} variants={item} custom={i}>
            <span className={styles.avatar}>{initial}</span>
            <span>
              <strong>{name}</strong>
              <small>{meta} · exact Meta page</small>
            </span>
            <span className={styles.watch}>{i < 2 ? "Watching" : "Watch"}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function CoverageScreen() {
  return (
    <div className={styles.screen}>
      <small className={styles.label}>META AD LIBRARY SHOWS</small>
      <strong className={styles.big}>1,240 live ads</strong>
      <div className={styles.bar}>
        <motion.span variants={{ hidden: { width: "0%" }, shown: { width: "97%", transition: { duration: 1.2, ease: EASE, delay: 0.2 } } }} />
      </div>
      <div className={styles.barMeta}>
        <span>Zooptrack holds 1,203 · 97%</span>
        <span className={styles.ok}>Source-checked</span>
      </div>
      <div className={styles.nights}>
        {[38, 52, 44, 71, 63, 90, 77].map((h, i) => (
          <motion.span key={i} style={{ height: `${h}%` }} variants={{ hidden: { scaleY: 0 }, shown: { scaleY: 1, transition: { duration: 0.5, ease: EASE, delay: 0.3 + i * 0.06 } } }} />
        ))}
      </div>
      <small className={styles.label}>NEW ADS PER NIGHT</small>
    </div>
  );
}

function MoveScreen() {
  return (
    <div className={styles.screen}>
      <motion.div className={styles.move} variants={item} custom={0}>
        <div className={styles.moveHead}>
          <span className={styles.avatar}>G</span>
          <strong>Glowleaf</strong>
          <span className={styles.pill}>Big push</span>
        </div>
        <p className={styles.moveTitle}>Launched 38 ads in 7 days, most on a Buy 1 Get 1 offer.</p>
        <div className={styles.tiles}>
          {["Buy 1, get 1 free", "Dermat tested", "Only ₹299"].map((t, i) => (
            <motion.span key={t} className={styles[`tone${i + 1}`]} variants={item} custom={i + 1}>
              {t}
            </motion.span>
          ))}
        </div>
        <p className={styles.todo}>
          <b>What to do:</b> answer with a bundle, not a discount.
        </p>
      </motion.div>
    </div>
  );
}

function ReportScreen() {
  return (
    <div className={`${styles.screen} ${styles.mail}`}>
      <small className={styles.label}>MONDAY · 9:00 AM</small>
      <strong className={styles.mailTitle}>Your rivals this week</strong>
      {[
        ["Glowleaf", "Big push on BOGO"],
        ["Rootkind", "Staying power: one ad live 64 days"],
        ["Nuvra Skin", "Quiet week"],
      ].map(([b, t], i) => (
        <motion.div key={b} className={styles.mailRow} variants={item} custom={i}>
          <strong>{b}</strong>
          <span>{t}</span>
        </motion.div>
      ))}
      <motion.span className={styles.brief} variants={item} custom={3}>
        Brief a counter-ad →
      </motion.span>
    </div>
  );
}

const item = {
  hidden: { opacity: 0, y: 12 },
  shown: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE, delay: 0.15 + i * 0.1 } }),
};

const STEPS: Step[] = [
  { n: "01", kicker: "PICK RIVALS", title: "Name the brands you lose sales to.", copy: "Type a brand, pick its exact Meta page. No lookalike pages, no guessing.", screen: <RivalsScreen /> },
  { n: "02", kicker: "EVERY NIGHT", title: "We read every ad they run.", copy: "Zooptrack checks its count against Meta's own total, so you see how complete the data is.", screen: <CoverageScreen /> },
  { n: "03", kicker: "EVERY MORNING", title: "Today tells you what changed.", copy: "Big pushes, new offers, ads that keep running. Each move opens the ads that prove it.", screen: <MoveScreen /> },
  { n: "04", kicker: "EVERY MONDAY", title: "The week lands in your inbox.", copy: "Three lines per rival, and a counter-ad brief when you want to answer.", screen: <ReportScreen /> },
];

function StoryStep({ step, index }: { step: Step; index: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [60, -60]);
  const rotate = useTransform(scrollYProgress, [0, 0.5, 1], [index % 2 ? -2 : 2, 0, index % 2 ? 1 : -1]);

  return (
    <motion.div
      ref={ref}
      className={`${styles.step} ${index % 2 ? styles.flip : ""}`}
      initial={reduce ? "shown" : "hidden"}
      whileInView="shown"
      viewport={{ once: true, amount: 0.35 }}
    >
      <motion.div className={styles.copy} variants={{ hidden: { opacity: 0, x: index % 2 ? 24 : -24 }, shown: { opacity: 1, x: 0, transition: { duration: 0.6, ease: EASE } } }}>
        <span className={styles.n}>{step.n}</span>
        <span className={styles.kicker}>{step.kicker}</span>
        <h3>{step.title}</h3>
        <p>{step.copy}</p>
      </motion.div>
      <motion.div className={styles.frame} style={reduce ? undefined : { y, rotate }}>
        {step.screen}
      </motion.div>
    </motion.div>
  );
}

function Rail({ progress }: { progress: MotionValue<number> }) {
  const reduce = useReducedMotion();
  const smooth = useSpring(progress, { stiffness: 120, damping: 30, mass: 0.3 });
  return (
    <div className={styles.rail} aria-hidden="true">
      <motion.span style={{ scaleY: reduce ? 1 : smooth }} />
    </div>
  );
}

export function ProductStory() {
  const ref = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 70%", "end 60%"] });

  return (
    <section ref={ref} className={styles.story} aria-labelledby="story-title">
      <header className={styles.head}>
        <span className={styles.kicker}>HOW ZOOPTRACK WORKS</span>
        <h2 id="story-title">
          From a rival&apos;s ad library <em>to your next move.</em>
        </h2>
      </header>
      <div className={styles.body}>
        <Rail progress={scrollYProgress} />
        <div className={styles.steps}>
          {STEPS.map((step, i) => (
            <StoryStep key={step.n} step={step} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
