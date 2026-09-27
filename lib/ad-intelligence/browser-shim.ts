/**
 * The worker runs TypeScript through tsx (esbuild, keepNames on). esbuild
 * wraps named functions as __name(fn, "name"); when such a function is passed
 * to page.evaluate() it runs inside Chromium, where __name does not exist:
 * "ReferenceError: __name is not defined". Defining a no-op __name in every
 * page fixes it. Harmless under Next.js (no __name calls there).
 */
export const ESBUILD_NAME_SHIM =
  "globalThis.__name = globalThis.__name || function (target) { return target; };";

/**
 * Optional outbound proxy for the worker's Chromium (ADSPY_PROXY_URL, e.g.
 * http://user:pass@in.proxy-host.com:8000). Cloud servers get blocked by
 * Meta faster than home connections; a residential/ISP proxy fixes that.
 * Returns {} when unset, so launch options stay unchanged.
 */
export function parseProxyUrl(value: string | undefined | null): { proxy?: { server: string; username?: string; password?: string } } {
  const raw = String(value ?? "").trim().replace(/^(["'])(.*)\1$/, "$2");
  if (!raw) return {};
  try {
    const url = new URL(raw);
    if (!/^(https?|socks5):$/.test(url.protocol) || !url.hostname) return {};
    const server = `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}`;
    return {
      proxy: {
        server,
        ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
        ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
      },
    };
  } catch {
    return {};
  }
}

export function browserProxy() {
  return parseProxyUrl(process.env.ADSPY_PROXY_URL);
}
