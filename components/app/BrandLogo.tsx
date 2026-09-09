import { Search } from "lucide-react";
import Link from "next/link";

export function BrandLogo({ href = "/dashboard" }: { href?: string }) {
  return (
    <Link href={href} className="zt-brand" aria-label="Zooptrack home">
      <span className="zt-brand-glyph" aria-hidden="true">
        Z
        <Search size={22} strokeWidth={3} />
      </span>
      <span>zooptrack</span>
    </Link>
  );
}