/**
 * Returns a same-site path for post-login redirects.
 *
 * Rejects anything that a browser could treat as another origin:
 * absolute URLs, protocol-relative "//host", backslash tricks "/\host",
 * and control characters. Falls back to /dashboard.
 */
export function safeNextPath(
  value: string | null | undefined,
  fallback = "/today",
): string {
  if (typeof value !== "string") return fallback;

  const candidate = value.trim();

  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.startsWith("/\\") ||
    candidate.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(candidate)
  ) {
    return fallback;
  }

  try {
    // Resolve against a dummy origin; the result must stay on it.
    const resolved = new URL(candidate, "https://zooptrack.invalid");
    if (resolved.origin !== "https://zooptrack.invalid") return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
