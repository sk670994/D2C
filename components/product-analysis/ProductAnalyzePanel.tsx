"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { rupees } from "@/lib/format/money";
import type { ProductExtract } from "@/lib/product-analysis/extract";

export function ProductAnalyzePanel({
  onAnalyzeMarket
}: {
  onAnalyzeMarket: (query: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [product, setProduct] = useState<ProductExtract | null>(null);

  async function analyze() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/product-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const data = (await res.json()) as { product?: ProductExtract; error?: string };
      if (!res.ok || !data.product) throw new Error(data.error || "Could not read that product page");
      setProduct(data.product);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that product page");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="product-analyze">
      <div className="product-analyze-copy">
        <p className="zt-eyebrow">Analyze a product</p>
        <h2>Paste a product URL. Zooptrack reads the page, then searches the market.</h2>
        <p>Not another advertiser search. Start from your SKU, then see competing creatives, offers and hooks.</p>
      </div>
      <div className="product-analyze-form">
        <input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://yourstore.com/products/de-tan-face-wash"
          aria-label="Product URL"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void analyze();
            }
          }}
        />
        <Button type="button" onClick={() => void analyze()} disabled={loading || url.trim().length < 8}>
          {loading ? "Reading page…" : "Analyze market →"}
        </Button>
      </div>
      {error ? (
        <div className="cc-empty">
          <p>{error}</p>
          <p className="muted-text">The URL must be public HTTPS. Private networks and credentialed URLs are blocked.</p>
        </div>
      ) : null}
      {product ? (
        <div className="product-analyze-result">
          <div>
            <p className="zt-eyebrow">Your product</p>
            <h3>{product.title}</h3>
            <p>{product.price != null ? rupees(product.price) : "Price not found on page"}</p>
            <p className="muted-text">{product.description || product.audienceHint}</p>
            <p className="muted-text">{product.offerHint}</p>
          </div>
          <div>
            <p className="zt-eyebrow">Search the market as</p>
            <strong>{product.searchQuery}</strong>
            <div className="product-chips">
              {product.keywords.map((word) => (
                <span key={word}>{word}</span>
              ))}
            </div>
            <Button type="button" onClick={() => onAnalyzeMarket(product.searchQuery)}>
              Find competitor creatives
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
