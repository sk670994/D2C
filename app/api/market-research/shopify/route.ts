import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerAuthClient } from "@/lib/supabase/server";

type ShopifyProduct = {
  id?: number;
  title?: string;
  handle?: string;
  vendor?: string;
  product_type?: string;
  tags?: string[];
  variants?: Array<{ price?: string }>;
};

function normalizeStoreUrl(value: string) {
  const raw = value.trim();
  if (!raw) throw new Error("Shopify store URL is required");

  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(candidate);
  if (url.protocol !== "https:") {
    throw new Error("Shopify store URL must use HTTPS");
  }
  if (url.username || url.password || url.port) {
    throw new Error("Shopify store URL must not include credentials or a port");
  }

  url.pathname = "/products.json";
  url.search = new URLSearchParams({ limit: "250" }).toString();
  url.hash = "";
  return url;
}

export async function GET(request: NextRequest) {
  const supabase = await createServerAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const store = new URL(request.url).searchParams.get("store") || "";

  let productsUrl: URL;
  try {
    productsUrl = normalizeStoreUrl(store);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid Shopify store URL" },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(productsUrl, {
      headers: { Accept: "application/json", "User-Agent": "Zooptrack-Market-Research/1.0" },
      next: { revalidate: 300 }
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Shopify public catalog is unavailable", status: response.status },
        { status: response.status === 404 ? 404 : 502 }
      );
    }

    const payload = (await response.json()) as { products?: ShopifyProduct[] };
    const products = (payload.products || []).map((product) => {
      const prices = (product.variants || [])
        .map((variant) => Number(variant.price))
        .filter((price) => Number.isFinite(price) && price >= 0);

      return {
        id: product.id,
        title: product.title || "Untitled product",
        handle: product.handle || "",
        vendor: product.vendor || "",
        productType: product.product_type || "",
        tags: product.tags || [],
        minPrice: prices.length ? Math.min(...prices) : null,
        maxPrice: prices.length ? Math.max(...prices) : null
      };
    });

    const prices = products
      .flatMap((product) => [product.minPrice, product.maxPrice])
      .filter((price): price is number => typeof price === "number");
    const vendors = Array.from(new Set(products.map((product) => product.vendor).filter(Boolean)));
    const productTypes = Array.from(new Set(products.map((product) => product.productType).filter(Boolean)));

    return NextResponse.json({
      provider: "shopify-public-catalog",
      storeUrl: productsUrl.origin,
      products,
      summary: {
        productCount: products.length,
        vendorCount: vendors.length,
        vendors,
        productTypes,
        minPrice: prices.length ? Math.min(...prices) : null,
        maxPrice: prices.length ? Math.max(...prices) : null
      },
      note: "This uses the store's public products.json catalog. Private Shopify Admin data and competitor revenue are not exposed."
    });
  } catch (error) {
    console.error("Shopify market research error:", error);
    return NextResponse.json(
      { error: "Unable to read the Shopify public catalog" },
      { status: 502 }
    );
  }
}
