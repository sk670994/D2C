"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function routeKey(pathname: string): string {
  return pathname.split("/")[1] || "home";
}

/** Keeps <html data-route> in sync on client-side navigation (fonts per page). */
export function RouteMark() {
  const pathname = usePathname();
  useEffect(() => {
    document.documentElement.dataset.route = routeKey(pathname ?? "/");
  }, [pathname]);
  return null;
}
