import { ZooptrackLogo } from "@/components/brand/ZooptrackLogo";

/** Header logo for app pages (login, ZWIRK, Profit OS, brand pages). */
export function BrandLogo({ href = "/" }: { href?: string }) {
  return <ZooptrackLogo href={href} height={32} priority />;
}
