import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

process.env.NODE_ENV = 'test';
process.env.MOCK_OPENAI = '1';

const { app } = await import('../src/server.ts');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const METRICS_FILE = path.join(ROOT, 'logs', 'metrics.csv');

beforeEach(async () => {
  try { await fs.rm(METRICS_FILE, { force: true }); } catch {}
});

describe('Metrics logging', () => {
  it('appends a CSV row for a suggestion', async () => {
    const res = await request(app)
      .post('/suggest')
      .send({ destination: 'Test City', start: '2025-10-01', end: '2025-10-02', travelers: 2, budgetUSD: 100 })
      .set('Content-Type','application/json');
    expect(res.status).toBe(200);

    const csv = await fs.readFile(METRICS_FILE, 'utf8');
    const lines = csv.trim().split(/\r?\n/);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[0]).toContain('timestamp,latency_ms');
  });
});
