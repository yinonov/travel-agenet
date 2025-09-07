import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { validateSuggestRequest, mockPlan } from './src/logic.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Serve static UI
app.use(express.static(path.join(__dirname, 'public')));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

// validation + mock moved to src/logic.js to enable offline tests

// API: /suggest
app.post('/suggest', async (req, res) => {
  try {
    const { valid, errors, value } = validateSuggestRequest(req.body || {});
    if (!valid) return res.status(400).json({ error: 'Invalid request', details: errors });

    const { destination, dates: { start, end }, travelers, budgetUSD } = value;

    // Mock mode for local tests or offline development
    if (process.env.MOCK_OPENAI === '1') {
      return res.json(mockPlan({ destination, dates: { start, end }, travelers, budgetUSD }));
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
    res.json(data);
  } catch (err) {
    // If Responses API fails (older regions/SDK), fallback to chat.completions JSON
    if (!res.headersSent) {
      try {
        const fallback = await client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a practical travel-planning assistant. Be concise, realistic, no bookings." },
            { role: "user", content: "Return STRICT JSON only. Keys: destination, dates{start,end}, travelers, budgetUSD, plan{summary,hotelIdeas[{name,area,estPricePerNightUSD}],flightNotes,mustDo[]}. " }
          ],
          response_format: { type: "json_object" }
        });
        const data = JSON.parse(fallback.choices[0].message.content);
        return res.json(data);
      } catch (e2) {
        console.error('Fallback error:', e2);
      }
    }
    console.error(err);
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
