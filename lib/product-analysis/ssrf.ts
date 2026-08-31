const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.internal",
  "instance-data"
]);

function isBlockedIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0 || a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function assertPublicHttpsUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Product URL is required");

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(candidate);

  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS product URLs are allowed");
  }
  if (url.username || url.password) {
    throw new Error("URLs must not include credentials");
  }
  if (url.port && url.port !== "443") {
    throw new Error("Custom ports are not allowed");
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("That host is not allowed");
  }
  if (host === "::1" || host.includes(":")) {
    throw new Error("IPv6 hosts are not allowed");
  }
  if (isBlockedIpv4(host)) {
    throw new Error("Private network addresses are not allowed");
  }

  url.hash = "";
  return url;
}
