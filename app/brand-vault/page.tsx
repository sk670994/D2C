"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type BrandVaultForm = {
  brandName: string;
  websiteUrl: string;
  tone: string;
  audience: string;
  doNotSay: string;
  heroProduct: string;
  mainObjection: string;
  competitorFocus: string;
};

const emptyForm: BrandVaultForm = {
  brandName: "",
  websiteUrl: "",
  tone: "",
  audience: "",
  doNotSay: "",
  heroProduct: "",
  mainObjection: "",
  competitorFocus: ""
};

export default function BrandVaultPage() {
  const [form, setForm] = useState<BrandVaultForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadVault() {
      try {
        const res = await fetch("/api/brand-vault");
        if (!res.ok) {
          throw new Error("Unable to load Brand Vault.");
        }
        const data = (await res.json()) as { brandVault?: Partial<BrandVaultForm> & { updatedAt?: string } };
        if (!active) return;
        if (data.brandVault) {
          setForm({
            brandName: data.brandVault.brandName ?? "",
            websiteUrl: data.brandVault.websiteUrl ?? "",
            tone: data.brandVault.tone ?? "",
            audience: data.brandVault.audience ?? "",
            doNotSay: data.brandVault.doNotSay ?? "",
            heroProduct: data.brandVault.heroProduct ?? "",
            mainObjection: data.brandVault.mainObjection ?? "",
            competitorFocus: data.brandVault.competitorFocus ?? ""
          });
          setSavedAt(data.brandVault.updatedAt ?? null);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load Brand Vault.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadVault();
    return () => {
      active = false;
    };
  }, []);

  function updateField<K extends keyof BrandVaultForm>(key: K, value: BrandVaultForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/brand-vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.error || "Unable to save Brand Vault.");
      }
      const data = (await res.json()) as { brandVault?: { updatedAt?: string } };
      setSavedAt(data.brandVault?.updatedAt ?? new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save Brand Vault.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="main brand-vault-page">
      <header className="brand-vault-hero">
        <div>
          <p className="eyebrow">Brand Vault</p>
          <h1>Teach ZWIRK how your brand talks.</h1>
          <p className="muted-text">
            Save your voice, audience, and constraints once. Every plan and response will follow this DNA.
          </p>
        </div>
        <div className="brand-vault-actions">
          <Link href="/dashboard">
            <Button type="button" variant="secondary">Back to Dashboard</Button>
          </Link>
          <Button type="button" onClick={handleSave} disabled={saving || loading}>
            {saving ? "Saving..." : "Save Brand Vault"}
          </Button>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="brand-vault-grid">
        <div className="vault-field">
          <Label htmlFor="brand-name">Brand name</Label>
          <Input
            id="brand-name"
            value={form.brandName}
            onChange={(e) => updateField("brandName", e.target.value)}
            placeholder="Zooptrack"
            disabled={loading}
          />
        </div>
        <div className="vault-field">
          <Label htmlFor="website-url">Website URL</Label>
          <Input
            id="website-url"
            value={form.websiteUrl}
            onChange={(e) => updateField("websiteUrl", e.target.value)}
            placeholder="https://yourstore.com"
            disabled={loading}
          />
        </div>
        <div className="vault-field">
          <Label htmlFor="tone">Tone (3 adjectives)</Label>
          <Input
            id="tone"
            value={form.tone}
            onChange={(e) => updateField("tone", e.target.value)}
            placeholder="Bold, premium, direct"
            disabled={loading}
          />
        </div>
        <div className="vault-field">
          <Label htmlFor="audience">Target audience</Label>
          <Textarea
            id="audience"
            value={form.audience}
            onChange={(e) => updateField("audience", e.target.value)}
            placeholder="Who buys this? What do they care about?"
            rows={4}
            disabled={loading}
          />
        </div>
        <div className="vault-field">
          <Label htmlFor="do-not-say">Do-not-say list</Label>
          <Textarea
            id="do-not-say"
            value={form.doNotSay}
            onChange={(e) => updateField("doNotSay", e.target.value)}
            placeholder="Words or claims we never use"
            rows={3}
            disabled={loading}
          />
        </div>
        <div className="vault-field">
          <Label htmlFor="hero-product">Hero product</Label>
          <Input
            id="hero-product"
            value={form.heroProduct}
            onChange={(e) => updateField("heroProduct", e.target.value)}
            placeholder="Best seller or flagship offer"
            disabled={loading}
          />
        </div>
        <div className="vault-field">
          <Label htmlFor="main-objection">Main objection</Label>
          <Textarea
            id="main-objection"
            value={form.mainObjection}
            onChange={(e) => updateField("mainObjection", e.target.value)}
            placeholder="Why people hesitate to buy"
            rows={3}
            disabled={loading}
          />
        </div>
        <div className="vault-field">
          <Label htmlFor="competitor-focus">Competitor focus</Label>
          <Textarea
            id="competitor-focus"
            value={form.competitorFocus}
            onChange={(e) => updateField("competitorFocus", e.target.value)}
            placeholder="List your top 2-3 competitors or what they keep testing."
            rows={3}
            disabled={loading}
          />
        </div>
      </section>

      <footer className="brand-vault-footer">
        <p className="muted-text">
          {savedAt ? `Last saved: ${new Date(savedAt).toLocaleString()}` : "Not saved yet."}
        </p>
        <Button type="button" onClick={handleSave} disabled={saving || loading}>
          {saving ? "Saving..." : "Save Brand Vault"}
        </Button>
      </footer>
    </main>
  );
}

