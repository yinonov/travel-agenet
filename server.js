import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import fs from 'fs/promises';
import { validateSuggestRequest, mockPlan } from './src/logic.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Serve static UI
app.use(express.static(path.join(__dirname, 'public')));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Metrics: latency and token usage (CSV file)
const LOGS_DIR = path.join(__dirname, 'logs');
const METRICS_FILE = path.join(LOGS_DIR, 'metrics.csv');

async function logMetrics({ latencyMs, usage, model, ok = true, error = '' }) {
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
function extractJson(res) {
  try {
    // Responses API (preferred)
    if (res?.output && Array.isArray(res.output)) {
      // Find first content text
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
    // Some SDKs also provide output_text
    if (typeof res?.output_text === 'string') {
      return JSON.parse(res.output_text);
    }
    // Fallback: chat.completions format
    const choice = res?.choices?.[0]?.message?.content;
    if (typeof choice === 'string') {
      return JSON.parse(choice);
    }
  } catch (e) {
    // fallthrough to error
  }
  throw new Error('Failed to extract JSON from model response.');
}

function extractUsage(res) {
  const u = res?.usage || res?.response?.usage;
  if (!u) return null;
  return {
    input_tokens: u.input_tokens ?? u.prompt_tokens ?? null,
    output_tokens: u.output_tokens ?? u.completion_tokens ?? null,
    total_tokens: u.total_tokens ?? null
  };
}

// validation + mock moved to src/logic.js to enable offline tests

// API: /suggest
app.post('/suggest', async (req, res) => {
  try {
    const started = Date.now();
    const { valid, errors, value } = validateSuggestRequest(req.body || {});
    if (!valid) return res.status(400).json({ error: 'Invalid request', details: errors });

    const { destination, dates: { start, end }, travelers, budgetUSD } = value;

    // Mock mode for local tests or offline development
    if (process.env.MOCK_OPENAI === '1') {
      const mocked = mockPlan({ destination, dates: { start, end }, travelers, budgetUSD });
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
        required: ['destination','dates','travelers','budgetUSD','plan']
      },
      strict: true
    };

    // Prefer Responses API with Structured Outputs
    const resp = await client.responses.create({
      model: "gpt-5-mini",
      input: [
        { role: "system", content: "You are a practical travel-planning assistant. Be concise, realistic, no bookings." },
        { role: "user", content: `Destination: ${destination}
Dates: ${start} to ${end}
Travelers: ${travelers}
BudgetUSD: ${budgetUSD}
Return a short plan following the JSON schema.` }
      ],
      response_format: { type: "json_schema", json_schema: schema }
    });

    const data = extractJson(resp);
    await logMetrics({ latencyMs: Date.now() - started, usage: extractUsage(resp), model: resp?.model || 'responses', ok: true });
    res.json(data);
  } catch (err) {
    // If Responses API fails (older regions/SDK), fallback to chat.completions JSON
    if (!res.headersSent) {
      try {
        const startedFallback = Date.now();
        const fallback = await client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a practical travel-planning assistant. Be concise, realistic, no bookings." },
            { role: "user", content: "Return STRICT JSON only. Keys: destination, dates{start,end}, travelers, budgetUSD, plan{summary,hotelIdeas[{name,area,estPricePerNightUSD}],flightNotes,mustDo[]}. " }
          ],
          response_format: { type: "json_object" }
        });
        const data = JSON.parse(fallback.choices[0].message.content);
        await logMetrics({ latencyMs: Date.now() - startedFallback, usage: fallback?.usage, model: fallback?.model || 'chat.completions', ok: true });
        return res.json(data);
      } catch (e2) {
        console.error('Fallback error:', e2);
      }
    }
    console.error(err);
    await logMetrics({ latencyMs: 0, usage: null, model: 'error', ok: false, error: String(err?.message || err) });
    res.status(400).json({ error: String(err?.message || err) });
  }
});

// Serve index.html by default
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const port = Number(process.env.PORT || 8787);
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`🧭 Travel PoC: http://localhost:${port}`);
  });
}

export { app };
