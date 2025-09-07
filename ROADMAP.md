# 🧭 Travel Agent PoC — Roadmap

**Vision:** A tiny, interactive AI travel assistant that collects destination + dates and returns a concise, structured plan. Start simple, add real data sources incrementally.

## Now (Week 0–1)

- [x] Wire `/suggest` to OpenAI Responses API with **Structured Outputs (JSON Schema)** (already stubbed).
- [x] Minimal UI: form → structured results + raw JSON panel (refined UX/error states, copy JSON, retry).
- [x] Input validation + graceful errors (400 with details).
- [x] README quickstart + test instructions.
- [x] Smoke tests: happy-path + malformed input (mock mode, no network).

## Next (Week 2–3)

- [x] Persist last 10 queries (local JSON; later Firebase). `/history` endpoint + UI list.
- [x] Deploy preview (Render) + env management; server-only API key.
- [x] Add loading states, retry, copy-to-clipboard.
- [x] Token/latency logging (simple console/CSV).

## Later (Week 4–6)

- [ ] Add one real datasource (Duffel/Skyscanner/Amadeus sandbox) server-side.
- [ ] Expose `flightSearch`, `hotelLookup` as server functions (pre-MCP).
- [ ] Rate limits + schema hardening.
- [ ] Metrics dashboard page.

## Stretch

- [ ] MCP server wrapping tools for broader client compatibility.
- [ ] Multi-language (HE/EN), ILS/USD budgets.
- [ ] Saved itineraries + share links.

## Definition of Done (PoC)

- Running locally via `npm run dev` with `.env`.
- Clean JSON responses matching schema.
- Basic tests pass.
- README + ROADMAP up to date.

## Decision Log

- 2025‑09‑07: Chose OpenAI Responses API + JSON Schema; no external data for MVP.
- 2025‑09‑07: Added server-side validation and error JSON (400 with details); introduced `MOCK_OPENAI=1` for offline smoke tests; refined UI with loading, retry, and copy-to-clipboard.
- 2025‑09‑07: Added formal tests (Vitest + Supertest) and updated npm scripts; retained optional offline smoke script.
- 2025‑09‑07: Chose Render Web Service for deployment; added `render.yaml` blueprint with auto‑deploy on merges to `main`.
- 2025‑09‑07: Enabled Render PR previews in `render.yaml` and added a "Deploy to Render" button in README for easy sharing.
- 2025‑09‑07: Added metrics logging (CSV) with latency and token usage.
