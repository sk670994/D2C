"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Search } from "lucide-react";

type Item = { id: string; label: string; hint: string; href: string };

const ACTIONS: Item[] = [
  { id: "go-today", label: "Today", hint: "This week's rival moves", href: "/today" },
  { id: "go-adspy", label: "Discover ads", hint: "Search any brand's Meta ads", href: "/adspy" },
  { id: "go-report", label: "Monday report", hint: "Preview the email", href: "/today/report" },
  { id: "go-vault", label: "Brand Vault", hint: "Your brand, rivals and economics", href: "/brand-vault" },
];

/**
 * ⌘K / Ctrl+K: jump to any brand or page from anywhere in the app.
 * Brand results come from the indexed advertiser search (exact Meta pages).
 */
export function CommandBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [brands, setBrands] = useState<Item[]>([]);
  const [active, setActive] = useState(0);
  const [mac, setMac] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const listId = useId();

  const q = query.trim().toLowerCase();
  const actions = q ? ACTIONS.filter((a) => a.label.toLowerCase().includes(q)) : ACTIONS;
  const items = [...brands, ...actions];

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setBrands([]);
    setActive(0);
    returnFocus.current?.focus();
  }, []);

  const openBar = useCallback(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) close();
        else openBar();
      }
    };
    const onOpen = () => openBar();
    window.addEventListener("keydown", onKey);
    window.addEventListener("zooptrack:command", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("zooptrack:command", onOpen);
    };
  }, [close, open, openBar]);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
  }, []);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open || q.length < 2) {
      setBrands([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/ad-intelligence/autocomplete?q=${encodeURIComponent(q)}&country=IN`, { cache: "no-store", signal: controller.signal });
        const data = (await response.json().catch(() => ({}))) as { advertisers?: Array<{ pageId: string; label: string; category?: string | null }> };
        if (controller.signal.aborted) return;
        setBrands(
          (data.advertisers ?? [])
            .filter((a) => /^\d+$/.test(String(a.pageId ?? "")))
            .slice(0, 6)
            .map((a) => ({ id: `b-${a.pageId}`, label: a.label, hint: a.category ? `${a.category} · brand overview` : "Brand overview", href: `/today/brand/${a.pageId}` })),
        );
        setActive(0);
      } catch {
        // aborted or offline: keep the page actions
      }
    }, 150);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, q]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    close();
    router.push(item.href);
  };

  return (
    <>
      <button type="button" className="zd-cmd-trigger" onClick={openBar} aria-haspopup="dialog">
        <Search size={16} aria-hidden="true" />
        <span>Search brands</span>
        <kbd>{mac ? "⌘K" : "Ctrl K"}</kbd>
      </button>
      {open ? (
        <div className="zd-cmd-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
          <div className="zd-cmd" role="dialog" aria-modal="true" aria-label="Search brands and pages">
            <div className="zd-cmd-input">
              <Search size={18} aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    close();
                  } else if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActive((i) => Math.min(i + 1, Math.max(0, items.length - 1)));
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActive((i) => Math.max(i - 1, 0));
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    go(items[active]);
                  } else if (event.key === "Tab") {
                    event.preventDefault();
                  }
                }}
                placeholder="Type a brand (Mamaearth, boAt…) or a page"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={items[active] ? `${listId}-${items[active].id}` : undefined}
                autoComplete="off"
                spellCheck={false}
              />
              <kbd>Esc</kbd>
            </div>
            <ul id={listId} role="listbox" className="zd-cmd-list">
              {items.length ? (
                items.map((item, index) => (
                  <li
                    key={item.id}
                    id={`${listId}-${item.id}`}
                    role="option"
                    aria-selected={index === active}
                    className={index === active ? "is-active" : undefined}
                    onMouseEnter={() => setActive(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      go(item);
                    }}
                  >
                    <span className="zd-col" style={{ gap: 0 }}>
                      <strong>{item.label}</strong>
                      <span className="zd-muted" style={{ fontSize: 13 }}>
                        {item.hint}
                      </span>
                    </span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </li>
                ))
              ) : (
                <li className="zd-cmd-empty" role="presentation">
                  No indexed brand matches “{query.trim()}”. Search it once in Discover ads.
                </li>
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
