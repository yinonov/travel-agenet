import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history-context.json');

process.env.HISTORY_FILE = HISTORY_FILE;
process.env.NODE_ENV = 'test';
process.env.MOCK_OPENAI = '1';

const { defaultTravelers, defaultBudgetUSD, readPastQueries } = await import('../src/context.ts');
const { app } = await import('../src/server.ts');

async function resetHistory() {
  try { await fs.rm(HISTORY_FILE, { force: true }); } catch {}
}

beforeEach(async () => { await resetHistory(); });

describe('Context defaults', () => {
  it('uses last travelers and budget when omitted', async () => {
    const payload = { destination: 'City A', start: '2025-10-01', end: '2025-10-02', travelers: 3, budgetUSD: 500 };
    const res1 = await request(app).post('/suggest').send(payload).set('Content-Type', 'application/json');
    expect(res1.status).toBe(200);

    const res2 = await request(app).post('/suggest')
      .send({ destination: 'City B', start: '2025-11-01', end: '2025-11-02' })
      .set('Content-Type', 'application/json');
    expect(res2.status).toBe(200);
    expect(res2.body.travelers).toBe(3);
    expect(res2.body.budgetUSD).toBe(500);
  });

  it('defaults destination from last query', async () => {
    const first = { destination: 'Tokyo', start: '2025-12-01', end: '2025-12-05', travelers: 1, budgetUSD: 800 };
    const res1 = await request(app).post('/suggest').send(first).set('Content-Type', 'application/json');
    expect(res1.status).toBe(200);

    const res2 = await request(app).post('/suggest')
      .send({ start: '2025-12-10', end: '2025-12-12', travelers: 2, budgetUSD: 600 })
      .set('Content-Type', 'application/json');
    expect(res2.status).toBe(200);
    expect(res2.body.destination).toBe('Tokyo');
  });
});

describe('default helpers', () => {
  it('derive travelers and budget from last history entry', async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const entry = { destination: 'X', dates: { start: '2025-01-01', end: '2025-01-02' }, travelers: 4, budgetUSD: 1500 };
    await fs.writeFile(HISTORY_FILE, JSON.stringify([entry]));
    const past = await readPastQueries();
    expect(defaultTravelers(past, null)).toBe(4);
    expect(defaultBudgetUSD(past, null)).toBe(1500);
  });
});

describe('UI markup', () => {
  it('only uses range inputs for budgetUSD, travelers, and lengthDays', async () => {
    const html = await fs.readFile(path.join(ROOT, 'public/index.html'), 'utf8');
    const matches = [...html.matchAll(/<input[^>]*type="range"[^>]*>/g)];
    const allowed = ['pgTravelers', 'pgDays', 'travelers', 'budgetUSD'];
    const found = matches.map(m => {
      const id = m[0].match(/id="([^"]+)"/);
      const name = m[0].match(/name="([^"]+)"/);
      return id?.[1] || name?.[1];
    });
    expect(found.sort()).toEqual(allowed.sort());
  });
});

