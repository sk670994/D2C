import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { MetricTile } from "@/components/dashboard/DashboardPrimitives";
import type { MetricItem, MetricTone } from "@/components/dashboard/DashboardPrimitives";

export function DashboardSectionBlock({
  title,
  status,
  tone,
  inputLabel,
  metrics,
  children,
  applying,
  onApply,
  onSave
}: {
  title: string;
  status: string;
  tone: MetricTone;
  inputLabel: string;
  metrics: MetricItem[];
  children: React.ReactNode;
  applying: boolean;
  onApply: () => void;
  onSave: () => void;
}) {
  return (
    <motion.section className={`surface section-surface section-block tone-${tone}`} variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}>
      <div className="section-head section-head-rich">
        <h3>{title}</h3>
        <span className={`status-dot status-${tone}`}>{status}</span>
      </div>
      <div className="section-block-grid">
        <article className="input-cluster">
          <h4>{inputLabel}</h4>
          {children}
          <div className="section-actions">
            <Button type="button" onClick={onApply} disabled={applying}>
              {applying ? "Applying..." : `Apply ${title} Changes`}
            </Button>
            <Button type="button" variant="secondary" onClick={onSave}>
              Save Sheet
            </Button>
          </div>
        </article>
        <article className="output-cluster">
          <h4>Section Output</h4>
          <div className="metrics-grid metrics-grid-tight">
            {metrics.map((item) => (
              <MetricTile key={`${title}-${item.title}`} item={item} />
            ))}
          </div>
        </article>
      </div>
    </motion.section>
  );
}
