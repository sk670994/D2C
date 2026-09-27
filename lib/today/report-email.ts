/**
 * The Monday rival report as email-safe HTML (tables + inline styles, no
 * external CSS). Pure; the same content as the Today page.
 */
import type { Move } from "./insights";

export type ReportInput = {
  headline: string;
  moves: Move[];
  rivals: Array<{ pageId: string; name: string; new7: number; total: number }>;
  appUrl: string;
  dateLabel: string;
};

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const KIND_COLOR: Record<Move["kind"], string> = { big: "#8A3A0B", staying: "#0B5C37", quiet: "#1D3F8F", steady: "#3A3E49" };

export function reportSubject(input: Pick<ReportInput, "moves" | "headline">): string {
  const top = input.moves[0];
  if (!top) return "Your Monday rival report";
  const rest = input.moves.length - 1;
  return `${top.brand}: ${top.title.replace(/\.$/, "")}${rest > 0 ? ` (and ${rest} more ${rest === 1 ? "move" : "moves"})` : ""}`;
}

export function renderReportEmail(input: ReportInput): string {
  const app = input.appUrl.replace(/\/+$/, "");
  const maxNew = Math.max(1, ...input.rivals.map((r) => r.new7));
  const moves = input.moves
    .map(
      (m, i) => `
<tr><td style="padding:24px 32px;border-bottom:1px solid #ECE8DF;">
<div style="font:600 12px/1.4 'IBM Plex Mono',Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:${KIND_COLOR[m.kind]};">0${i + 1} · ${escapeHtml(m.label)} · ${escapeHtml(m.brand)}</div>
<div style="margin:8px 0 6px;font:400 22px/1.25 Georgia,'Times New Roman',serif;color:#15171C;">${escapeHtml(m.title)}</div>
<div style="font:400 15px/1.6 Arial,Helvetica,sans-serif;color:#3A3E49;">${escapeHtml(m.detail)}</div>
<div style="margin-top:8px;font:400 15px/1.6 Arial,Helvetica,sans-serif;color:#15171C;"><strong>What to do:</strong> ${escapeHtml(m.action)}</div>
<div style="margin-top:10px;"><a href="${escapeHtml(`${app}/today/brand/${m.pageId}`)}" style="font:600 15px Arial,Helvetica,sans-serif;color:#1D44B8;text-decoration:none;">See the evidence →</a></div>
</td></tr>`,
    )
    .join("");
  const bars = input.rivals
    .slice(0, 6)
    .map(
      (r) => `
<tr><td style="padding:4px 0;font:400 14px Arial,Helvetica,sans-serif;color:#15171C;width:140px;">${escapeHtml(r.name)}</td>
<td style="padding:4px 12px;"><div style="height:8px;border-radius:8px;background:#ECE8DF;"><div style="height:8px;border-radius:8px;background:#1D44B8;width:${Math.round((r.new7 / maxNew) * 100)}%;"></div></div></td>
<td style="padding:4px 0;font:400 13px Menlo,monospace;color:#15171C;text-align:right;width:40px;">${r.new7}</td></tr>`,
    )
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(reportSubject(input))}</title></head>
<body style="margin:0;padding:24px 0;background:#E9E6DE;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:14px;overflow:hidden;">
<tr><td style="padding:28px 32px;background:#15171C;color:#F4F2EC;">
<div style="font:600 20px Georgia,serif;">Zooptrack <span style="float:right;font:400 12px Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:#C9C6BD;">${escapeHtml(input.dateLabel)}</span></div>
<div style="margin-top:14px;font:400 30px/1.15 Georgia,'Times New Roman',serif;">${escapeHtml(input.headline)}</div>
<div style="margin-top:8px;font:400 15px/1.5 Arial,Helvetica,sans-serif;color:#C9C6BD;">${input.moves.length} ${input.moves.length === 1 ? "move" : "moves"} from your rivals this week.</div>
</td></tr>
${moves || `<tr><td style="padding:24px 32px;font:400 15px Arial,sans-serif;color:#3A3E49;">No rival moves yet. Add rivals in Zooptrack to start your report.</td></tr>`}
${bars ? `<tr><td style="padding:24px 32px;"><div style="font:600 12px Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:#5B6070;margin-bottom:8px;">New ads last 7 days</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${bars}</table></td></tr>` : ""}
<tr><td style="padding:8px 32px 32px;"><a href="${escapeHtml(`${app}/today`)}" style="display:inline-block;padding:14px 22px;border-radius:10px;background:#1D44B8;color:#FFFFFF;font:600 15px Arial,Helvetica,sans-serif;text-decoration:none;">Open this week in Zooptrack</a></td></tr>
</table>
<div style="max-width:600px;padding:14px 8px;font:400 12px/1.6 Arial,sans-serif;color:#5B6070;">Counts come from Zooptrack's read of the public Meta Ad Library. Spend and reach are not published by Meta, so they are never estimated. <a href="${escapeHtml(`${app}/today`)}" style="color:#1D44B8;">Change what you get</a></div>
</td></tr></table></body></html>`;
}
