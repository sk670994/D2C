"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Keeps open tabs on the latest deploy without anyone pressing Ctrl+Shift+R.
 * Checks the live build every 5 minutes and when the tab comes back into
 * view. On a new build it reloads at a calm moment: when the tab becomes
 * visible again, or on the next page change, never while someone is typing.
 */
export function VersionWatcher() {
  const pathname = usePathname();
  const first = useRef<string | null>(null);
  const stale = useRef(false);
  const lastPath = useRef(pathname);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const { version } = (await res.json()) as { version?: string };
        if (!alive || !version) return;
        if (first.current === null) first.current = version;
        else if (version !== first.current) stale.current = true;
      } catch {
        // offline: try again later
      }
    };
    const typing = () => {
      const el = document.activeElement;
      return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable));
    };
    const onVisible = async () => {
      if (document.visibilityState !== "visible") return;
      await check();
      if (stale.current && !typing()) window.location.reload();
    };
    void check();
    const timer = window.setInterval(() => void check(), 5 * 60_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // New build + the user moved to another page: load it fresh.
  useEffect(() => {
    if (pathname !== lastPath.current) {
      lastPath.current = pathname;
      if (stale.current) window.location.reload();
    }
  }, [pathname]);

  return null;
}
