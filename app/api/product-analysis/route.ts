import { NextResponse } from "next/server";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";
import { assertPublicHttpsUrl } from "@/lib/product-analysis/ssrf";
import { extractProduct } from "@/lib/product-analysis/extract";

export async function POST(request: Request) {
  const supabase = await createServerAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { url?: string } | null;
  let target: URL;
  try {
    target = assertPublicHttpsUrl(String(body?.url ?? ""));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid product URL" },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(target, {
      redirect: "manual",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Zooptrack-Product-Analysis/1.0"
      },
      signal: AbortSignal.timeout(8000)
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        return NextResponse.json({ error: "Redirect had no location" }, { status: 502 });
      }
      const next = assertPublicHttpsUrl(new URL(location, target).toString());
      const followed = await fetch(next, {
        redirect: "error",
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "Zooptrack-Product-Analysis/1.0"
        },
        signal: AbortSignal.timeout(8000)
      });
      if (!followed.ok) {
        return NextResponse.json({ error: "Product page could not be fetched" }, { status: 502 });
      }
      const html = (await followed.text()).slice(0, 400_000);
      return NextResponse.json({ product: extractProduct(html, next.toString()) });
    }

    if (!response.ok) {
      return NextResponse.json({ error: "Product page could not be fetched" }, { status: 502 });
    }

    const html = (await response.text()).slice(0, 400_000);
    return NextResponse.json({ product: extractProduct(html, target.toString()) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Product analysis failed";
    if (message.includes("not allowed") || message.includes("HTTPS") || message.includes("ports")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: "Product analysis failed" }, { status: 502 });
  }
}
