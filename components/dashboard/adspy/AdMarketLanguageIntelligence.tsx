"use client";

import styles from "./AdSpyPremium.module.css";
import type { GlobalLanguage, GlobalMarket } from "@/lib/ad-intelligence/global/types";

export function AdMarketLanguageIntelligence({ languages, markets }: { languages: GlobalLanguage[]; markets: GlobalMarket[] }) {
  return (
    <div className={styles.intelligenceGrid}>
      <section className={styles.infoPanel}>
        <div className={styles.panelHeader}><div><p className={styles.kicker}>LANGUAGE DISTRIBUTION</p><h3 className={styles.panelTitle}>Creative language mix</h3></div><span className={styles.panelNote}>Ads can appear in more than one language.</span></div>
        {languages.length ? <div className={styles.barList}>{languages.slice(0, 10).map((language) => <div key={language.code} className={styles.barRow}><div className={styles.barLabel}><span>{language.name}</span><strong>{language.count.toLocaleString("en-IN")}</strong></div><div className={styles.barTrack}><div className={styles.barFill} style={{ width: `${Math.min(100, Math.max(2, language.share))}%` }} /></div><span className={styles.barMeta}>{language.share}% · {language.source === "provider" ? "source" : "AI/heuristic"}</span></div>)}</div> : <div className={styles.emptySmall}>Language data will appear as creatives are collected and analyzed.</div>}
      </section>

      <section className={styles.infoPanel}>
        <div className={styles.panelHeader}><div><p className={styles.kicker}>MARKETS & REGIONS</p><h3 className={styles.panelTitle}>Where creatives are observed</h3></div><span className={styles.panelNote}>No city-level numbers are invented.</span></div>
        {markets.length ? <div className={styles.marketList}>{markets.slice(0, 18).map((market, index) => <div key={`${market.countryCode}-${market.stateName}-${market.cityName}-${market.regionName}-${index}`} className={styles.marketRow}><div><strong>{market.cityName || market.stateName || market.countryName || market.countryCode}</strong><span>{[market.cityName ? market.stateName : null, market.countryName, market.regionName].filter(Boolean).join(" · ")}</span></div><div className={styles.marketCount}><strong>{market.count.toLocaleString("en-IN")}</strong><span>{market.share}%</span></div></div>)}</div> : <div className={styles.emptySmall}>City/state targeting is unavailable from the current public source until the provider exposes it.</div>}
      </section>
    </div>
  );
}
