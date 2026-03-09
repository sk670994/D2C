import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "D2C Growth Intelligence Command Center",
  description: "High-performance D2C command center with dynamic cards, live economics, and AI insight loops"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
