import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type MetricTone = "good" | "warn" | "neutral";

export type MetricItem = {
  title: string;
  value: string;
  hint: string;
  tone: MetricTone;
  benchmark?: string;
};

export function MetricTile({ item }: { item: MetricItem }) {
  return (
    <article className={`metric-tile tone-${item.tone}`}>
      <div className="metric-top">
        <p className="metric-title">{item.title}</p>
        {item.benchmark ? (
          <span className="hint-wrap" tabIndex={0}>
            i
            <span className="hint-bubble">{item.benchmark}</span>
          </span>
        ) : null}
      </div>
      <p className="metric-value">{item.value}</p>
      <p className="metric-hint">{item.hint}</p>
    </article>
  );
}

export function InsightList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <article className="fix-card">
      <p className="metric-title" style={{ marginBottom: 8 }}>{title}</p>
      <ul className="insight-list">
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  step = "1"
}: {
  label: string;
  value: number;
  onChange: (value: string) => void;
  step?: string;
}) {
  return (
    <Label className="input-row">
      <span>{label}</span>
      <Input type="number" step={step} value={value} onChange={(event) => onChange(event.target.value)} />
    </Label>
  );
}
