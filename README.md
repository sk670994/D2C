# D2C Marketing App

No-DB v1 starter.

## Run

```bash
npm install
npm run dev
```

## Ollama LLM Insights

1. Run Ollama locally (default endpoint: `http://127.0.0.1:11434`).
2. Pull a model (example): `ollama pull llama3.1:8b`.
3. Copy `.env.example` to `.env.local` and adjust values if needed.

If Ollama is unavailable, the app falls back to local rule-based insights.

Open `http://localhost:3000`.
