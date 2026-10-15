import "server-only";

import { resolveMx } from "node:dns/promises";

import { emailDomain, isDisposableEmail } from "./disposable-email";

/**
 * Server-side sign-up email check (14 Oct 2026: a temp-mail address,
 * meinvr.com, got past the small built-in list). Three layers:
 *   1. the built-in list + name patterns (instant),
 *   2. the community list of ~100k+ throwaway domains (fetched, cached 24 h),
 *   3. the domain's mail servers (MX): none = cannot receive mail; MX run by
 *      a known throwaway service = blocked (catches brand-new temp domains
 *      that share the same mail servers).
 * Fails open on lookup errors so a DNS hiccup never blocks a real customer.
 */

const LIST_URL =
  "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf";
const LIST_TTL_MS = 24 * 60 * 60_000;

let cache: { set: Set<string>; at: number } | null = null;
let inflight: Promise<Set<string>> | null = null;

async function remoteList(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < LIST_TTL_MS) return cache.set;
  if (!inflight) {
    inflight = (async () => {
      try {
        const res = await fetch(LIST_URL, { signal: AbortSignal.timeout(5_000) });
        if (!res.ok) throw new Error(String(res.status));
        const text = await res.text();
        const set = new Set(
          text
            .split(/\r?\n/)
            .map((line) => line.trim().toLowerCase())
            .filter((line) => line && !line.startsWith("#")),
        );
        if (set.size > 1000) cache = { set, at: Date.now() };
        return cache?.set ?? set;
      } catch {
        return cache?.set ?? new Set<string>();
      } finally {
        inflight = null;
      }
    })();
  }
  return inflight;
}

function inList(domain: string, set: Set<string>): boolean {
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (set.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

/** Mail servers that belong to throwaway-inbox services. */
const THROWAWAY_MX =
  /(mailinator|guerrilla|yopmail|temp-?mail|tmpmail|10minute|trashmail|dispostable|maildrop|mailnesia|emailondeck|getnada|nada\.email|mail\.tm|mail\.gw|burner|throwaway|disposable|moakt|mohmal|tempinbox|fakeinbox|spamgourmet|mailcatch|harakirimail|mytemp|tempr\.email|inboxkitten)/;

export type EmailCheck = { ok: true } | { ok: false; reason: "invalid" | "disposable" | "no_mail_server" };

export async function checkSignupEmail(email: string | null | undefined): Promise<EmailCheck> {
  const value = (email ?? "").trim().toLowerCase();
  const domain = emailDomain(value);
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(value) || !domain) return { ok: false, reason: "invalid" };
  if (isDisposableEmail(value)) return { ok: false, reason: "disposable" };

  const list = await remoteList();
  if (inList(domain, list)) return { ok: false, reason: "disposable" };

  try {
    const mx = await Promise.race([
      resolveMx(domain),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("mx-timeout")), 4_000)),
    ]);
    if (!mx.length) return { ok: false, reason: "no_mail_server" };
    for (const record of mx) {
      const host = record.exchange.toLowerCase().replace(/\.$/, "");
      if (THROWAWAY_MX.test(host) || inList(host, list)) return { ok: false, reason: "disposable" };
    }
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ENOTFOUND" || code === "ENODATA") return { ok: false, reason: "no_mail_server" };
    // Timeouts and other DNS errors: let the person through.
  }
  return { ok: true };
}

export function emailCheckMessage(reason: Exclude<EmailCheck, { ok: true }>["reason"]): string {
  if (reason === "invalid") return "Enter a valid email address.";
  if (reason === "no_mail_server") return "This email address can't receive mail. Please use your work or personal email.";
  return "Temporary email addresses can't be used. Please sign up with your work or personal email (Gmail is fine).";
}
