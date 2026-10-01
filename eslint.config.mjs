import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,

  globalIgnores([
    ".next/**",
    "node_modules/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // Generated test artifacts
    "tests/results/**",
    "playwright-report/**",
    "test-results/**",

    // Local backups / snapshots
    "**/*-backup-*/**",
    "**/*-backup*/**",
    "zwirk-*/**",
    ".adspy-backup-*/**",
  ]),
]);