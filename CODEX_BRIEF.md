# Codex Build Brief — Travel Agent PoC

## Goal
Extend a minimal Travel Agent PoC into a small, testable MVP while keeping scope tight.

## Important Constraints
- **Keep stack:** Node 20+, Express, single server serving `/suggest` and `/public/index.html`.
- **LLM calls:** Use OpenAI **Responses API** with `response_format: { type: "json_schema", strict: true }`.
- **No secrets in repo.** Use `.env` for keys. Never expose keys in frontend.
- **Small PRs.** Work in increments and update docs as you go.

## Acceptance Criteria (per PR)
- Unit/integration tests (where relevant) pass locally.
- README + ROADMAP updated when scope changes.
- API returns STRICT JSON matching the schema.

## Tasks (Now → Next → Later)
### NOW
1. **Validation & Errors**
   - Add request validation for `destination`, `dates.start`, `dates.end`, `travelers`, `budgetUSD`.
   - Return 400 with error details for invalid inputs.
   - Surface user-facing error states in the UI.

2. **UX Polish**
   - Loading and error states, retry button, and copy-to-clipboard for the JSON payload.
   - Add a tiny inline “disclaimer: no bookings” note.

3. **Smoke Tests**
   - Add API smoke tests (e.g., supertest) for happy-path and malformed inputs.
   - Add an npm script `npm test`. (Jest or Vitest — your choice.)

4. **Docs**
   - Update `README.md` with screenshots and exact quickstart commands.
   - Ensure `ROADMAP.md` is referenced from README.

### NEXT
5. **History Persistence**
   - Persist last 10 queries server-side (`data/history.json`).
   - Add an endpoint `/history` (GET) to fetch last 10; simple UI list under the results.

6. **Deploy Preview**
   - Add Dockerfile and Render/Heroku config instructions.
   - Ensure all configs use env vars (no secrets checked in).

7. **Observability (basic)**
   - Log latency and token usage to `logs/metrics.csv` (timestamp, latency_ms, input_tokens, output_tokens).

### LATER
8. **One Real Datasource**
   - Integrate **ONE** flight/hotel sandbox provider server-side.
   - Map 2–3 useful fields into the existing schema without breaking clients.

9. **Tool Functions (pre-MCP)**
   - Refactor to expose `flightSearch`/`hotelLookup` as internal functions with typed responses.

10. **Hardening**
   - Add rate limiting (per IP), input length guards, and schema strictness checks.

## Roadmap Task
- **Always keep `ROADMAP.md` up to date**: when you finish a task or reshape scope, update the “Now/Next/Later” checklists and Decision Log.

## How to Start
1. Read `README.md` and run locally.
2. Open issues for each NOW task, create small PRs, and keep commits focused.
3. When tests pass locally, update docs and mark the task done in `ROADMAP.md`.

---

### Definition of Done (MVP)
- Users can: enter trip info → receive a structured plan → view history → deploy preview available.
- Developers can: run tests, view metrics, and extend schema safely.
