import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Zooptrack Growth Intelligence Command Center",
  description: "Zooptrack is a high-performance command center with dynamic cards, live economics, and AI insight loops"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body>
        {children}
        <footer className="site-footer-global">
          <div>
            <p className="eyebrow">Zooptrack</p>
            <p className="muted-text">Operational clarity for growth teams.</p>
          </div>
          <div className="footer-links">
            <a href="/sitemap">Sitemap</a>
            <a href="/faq">FAQ</a>
            <a href="/contact">Contact Us</a>
            <a href="/cookies">Cookie Policies</a>
          </div>
          <p className="footer-copy">Copyright © 2026. All rights reserved.</p>
        </footer>
      </body>
    </html>
  );
}
