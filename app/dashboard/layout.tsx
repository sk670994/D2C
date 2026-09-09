import { ZwirkDock } from "@/components/zwirk/ZwirkDock";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <ZwirkDock />
    </>
  );
}