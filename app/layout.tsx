import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "D2C Marketing Dashboard",
  description: "Upload Excel and get a clear D2C dashboard with insights"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
