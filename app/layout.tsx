import "./globals.css";
import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import { pageFontVars } from "./page-fonts";
import { RouteMark } from "./RouteMark";

// Sets the page's type voice before first paint (see html[data-route] in globals.css).
const routeScript = `document.documentElement.dataset.route=location.pathname.split("/")[1]||"home"`;

const uiFont = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--zt-font", display: "swap" });

const SITE_TITLE = "Zooptrack — See every D2C brand's ads. Know what to do next.";
const SITE_DESCRIPTION =
  "Search any Indian D2C brand's live Facebook and Instagram ads. Spot new launches and long-running winners, compare competitors, and get clear next steps.";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.zooptrack.co.in"),
  title: { default: SITE_TITLE, template: "%s | Zooptrack" },
  description: SITE_DESCRIPTION,
  applicationName: "Zooptrack",
  keywords: ["Meta ad library India", "competitor ads", "Facebook ads spy tool", "Instagram ads", "D2C brands India", "ad intelligence", "AdSpy"],
  openGraph: {
    type: "website",
    siteName: "Zooptrack",
    locale: "en_IN",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" className={`${uiFont.variable} ${pageFontVars}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: routeScript }} />
      </head>
      <body>
        <RouteMark />
        {children}
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
