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

      return fetch(
        request ?? input,
        {
          ...init,
          headers,
        },
      );
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
