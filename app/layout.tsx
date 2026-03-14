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
          <div className="site-footer-inner">
            <div className="footer-brand">
              <p className="eyebrow">Zooptrack</p>
              <h3>Growth intelligence for D2C operators.</h3>
              <p className="muted-text">Track unit economics, plan scale, and run AI-guided actions in one workspace.</p>
            </div>
            <div className="footer-columns">
              <div className="footer-column">
                <p className="footer-title">Product</p>
                <ul className="footer-list">
                  <li><a href="/dashboard">Dashboard</a></li>
                  <li><a href="/brand-vault">Brand Vault</a></li>
                  <li><a href="/zwirk">ZWIRK Assistant</a></li>
                </ul>
              </div>
              <div className="footer-column">
                <p className="footer-title">Company</p>
                <ul className="footer-list">
                  <li><a href="/contact">Contact</a></li>
                  <li><a href="/faq">FAQ</a></li>
                  <li><a href="/sitemap">Sitemap</a></li>
                </ul>
              </div>
              <div className="footer-column">
                <p className="footer-title">Legal</p>
                <ul className="footer-list">
                  <li><a href="/privacy">Privacy</a></li>
                  <li><a href="/terms">Terms</a></li>
                  <li><a href="/cookies">Cookies</a></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="site-footer-bottom">
            <p>Copyright (c) 2026 Zooptrack. All rights reserved.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
