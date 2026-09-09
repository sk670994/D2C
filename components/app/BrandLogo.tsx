import Image from "next/image";
import Link from "next/link";

export function BrandLogo({ href = "/dashboard" }: { href?: string }) {
  return (
    <Link href={href} className="zt-brand" aria-label="Zooptrack home">
      <Image
        src="/zooptrack-logo.png"
        alt="Zooptrack"
        width={176}
        height={48}
        className="zt-brand-logo-image"
        priority
      />
    </Link>
  );
}