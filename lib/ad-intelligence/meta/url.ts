import {
  normalizeExtractedText,
} from "./text";

/* =========================================================
 * URL UTILITIES
 * ======================================================= */

export function unwrapFacebookRedirect(
  value: string | null,
): string | null {
  const text =
    normalizeExtractedText(value);

  if (!text) {
    return null;
  }

  try {
    const url = new URL(text);

    if (
      url.hostname ===
        "l.facebook.com" &&
      url.pathname === "/l.php"
    ) {
      const destination =
        url.searchParams.get("u");

      if (destination) {
        try {
          return decodeURIComponent(
            destination,
          );
        } catch {
          return destination;
        }
      }
    }

    return url.toString();
  } catch {
    return text;
  }
}

export function normalizeUrl(
  value: unknown,
): string | null {
  const text =
    normalizeExtractedText(value);

  if (!text) {
    return null;
  }

  const unwrapped =
    unwrapFacebookRedirect(text);

  if (!unwrapped) {
    return null;
  }

  try {
    return new URL(unwrapped).toString();
  } catch {
    return null;
  }
}

export function isFacebookInternalUrl(
  value: string,
): boolean {
  try {
    const url = new URL(value);

    const host =
      url.hostname.toLowerCase();

    return (
      host === "facebook.com" ||
      host.endsWith(".facebook.com") ||
      host === "instagram.com" ||
      host.endsWith(".instagram.com")
    );
  } catch {
    return false;
  }
}

export function isDomain(
  value: string,
): boolean {
  const text = value.trim();

  if (!text) {
    return false;
  }

  return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(
    text,
  );
}