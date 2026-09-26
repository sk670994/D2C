/**
 * The worker runs TypeScript through tsx (esbuild, keepNames on). esbuild
 * wraps named functions as __name(fn, "name"); when such a function is passed
 * to page.evaluate() it runs inside Chromium, where __name does not exist:
 * "ReferenceError: __name is not defined". Defining a no-op __name in every
 * page fixes it. Harmless under Next.js (no __name calls there).
 */
export const ESBUILD_NAME_SHIM =
  "globalThis.__name = globalThis.__name || function (target) { return target; };";
