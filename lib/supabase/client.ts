import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

  if (!url || !anonKey) {
    throw new Error("Missing Supabase browser environment variables");
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Supabase URL must use http or https");
    }
  } catch {
    throw new Error("Invalid NEXT_PUBLIC_SUPABASE_URL value");
  }

  return createBrowserClient(url, anonKey);
}
