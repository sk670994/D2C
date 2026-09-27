import "server-only";

/**
 * One place to send email (Resend). Without RESEND_API_KEY + REPORT_FROM_EMAIL
 * it does nothing and says so, so every caller is safe before email is set up.
 */
export async function sendEmail(input: { to: string | string[]; subject: string; html: string; text?: string }): Promise<{ sent: boolean; skipped?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.REPORT_FROM_EMAIL?.trim();
  if (!apiKey || !from) return { sent: false, skipped: "RESEND_API_KEY / REPORT_FROM_EMAIL not set" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: Array.isArray(input.to) ? input.to : [input.to], subject: input.subject, html: input.html, text: input.text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) return { sent: true };
    return { sent: false, error: `Resend ${response.status}: ${(await response.text().catch(() => "")).slice(0, 200)}` };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
