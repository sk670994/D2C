export function KpiCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="card">
      <div className="muted">{title}</div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}
