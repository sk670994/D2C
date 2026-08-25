"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./AdSpyPremium.module.css";

type Suggestion = { id: string; name: string; alias: string | null; domain: string | null };

export function AdAutocomplete({ value, onChange, onSelect }: { value: string; onChange: (value: string) => void; onSelect: (suggestion: Suggestion) => void }) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) { setItems([]); setOpen(false); return; }
    const timer = window.setTimeout(async () => {
      const requestId = ++requestRef.current;
      try {
        const response = await fetch(`/api/ad-intelligence/autocomplete?q=${encodeURIComponent(query)}`, { cache: "no-store" });
        const data = await response.json() as { suggestions?: Suggestion[] };
        if (requestId !== requestRef.current) return;
        const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
        setItems(suggestions);
        setOpen(suggestions.length > 0);
      } catch { if (requestId === requestRef.current) { setItems([]); setOpen(false); } }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <div className={styles.autocompleteWrap}>
      <input className={styles.searchInput} value={value} onChange={(event) => onChange(event.target.value)} onFocus={() => setOpen(items.length > 0)} placeholder="Search brand, advertiser or keyword" aria-label="Brand or keyword" />
      {open ? (
        <div className={styles.autocompleteMenu}>
          {items.map((item) => (
            <button key={item.id} type="button" className={styles.autocompleteItem} onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelect(item); setOpen(false); }}>
              <span className={styles.autocompleteName}>{item.name}</span>
              <span className={styles.autocompleteMeta}>{item.alias ?? item.domain ?? "Brand"}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
