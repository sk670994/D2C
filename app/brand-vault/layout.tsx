import "@/components/today/today.css";

import { ZwirkDock } from "@/components/zwirk/ZwirkDock";

export default function BrandVaultLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ZwirkDock />
    </>
  );
}
