"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();

  async function onSignOut() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      try {
        sessionStorage.removeItem("reportInput");
        sessionStorage.removeItem("report");
      } catch {
        // ignore storage errors
      }
      router.push("/login");
      router.refresh();
    } catch {
      try {
        sessionStorage.removeItem("reportInput");
        sessionStorage.removeItem("report");
      } catch {
        // ignore storage errors
      }
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <Button type="button" variant="secondary" onClick={onSignOut}>
      Sign Out
    </Button>
  );
}
