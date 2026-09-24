/* eslint-disable @next/next/no-img-element */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

// Link preview for WhatsApp, LinkedIn, X and Slack. Built once at deploy time.
export const alt = "Zooptrack — see every Indian D2C brand's Meta ads";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const logo = await readFile(join(process.cwd(), "public/zooptrack-logo.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "#f7f4ee",
          color: "#1d2a2e",
        }}
      >
        <img src={logoSrc} alt="" width={330} height={180} style={{ objectFit: "contain", marginLeft: -24, marginTop: -40 }} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>See every D2C brand&apos;s ads.</div>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, color: "#0255b1" }}>Know what to do next.</div>
          <div style={{ marginTop: 26, fontSize: 28, color: "#5f6b6e" }}>
            Live Facebook &amp; Instagram ads of Indian D2C brands — new launches, long-runners, hooks and offers.
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 24, color: "#5f6b6e" }}>
          <span>zooptrack.co.in</span>
          <span style={{ padding: "10px 22px", borderRadius: 999, background: "#0255b1", color: "#fff", fontWeight: 700 }}>Try AdSpy free</span>
        </div>
      </div>
    ),
    size,
  );
}
