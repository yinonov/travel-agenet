import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

process.env.NODE_ENV = 'test';
process.env.MOCK_OPENAI = '1';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
process.env.HISTORY_FILE = path.join(ROOT, 'data', 'history_suggestions.json');
const DATA_DIR = path.join(ROOT, 'data');
const HISTORY_FILE = process.env.HISTORY_FILE;

const { app, refreshSuggestions } = await import('../src/server.ts');

async function resetHistory(){
  try { await fs.rm(HISTORY_FILE, { force: true }); } catch {}
}

beforeEach(async ()=>{ await resetHistory(); });

describe('scheduled suggestions', () => {
  it('returns precomputed suggestions', async () => {
    const start = new Date(Date.now() + 5*86400000).toISOString().slice(0,10);
    const end = new Date(Date.now() + 8*86400000).toISOString().slice(0,10);
    const res = await request(app)
      .post('/suggest')
      .send({ destination: 'Rome', start, end, travelers: 2, budgetUSD: 1200 })
      .set('Content-Type','application/json');
    expect(res.status).toBe(200);
    await refreshSuggestions();
    const sug = await request(app).get('/suggestions');
    expect(sug.status).toBe(200);
    expect(Array.isArray(sug.body)).toBe(true);
    expect(sug.body.length).toBeGreaterThan(0);
    expect(sug.body[0].destination).toBe('Rome');
  });

  it('toggles ambient suggestions in UI', async () => {
    const html = await fs.readFile(path.join(ROOT, 'public', 'index.html'), 'utf8');
    const script = html.match(/<script>([\s\S]*)<\/script>/i)[1];
    class Elem {
      constructor(){ this.hidden=true; this.textContent=''; this.value=''; this.checked=false; this.innerHTML=''; this.disabled=false; this.listeners={}; }
      addEventListener(t,cb){ (this.listeners[t] ||= []).push(cb); }
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
      refine: new Elem(),
    };
    ['destination','start','end','travelers','budgetUSD'].forEach(n=>{ const el=new Elem(); form[n]=el; elements[n]=el; });
    global.document = {
      getElementById: id => elements[id],
      querySelector: sel => { const m=sel.match(/input\[name="(.+)"\]/); return m?form[m[1]]:null; }
    };
    global.FormData = class { constructor(){ return { entries: ()=>[] }; } };
    global.navigator = { clipboard: { writeText: async()=>{} } };
    global.Event = class { constructor(type){ this.type=type; } };
    const fetchMock = vi.fn().mockResolvedValue({ ok:true, json: async()=> ([{ destination:'Rome', plan:{ summary:'Trip'}}]) });
    global.fetch = fetchMock;
    eval(script);
    elements.ambientToggle.checked = true;
    elements.ambientToggle.dispatchEvent(new Event('change'));
    await new Promise(r=>setTimeout(r,0));
    expect(fetchMock).toHaveBeenCalled();
    expect(elements.ambient.hidden).toBe(false);
    expect(elements.ambientList.innerHTML).toContain('Rome');
  });
});

