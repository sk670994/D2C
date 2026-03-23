"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ParsedReport } from "@/lib/types/domain";
import { applyConnectorPayload, SAMPLE_CONNECTOR_PAYLOADS, type ConnectorPayload } from "@/lib/import/connectors";

type DataConnectorPanelProps = {
  currentInput: ParsedReport;
  onApply: (nextInput: ParsedReport) => void;
  onToast?: (text: string, tone?: "good" | "warn" | "neutral") => void;
};

export default function DataConnectorPanel({ currentInput, onApply, onToast }: DataConnectorPanelProps) {
  const [payloadText, setPayloadText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleApply = () => {
    setError(null);
    setLoading(true);
    try {
      const parsed = payloadText.trim() ? JSON.parse(payloadText) : {};
      const payload = parsed as ConnectorPayload;
      const nextInput = applyConnectorPayload(payload, currentInput);
      onApply(nextInput);
      setLoading(false);
      onToast?.("Connector payload applied", "good");
      return;
    } catch (err) {
      setError("Invalid JSON payload. Please paste a valid connector export.");
    } finally {
      setLoading(false);
    }
  };

  const loadSample = (key: keyof typeof SAMPLE_CONNECTOR_PAYLOADS) => {
    const sample = SAMPLE_CONNECTOR_PAYLOADS[key];
    setPayloadText(JSON.stringify(sample, null, 2));
    setError(null);
  };

  return (
    <div className="data-connector-panel">
      <div className="data-connector-header">
        <p className="muted-text">
          Paste JSON from your Shopify export or ad platform to auto-fill unit economics and ad metrics. Use `shopify` for product-level costing
          and `ads`/`meta`/`google` for spend + engagement.
        </p>
        <div className="data-connector-samples">
          <Button type="button" variant="secondary" onClick={() => loadSample("shopify")}>
            Shopify sample
          </Button>
          <Button type="button" variant="secondary" onClick={() => loadSample("ads")}>
            Ad spend sample
          </Button>
          <Button type="button" variant="secondary" onClick={() => loadSample("combined")}>
            Combined sample
          </Button>
        </div>
      </div>
      <Label className="input-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
        <span>Connector payload (JSON)</span>
        <Textarea
          value={payloadText}
          onChange={(event) => setPayloadText(event.target.value)}
          placeholder='{"shopify": {...}, "ads": {...}}'
          rows={12}
        />
      </Label>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="action-row" style={{ marginTop: 10 }}>
        <Button type="button" onClick={handleApply} disabled={loading}>
          {loading ? "Applying..." : "Apply connector payload"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setPayloadText("")}>
          Clear
        </Button>
      </div>
    </div>
  );
}
