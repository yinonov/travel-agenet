# 🧭 Travel Agent PoC

Single-node app that serves a tiny UI and a `/suggest` endpoint using OpenAI **Structured Outputs** (JSON Schema).

## Quickstart
```bash
cd travel-poc
cp .env.example .env
# edit .env and put your OpenAI key
npm run dev
# open http://localhost:8787
```

## Smoke Tests
Runs a lightweight script with a mocked model response so it works offline.
```bash
# Optional: no external installs needed
MOCK_OPENAI=1 npm test
```

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
