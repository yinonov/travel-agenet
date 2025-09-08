import http from 'node:http';
import process from 'node:process';
// Use compiled logic in dist for TS builds
const { validateSuggestRequest, mockPlan } = await import('../dist/logic.js');

const PORT = Number(process.env.TEST_PORT || 8790);

function assert(cond, msg){ if(!cond) throw new Error(msg); }

function makeServer(){
  return http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/suggest') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const data = body ? JSON.parse(body) : {};
          const { valid, errors, value } = validateSuggestRequest(data);
          if (!valid) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid request', details: errors }));
            return;
          }
          const out = mockPlan({ destination: value.destination, dates: value.dates, travelers: value.travelers, budgetUSD: value.budgetUSD });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(out));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Bad JSON' }));
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });
}

async function run(){
  const server = makeServer();
  await new Promise(resolve => server.listen(PORT, resolve));
  const base = `http://localhost:${PORT}`;

  let failures = 0;
  const post = (path, body)=> fetch(base+path, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });

  // Happy path
  try {
    const resp = await post('/suggest', { destination: 'Bangkok, Thailand', start: '2025-10-01', end: '2025-10-06', travelers: 2, budgetUSD: 1800 });
    assert(resp.ok, 'Happy-path response not ok');
    const j = await resp.json();
    assert(j?.destination && j?.plan?.summary, 'Missing expected fields');
    console.log('✓ Happy path');
  } catch (e) { console.error('✗ Happy path failed:', e.message); failures++; }

  // Malformed: end before start
  try {
    const resp = await post('/suggest', { destination: 'Paris', start: '2025-05-10', end: '2025-05-01', travelers: 1, budgetUSD: 500 });
    assert(!resp.ok && resp.status === 400, 'Expected 400 for invalid dates');
    const j = await resp.json();
    assert(Array.isArray(j?.details) && j.details.length > 0, 'Expected error details');
    console.log('✓ Malformed dates');
  } catch (e) { console.error('✗ Malformed dates failed:', e.message); failures++; }

  // Malformed: missing destination and invalid numbers
  try {
    const resp = await post('/suggest', { start: '2025-05-10', end: '2025-05-11', travelers: 0, budgetUSD: -1 });
    assert(!resp.ok && resp.status === 400, 'Expected 400 for invalid body');
    const j = await resp.json();
    assert(j?.error, 'Expected error message');
    console.log('✓ Malformed body');
  } catch (e) { console.error('✗ Malformed body failed:', e.message); failures++; }

  server.close();
  if (failures) {
    console.error(`Smoke tests failed: ${failures}`);
    process.exit(1);
  } else {
    console.log('All smoke tests passed');
  }
}

run().catch(e=>{ console.error('Test run error:', e); process.exit(1); });
