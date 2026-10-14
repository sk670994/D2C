import "server-only";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

function getEnv(
  name: string,
): string {
  const value =
    (
      process.env[name] ??
      ""
    ).trim();

  if (!value) {
    throw new Error(
      `Missing ${name}.`,
    );
  }

  return value;
}

/**
 * Global AdSpy database client.
 *
 * IMPORTANT:
 * - This client is server-only.
 * - It uses the Supabase sb_secret_ key.
 * - The secret key must be sent as `apikey`.
 * - We explicitly remove Authorization so a user JWT
 *   or Supabase's automatic API-key Authorization header
 *   cannot interfere with the global dataset queries.
 */
const DB_FETCH_TIMEOUT_MS = Number(process.env.DB_FETCH_TIMEOUT_MS) || 25_000;
const DB_FETCH_RETRIES = Math.max(0, Math.min(6, Number(process.env.DB_FETCH_RETRIES) || 0));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** 2 s, 5 s, 10 s, 20 s, 30 s ... */
const retryDelayMs = (attempt: number) => [2_000, 5_000, 10_000, 20_000, 30_000, 30_000][attempt] ?? 30_000;

export function createGlobalServiceClient(): SupabaseClient {
  const url =
    getEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
    );

  const secretKey =
    getEnv(
      "SUPABASE_SERVICE_ROLE_KEY",
    );

  if (
    !secretKey.startsWith("sb_secret_") &&
    !secretKey.startsWith("eyJ")
  ) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY must be a Supabase secret key or legacy service-role JWT.",
    );
  }

  const globalFetch: typeof fetch =
    async (
      input,
      init,
    ) => {
      const request =
        input instanceof Request
          ? input
          : undefined;

      const headers =
        new Headers(
          request?.headers ??
            undefined,
        );

      if (init?.headers) {
        const initHeaders =
          new Headers(
            init.headers,
          );

        initHeaders.forEach(
          (
            value,
            key,
          ) => {
            headers.set(
              key,
              value,
            );
          },
        );
      }

      // Keep this private key out of Authorization headers; it is sent only
      // as the server-side Supabase API key.
      headers.delete(
        "authorization",
      );

      headers.set(
        "apikey",
        secretKey,
      );

      // No database call may hang a function until Vercel kills it (seen:
      // /api/billing and /api/health at 300 s while the DB was unhealthy).
      // Callers that pass their own signal keep it; otherwise cap at 25 s.
      // PC worker (DB_FETCH_RETRIES, set by run-prefill.ps1): ride out a
      // dropped Wi-Fi / a busy database instead of failing the whole brand
      // (13-14 Oct: "fetch failed" bursts killed several collections).
      // Retries only failures where the database did not answer: network
      // errors and 502/503/504. Vercel keeps the default of no retries.
      for (let attempt = 0; ; attempt += 1) {
        const signal = init?.signal ?? AbortSignal.timeout(DB_FETCH_TIMEOUT_MS);
        try {
          const response = await fetch(
            request ?? input,
            {
              ...init,
              headers,
              signal,
            },
          );
          if (attempt < DB_FETCH_RETRIES && [502, 503, 504].includes(response.status)) {
            await sleep(retryDelayMs(attempt));
            continue;
          }
          return response;
        } catch (error) {
          const network = error instanceof TypeError; // "fetch failed"
          if (!network || attempt >= DB_FETCH_RETRIES || init?.signal?.aborted) throw error;
          await sleep(retryDelayMs(attempt));
        }
      }
    };

  return createClient(
    url,
    secretKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },

      global: {
        fetch: globalFetch,
        headers: {
          apikey: secretKey,
        },
      },
    },
  );
}
