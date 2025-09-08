import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import fs from 'fs/promises';
import { validateSuggestRequest, mockPlan, SuggestPlan, PlanCore, estimateCost } from './logic.js';
import { collectContext, readPastQueries } from './context.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Serve static UI
app.use(express.static(path.join(__dirname, '..', 'public')));

const client = process.env.MOCK_OPENAI === '1' ? null : new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Metrics: latency and token usage (CSV file)
const LOGS_DIR = path.join(__dirname, '..', 'logs');
const METRICS_FILE = path.join(LOGS_DIR, 'metrics.csv');

async function logMetrics({ latencyMs, usage, model, ok = true, error = '' }: { latencyMs: number; usage: any; model: string; ok?: boolean; error?: string }) {
  try {
    await fs.mkdir(LOGS_DIR, { recursive: true });
    let header = '';
    try { await fs.stat(METRICS_FILE); } catch { header = 'timestamp,latency_ms,input_tokens,output_tokens,total_tokens,model,ok,error\n'; }
    const input = usage?.input_tokens ?? usage?.prompt_tokens ?? '';
    const output = usage?.output_tokens ?? usage?.completion_tokens ?? '';
    const total = usage?.total_tokens ?? (Number(input||0) + Number(output||0) || '');
    const line = `${new Date().toISOString()},${latencyMs},${input},${output},${total},${model},${ok?1:0},${String(error).replaceAll('\n',' ').replaceAll(',',';')}\n`;
    await fs.appendFile(METRICS_FILE, header + line, 'utf8');
  } catch {}
}

// Helper: extract JSON from various SDK response shapes
function extractJson(res: any): SuggestPlan {
  try {
    if (res?.output && Array.isArray(res.output)) {
      for (const item of res.output) {
        const parts = item?.content || [];
        for (const p of parts) {
          if (p.type === 'output_text' && typeof p.text === 'string') {
            return JSON.parse(p.text);
          }
          if (p.type === 'text' && typeof p.text === 'string') {
            try { return JSON.parse(p.text); } catch {}
          }
        }
      }
    }
    if (typeof res?.output_text === 'string') {
      return JSON.parse(res.output_text);
    }
    const choice = res?.choices?.[0]?.message?.content;
    if (typeof choice === 'string') {
      return JSON.parse(choice);
    }
  } catch {}
  throw new Error('Failed to extract JSON from model response.');
}

function extractUsage(res: any) {
  const u = res?.usage || res?.response?.usage;
  if (!u) return null;
  return {
    input_tokens: u.input_tokens ?? u.prompt_tokens ?? null,
    output_tokens: u.output_tokens ?? u.completion_tokens ?? null,
    total_tokens: u.total_tokens ?? null
  };
}

function buildReasoning(
  prefs: { comfort: number; cost: number; speed: number },
  ctx: { geo?: string; language?: string; device?: string }
) {
  const { comfort, cost, speed } = prefs;
  const main = cost >= comfort && cost >= speed ? 'cost' : comfort >= speed ? 'comfort' : 'speed';
  return `Focused on ${main} given preferences (comfort ${comfort}, cost ${cost}, speed ${speed}) and context geo ${ctx.geo || 'unknown'}, language ${ctx.language || 'unknown'}, device ${ctx.device || 'unknown'}`;
}

// History persistence
const HISTORY_FILE = process.env.HISTORY_FILE || path.join(__dirname, '..', 'data', 'history.json');
const DATA_DIR = path.dirname(HISTORY_FILE);

async function persistHistory(entry: any) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    let arr: any[] = [];
    try {
      const raw = await fs.readFile(HISTORY_FILE, 'utf8');
      arr = JSON.parse(raw);
      if (!Array.isArray(arr)) arr = [];
    } catch {}
    arr.push(entry);
    if (arr.length > 10) arr = arr.slice(arr.length - 10);
    await fs.writeFile(HISTORY_FILE, JSON.stringify(arr, null, 2));
  } catch (e) {
    console.error('persistHistory error:', (e as Error)?.message || e);
  }
}

// Ambient suggestions scheduler
const scheduledSuggestions: SuggestPlan[] = [];

async function refreshSuggestions() {
  try {
    const past = await readPastQueries();
    const now = Date.now();
    const horizon = now + 30 * 86400000; // 30 days
    scheduledSuggestions.length = 0;
    for (const q of past) {
      const start = q?.dates?.start || q?.start;
      const end = q?.dates?.end || q?.end;
      if (!start || !end) continue;
      const s = new Date(start).getTime();
      if (isNaN(s) || s < now || s > horizon) continue;
      const plan = mockPlan({
        destination: q.destination,
        dates: { start, end },
        travelers: q.travelers,
        budgetUSD: q.budgetUSD,
        preferences: q.preferences || { comfort: 0.33, cost: 0.33, speed: 0.34 }
      } as PlanCore);
      scheduledSuggestions.push({ ...plan, reasoning: 'Scheduled suggestion' });
    }
  } catch {}
}

if (process.env.NODE_ENV !== 'test') {
  refreshSuggestions();
  setInterval(refreshSuggestions, 3600000);
}

