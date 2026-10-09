import "./globals.css";
import "./zt-tokens.css";
import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";
import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import { pageFontVars } from "./page-fonts";
import { RouteMark } from "./RouteMark";
import { VersionWatcher } from "@/components/app/VersionWatcher";
import { JsonLd } from "@/components/seo/JsonLd";
import { organizationSchema, websiteSchema } from "@/lib/seo/schema";

// Sets the page's type voice before first paint (see html[data-route] in globals.css).
const routeScript = `document.documentElement.dataset.route=location.pathname.split("/")[1]||"home"`;

const uiFont = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--zt-font", display: "swap" });

// Kept short for Bing/Google: title under 60 characters, description 120-155.
const SITE_TITLE = "Zooptrack: Competitor Ad Tracker for Indian D2C Brands";
const SITE_DESCRIPTION =
  "Track live Facebook and Instagram ads of any Indian D2C brand. Spot new launches and winning ads, compare rivals and know what to do next.";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.zooptrack.co.in"),
  title: { default: SITE_TITLE, template: "%s | Zooptrack" },
  description: SITE_DESCRIPTION,
  applicationName: "Zooptrack",
  keywords: ["Meta ad library India", "competitor ads", "Facebook ads spy tool", "Instagram ads", "D2C brands India", "ad intelligence", "AdSpy"],
  alternates: { types: { "text/plain": "/llms.txt" } },
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
        <JsonLd graph={[organizationSchema(), websiteSchema()]} />
        <RouteMark />
        <VersionWatcher />
        {children}
        <footer className="site-footer-global">
          <div className="site-footer-inner">
            <div className="footer-brand">
              <ZooptrackLogo height={30} tone="blue" />
              <h3>Competitor ad intelligence for Indian D2C.</h3>
              <p className="muted-text">See what your rivals run. Know what changed. Know your next move.</p>
            </div>
            <div className="footer-columns">
              <div className="footer-column">
                <p className="footer-title">Product</p>
                <ul className="footer-list">
                  <li><a href="/today">Today</a></li>
                  <li><a href="/adspy">Discover ads</a></li>
                  <li><a href="/pricing">Pricing</a></li>
                  <li><a href="/login">Start free trial</a></li>
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
                  <li><a href="/refund-policy">Refunds</a></li>
                  <li><a href="/shipping-policy">Delivery</a></li>
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
