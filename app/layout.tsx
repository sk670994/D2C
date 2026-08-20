import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Zooptrack — Profitability OS for Indian D2C Brands",
  description: "Know your true profit after COD, returns, and shipping. Track campaign profitability and scale safely."
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
              <h3>Profitability OS for Indian D2C brands.</h3>
              <p className="muted-text">Know your true profit after COD, returns, shipping and fees. Scale safely.</p>
            </div>
            <div className="footer-columns">
              <div className="footer-column">
                <p className="footer-title">Product</p>
                <ul className="footer-list">
                  <li><a href="/dashboard">Dashboard</a></li>
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