app.post('/suggest', async (req: Request, res: Response) => {
  const started = Date.now();
  let merged: any = {};
  let contextMeta: any = {};
  let value: any = null;
  let reasoning = '';
  try {
    const ctx = await collectContext(req);
    merged = { ...ctx.defaults, ...(req.body || {}) };
    const validation = validateSuggestRequest(merged);
    value = validation.value;
    if (!validation.valid || !value) return res.status(400).json({ error: 'Invalid request', details: validation.errors });

    const { destination, dates: { start, end }, travelers, budgetUSD, preferences } = value;
    contextMeta = { geo: ctx.geo, language: ctx.language, device: ctx.device };
    reasoning = buildReasoning(preferences, contextMeta);

    if (process.env.MOCK_OPENAI === '1') {
      const base = mockPlan({ destination, dates: { start, end }, travelers, budgetUSD, preferences } as PlanCore);
      const mocked: SuggestPlan = { ...base, reasoning };
      const entry = { request: value, context: contextMeta, response: mocked, at: new Date().toISOString() };
      if (process.env.NODE_ENV === 'test') await persistHistory(entry); else persistHistory(entry).catch(()=>{});
      await logMetrics({ latencyMs: Date.now() - started, usage: null, model: 'mock', ok: true });
      return res.json(mocked);
    }

    const schema = {
      name: 'TravelSuggestion',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          destination: { type: 'string' },
          dates: {
            type: 'object',
            additionalProperties: false,
            properties: { start: { type: 'string' }, end: { type: 'string' } },
            required: ['start','end']
          },
          travelers: { type: 'integer' },
          budgetUSD: { type: 'integer' },
          preferences: {
            type: 'object',
            additionalProperties: false,
            properties: {
              comfort: { type: 'number' },
              cost: { type: 'number' },
              speed: { type: 'number' }
            },
            required: ['comfort','cost','speed']
          },
          plan: {
            type: 'object',
            additionalProperties: false,
            properties: {
              summary: { type: 'string' },
              hotelIdeas: {
                type: 'array',
                maxItems: 3,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string' },
                    area: { type: 'string' },
                    estPricePerNightUSD: { type: 'number' }
                  },
                  required: ['name','area','estPricePerNightUSD']
                }
              },
              flightNotes: { type: 'string' },
              mustDo: { type: 'array', maxItems: 5, items: { type: 'string' } }
            },
            required: ['summary','hotelIdeas','flightNotes','mustDo']
          }
        },
        required: ['destination','dates','travelers','budgetUSD','preferences','plan']
      },
      strict: true
    } as const;

    // Ensure OpenAI client is available in non-mock mode
    if (!client) throw new Error('OpenAI client not initialized');
    const oc = client;

    const resp = await oc.responses.create({
      model: 'gpt-5-mini',
      input: [
        { role: 'system', content: 'You are a practical travel-planning assistant. Be concise, realistic, no bookings.' },
        { role: 'user', content: `Destination: ${destination}\nDates: ${start} to ${end}\nTravelers: ${travelers}\nBudgetUSD: ${budgetUSD}\nPreferences: comfort ${preferences.comfort}, cost ${preferences.cost}, speed ${preferences.speed}\nReturn a short plan following the JSON schema.` }
      ],
      response_format: { type: 'json_schema', json_schema: schema as any }
    } as any);

    const data = extractJson(resp);
    const full: SuggestPlan = { ...data, reasoning };
    const entry = { request: value, context: contextMeta, response: full, at: new Date().toISOString() };
    if (process.env.NODE_ENV === 'test') await persistHistory(entry); else persistHistory(entry).catch(()=>{});
    await logMetrics({ latencyMs: Date.now() - started, usage: extractUsage(resp), model: resp?.model || 'responses', ok: true });
    res.json(full);
  } catch (err: any) {
    if (!res.headersSent) {
      try {
        const startedFallback = Date.now();
        if (!client) throw new Error('OpenAI client not initialized');
        const fallback = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are a practical travel-planning assistant. Be concise, realistic, no bookings.' },
            { role: 'user', content: 'Return STRICT JSON only. Keys: destination, dates{start,end}, travelers, budgetUSD, preferences{comfort,cost,speed}, plan{summary,hotelIdeas[{name,area,estPricePerNightUSD}],flightNotes,mustDo[]}. ' }
          ],
          response_format: { type: 'json_object' }
        } as any);
        const data = JSON.parse(fallback.choices[0].message.content || '{}');
        const full: SuggestPlan = { ...data, reasoning };
        const entry = { request: value || merged, context: contextMeta, response: full, at: new Date().toISOString() };
        if (process.env.NODE_ENV === 'test') await persistHistory(entry); else persistHistory(entry).catch(()=>{});
        await logMetrics({ latencyMs: Date.now() - startedFallback, usage: fallback?.usage, model: fallback?.model || 'chat.completions', ok: true });
        return res.json(full);
      } catch (e2) {
        console.error('Fallback error:', e2);
      }
    }
    console.error(err);
    await logMetrics({ latencyMs: 0, usage: null, model: 'error', ok: false, error: String(err?.message || err) });
    res.status(400).json({ error: String(err?.message || err) });
  }
});

app.get('/estimate', (req: Request, res: Response) => {
  const { destination = '', start, end, travelers } = req.query as Record<string, string>;
  const t = Number(travelers);
  const s = new Date(String(start));
  const e = new Date(String(end));
  if (!destination || !start || !end || !Number.isFinite(t) || t < 1 || isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) {
    return res.status(400).json({ error: 'Invalid query' });
  }
  const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  const range = estimateCost(String(destination), t, days);
  res.json(range);
});

app.get('/suggestions', (_req: Request, res: Response) => {
  res.json(scheduledSuggestions);
});

app.get('/history', async (_req: Request, res: Response) => {
  try {
    const raw = await fs.readFile(HISTORY_FILE, 'utf8');
    const arr = JSON.parse(raw);
    res.json(Array.isArray(arr) ? arr : []);
  } catch {
    res.json([]);
  }
});

// Serve index.html by default
app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const port = Number(process.env.PORT || 8787);
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`🧭 Travel PoC: http://localhost:${port}`);
  });
}

export { app, refreshSuggestions };
