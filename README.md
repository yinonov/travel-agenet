# 🧭 Travel Agent PoC

Single-node app that serves a tiny UI and a `/suggest` endpoint using OpenAI **Structured Outputs** (JSON Schema).

## Quickstart

```bash
cd travel-poc
cp .env.example .env
# edit .env and put your OpenAI key
npm install
npm run dev
# open http://localhost:8787
```

## Tests

- Unit/integration (Vitest + Supertest):

```bash
npm test
```

- Optional smoke script (offline):

```bash
npm run smoke
```

## Deploy on Render

Use Render Web Service with auto‑deploy on merges to `main`:

1) In Render, click New → Blueprint and select this repo. Render will detect `render.yaml`.
2) Confirm the service; set Environment Variable `OPENAI_API_KEY` (required). Leave `MOCK_OPENAI` unset.
3) Ensure branch is `main` and Auto Deploy is enabled (render.yaml sets this).
4) First deploy builds with `npm ci && npm run build` and runs `npm start`. Render sets `PORT` automatically.

Merging to `main` will trigger an auto‑deploy. Render gives a public URL to share.

## Environment

- `OPENAI_API_KEY`: required for real API calls.
- `PORT`: optional, defaults to `8787`.
- `MOCK_OPENAI=1`: bypasses OpenAI calls and returns deterministic JSON (used by tests).

## Roadmap

See `ROADMAP.md` for current status and decisions.

## Notes

- Prefers `Responses API` with `response_format: { type: "json_schema", strict: true }`.
- Falls back to `chat.completions` with `response_format: { type: "json_object" }` if needed.
- No external flight/hotel APIs yet; this is just a structured planning stub.

## History

- The server persists the last 10 successful `/suggest` queries to `data/history.json` and serves them via `GET /history`. The UI shows a simple list under the results.

## Metrics

- Basic observability writes `logs/metrics.csv` with columns:
  `timestamp,latency_ms,input_tokens,output_tokens,total_tokens,model,ok,error`.
  Token fields are populated when available from the OpenAI API.
