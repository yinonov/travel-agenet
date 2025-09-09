import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

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
    expect(typeof res.body.reasoning).toBe('string');
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

  it('validates preference weights', async () => {
    const res = await request(app)
      .post('/suggest')
      .send({ destination: 'Paris', start: '2025-05-01', end: '2025-05-05', travelers: 1, budgetUSD: 500, preferences: { comfort: -1, cost: 2, speed: 0 } })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('reflects preferences in the plan', async () => {
    const base = { destination: 'Paris', start: '2025-05-01', end: '2025-05-05', travelers: 2, budgetUSD: 1000 };
    const resCost = await request(app)
      .post('/suggest')
      .send({ ...base, preferences: { comfort: 0, cost: 1, speed: 0 } })
      .set('Content-Type', 'application/json');
    const resComfort = await request(app)
      .post('/suggest')
      .send({ ...base, preferences: { comfort: 1, cost: 0, speed: 0 } })
      .set('Content-Type', 'application/json');

    expect(resCost.status).toBe(200);
    expect(resComfort.status).toBe(200);
    expect(resCost.body.plan.summary.toLowerCase()).toContain('cost');
    expect(resComfort.body.plan.summary.toLowerCase()).toContain('comfort');
    expect(resCost.body.reasoning.toLowerCase()).toContain('cost');
    expect(resComfort.body.reasoning.toLowerCase()).toContain('comfort');
    const priceCost = resCost.body.plan.hotelIdeas[0].estPricePerNightUSD;
    const priceComfort = resComfort.body.plan.hotelIdeas[0].estPricePerNightUSD;
    expect(priceComfort).toBeGreaterThan(priceCost);
  });
});

describe('GET /estimate', () => {
  it('returns an estimated range with days', async () => {
    const res = await request(app)
      .get('/estimate')
      .query({ destination: 'Paris', days: 5, travelers: 2 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ minUSD: 1600, maxUSD: 2400 });
  });

  it('accepts lengthDays alias', async () => {
    const res = await request(app)
      .get('/estimate')
      .query({ destination: 'Paris', lengthDays: 5, travelers: 2 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ minUSD: 1600, maxUSD: 2400 });
  });
});

describe('slider interactions', () => {
  it('fetches estimates in playground as sliders move', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const html = await fs.readFile(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const script = html.match(/<script>([\s\S]*)<\/script>/i)[1];
    class Elem {
      constructor(){ this.value=''; this.textContent=''; this.hidden=false; this.disabled=false; this.listeners={}; }
      addEventListener(t, cb){ (this.listeners[t] ||= []).push(cb); }
      dispatchEvent(evt){ (this.listeners[evt.type]||[]).forEach(fn=>fn(evt)); }
    }
    const form = new Elem();
    const elements = {
      f: form,
      loading: new Elem(),
      submit: new Elem(),
      err: new Elem(),
      errmsg: new Elem(),
      retry: new Elem(),
      copy: new Elem(),
      copied: new Elem(),
      out: new Elem(),
      summary: new Elem(),
      reasoning: new Elem(),
      hotels: new Elem(),
      flight: new Elem(),
      todo: new Elem(),
      raw: new Elem(),
      hist: new Elem(),
      histlist: new Elem(),
      travelersOut: new Elem(),
      budgetOut: new Elem(),
      estimate: new Elem(),
      ambientToggle: new Elem(),
      ambient: new Elem(),
      ambientList: new Elem(),
      pg: new Elem(),
      pgDestination: new Elem(),
      pgTravelers: new Elem(),
      pgDays: new Elem(),
      pgTravelersOut: new Elem(),
      pgDaysOut: new Elem(),
      pgEstimate: new Elem(),
      refine: new Elem()
    };
    ['destination','start','end','travelers','budgetUSD'].forEach(n=>{ const el=new Elem(); form[n]=el; elements[n]=el; });
    global.document = {
      getElementById:id=>elements[id],
      querySelector:sel=>{ const m=sel.match(/input\[name="(.+)"\]/); return m?form[m[1]]:null; }
    };
    global.FormData = class { constructor(){ return { entries: ()=>[] }; } };
    global.navigator = { clipboard: { writeText: async()=>{} } };
    global.Event = class { constructor(type){ this.type=type; } };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ minUSD: 100, maxUSD: 200 }) });
    global.fetch = fetchMock;
    eval(script);
    elements.pgDestination.value = 'Bangkok';
    elements.pgDays.value = '3';
    elements.pgTravelers.value = '2';
    elements.pgDays.dispatchEvent(new Event('input'));
    await new Promise(r=>setTimeout(r,0));
    expect(fetchMock).toHaveBeenCalled();
    expect(elements.pgEstimate.textContent).toContain('$100');
    expect(elements.pgEstimate.textContent).toContain('$200');
  });
});
