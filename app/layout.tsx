import "./globals.css";
import type { Metadata } from "next";
import { ZwirkDock } from "@/components/zwirk/ZwirkDock";

export const metadata: Metadata = {
  title: "Zooptrack — Know what makes money, what the market is doing, and what to do next",
  description: "Profit-aware growth intelligence for Indian D2C brands. True contribution after COD, returns and fees, competitor creatives, and a decision copilot that tells you what to do next."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body>
        {children}
        <ZwirkDock />
        <footer className="site-footer-global">
          <div className="site-footer-inner">
            <div className="footer-brand">
              <p className="eyebrow">Zooptrack</p>
              <h3>Profit-aware growth intelligence for Indian D2C.</h3>
              <p className="muted-text">Know what makes money. Know what the market is doing. Know what to do next.</p>
            </div>
            <div className="footer-columns">
              <div className="footer-column">
                <p className="footer-title">Product</p>
                <ul className="footer-list">
                  <li><a href="/dashboard">Command Center</a></li>
                  <li><a href="/adspy">Market intelligence</a></li>
                  <li><a href="/login">Get Started</a></li>
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
