/**
 * Compact "Rival ads (decoded)" block for ZWIRK. Pure; unit tested in
 * rival-context.test.ts. The server loader is lib/zwirk/rivals-server.ts.
 */
import { normalizeDecoded, topPatterns, valueLabel, type Decoded } from "@/lib/decode/taxonomy";

/** About 1,500 tokens. */
export const RIVAL_CONTEXT_MAX_CHARS = 6000;

export type RivalWatch = { advertiser_id: string; advertiser_name: string | null };
export type RivalDecode = { creative_id: string; advertiser_id: string | null; elements: unknown; decoded_at: string | null };
export type RivalCreative = {
  id: string;
  headline: string | null;
  creative_type: string | null;
  first_seen_at: string | null;
  is_currently_active: boolean | null;
};

const squash = (v: unknown, max: number) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

function adLine(name: string, d: Decoded, creative: RivalCreative | undefined, now: number): string {
  const bits: string[] = [name];
  if (creative?.creative_type) bits.push(squash(creative.creative_type, 20).toLowerCase());
  const first = creative?.first_seen_at ? Date.parse(creative.first_seen_at) : NaN;
  if (Number.isFinite(first)) {
    const days = Math.max(0, Math.floor((now - first) / 86_400_000));
    bits.push(`running ${days}d${creative?.is_currently_active === false ? " (stopped)" : ""}`);
  }
  if (d.hookType) bits.push(`hook: ${valueLabel(d.hookType)}`);
  if (d.angle) bits.push(`angle: ${valueLabel(d.angle)}`);
  if (d.persona) bits.push(`for: ${valueLabel(d.persona)}`);
  if (d.visualStyle) bits.push(`visual: ${valueLabel(d.visualStyle)}`);
  if (d.language) bits.push(`lang: ${valueLabel(d.language)}`);
  if (d.emotion) bits.push(`emotion: ${valueLabel(d.emotion)}`);
  if (d.offerPresent !== null) bits.push(d.offerPresent ? "has offer" : "no offer");
  if (d.productFocus) bits.push(`product: ${squash(d.productFocus, 60)}`);
  let line = `- ${bits.join(" · ")}`;
  if (d.summary) line += ` — ${squash(d.summary, 180)}`;
  if (creative?.headline) line += ` | headline: "${squash(creative.headline, 90)}"`;
  return line;
}

/** Returns "" when there is nothing useful to say. */
export function buildRivalContext(
  watch: RivalWatch[],
  decodes: RivalDecode[],
  creatives: Map<string, RivalCreative>,
  now: number = Date.now(),
  maxChars: number = RIVAL_CONTEXT_MAX_CHARS,
): string {
  if (!watch.length) return "";
  const names = new Map(watch.map((w) => [w.advertiser_id, squash(w.advertiser_name, 40) || `Page ${w.advertiser_id}`]));
  const header = `Watched rivals: ${Array.from(names.values()).join(", ")}`;
  if (!decodes.length) return header;

  const parsed = decodes.map((row) => ({ row, d: normalizeDecoded(row.elements) }));
  const lines: string[] = [header];
  const patterns = topPatterns(parsed.map((p) => p.d), 1);
  if (patterns.length) {
    lines.push(`Most common across ${parsed.length} recent decoded ads: ${patterns.map((p) => `${p.key === "hookType" ? "hook" : p.key} ${p.label} (${p.share}%)`).join(", ")}`);
  }
  lines.push("Recent ads:");

  let size = lines.join("\n").length;
  for (const { row, d } of parsed) {
    const name = names.get(String(row.advertiser_id ?? "")) ?? "Rival";
    const line = adLine(name, d, creatives.get(String(row.creative_id)), now);
    if (size + line.length + 1 > maxChars) break;
    lines.push(line);
    size += line.length + 1;
  }
  return lines.join("\n").slice(0, maxChars);
}
