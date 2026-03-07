# D2C Marketing SaaS Tool

Input-first calculator (no Excel upload required).

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and start with the calculator dashboard.

## Product Flow

1. Fill input cells (blue) in the dashboard.
2. Click `Apply Changes`.
3. Review all computed sections:
   - Unit Economics
   - Ad Metrics
   - Agency Fee Calc
   - Scale Planner
   - Monthly P&L
4. Click `Generate AI Insights` for LLM recommendations.

## Ollama LLM Insights

1. Run Ollama locally (default endpoint: `http://127.0.0.1:11434`).
2. Pull a model (example): `ollama pull llama3:latest`.
3. Copy `.env.example` to `.env.local` and adjust values if needed.

If Ollama is unavailable, the app falls back to local rule-based insights.
