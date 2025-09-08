import { describe, it, expect } from 'vitest';
import request from 'supertest';

// Ensure server runs in test mode and uses mock openai
process.env.NODE_ENV = 'test';
process.env.MOCK_OPENAI = '1';

const { app } = await import('../src/server.ts');

describe('POST /suggest', () => {
  it('returns a structured plan for valid input (happy path)', async () => {
    const res = await request(app)
      .post('/suggest')
      .send({ destination: 'Bangkok, Thailand', start: '2025-10-01', end: '2025-10-06', travelers: 2, budgetUSD: 1800 })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.destination).toBeTruthy();
    expect(res.body.plan.summary).toBeTruthy();
    expect(Array.isArray(res.body.plan.hotelIdeas)).toBe(true);
  });

  it('returns 400 for invalid dates', async () => {
    const res = await request(app)
      .post('/suggest')
      .send({ destination: 'Paris', start: '2025-05-10', end: '2025-05-01', travelers: 1, budgetUSD: 500 })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('returns 400 for missing destination and invalid numbers', async () => {
    const res = await request(app)
      .post('/suggest')
      .send({ start: '2025-05-10', end: '2025-05-11', travelers: 0, budgetUSD: -1 })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});
