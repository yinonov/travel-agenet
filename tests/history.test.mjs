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
const DATA_DIR = path.join(ROOT, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

async function resetHistory(){
  try { await fs.rm(HISTORY_FILE, { force: true }); } catch {}
}

beforeEach(async ()=>{ await resetHistory(); });

  describe('History persistence', () => {
    it('stores last 10 entries and exposes /history', async () => {
      const payload = (n)=>({ destination: `City ${n}`, start: '2025-10-01', end: '2025-10-02', travelers: 2, budgetUSD: 100+n });
      for (let i=0;i<12;i++) {
        const res = await request(app).post('/suggest').send(payload(i)).set('Content-Type','application/json');
        expect(res.status).toBe(200);
      }
      const h = await request(app).get('/history');
      expect(h.status).toBe(200);
      expect(Array.isArray(h.body)).toBe(true);
      expect(h.body.length).toBe(10);
      // last entry should be the most recent one pushed
      expect(h.body[9]?.request?.destination).toBe('City 11');
    });

    it('only logs after missing fields are supplied', async () => {
      const base = { destination: 'City', start: '2025-10-01', travelers: 1, budgetUSD: 500 };
      let res = await request(app).post('/suggest').send(base).set('Content-Type','application/json');
      expect(res.status).toBe(400);
      expect(res.body?.details?.some?.(d=>d.field==='dates.end')).toBe(true);
      let h = await request(app).get('/history');
      expect(h.body.length).toBe(0);
      res = await request(app).post('/suggest').send({ ...base, end: '2025-10-05' }).set('Content-Type','application/json');
      expect(res.status).toBe(200);
      h = await request(app).get('/history');
      expect(h.body.length).toBe(1);
      expect(h.body[0]?.request?.destination).toBe('City');
    });
  });
