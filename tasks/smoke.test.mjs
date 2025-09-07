import { spawn } from 'node:child_process';
import process from 'node:process';

const PORT = process.env.TEST_PORT || '8788';

function wait(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function tryFetch(url, options){
  try { const r = await fetch(url, options); return r; } catch { return null; }
}

async function waitForServer(url, tries=30){
  for (let i=0;i<tries;i++) {
    const r = await tryFetch(url);
    if (r) return true;
    await wait(200);
  }
  return false;
}

function assert(cond, msg){ if(!cond) throw new Error(msg); }

async function run(){
  console.log('Starting server in MOCK mode on port', PORT);
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT, MOCK_OPENAI: '1' },
    stdio: ['ignore','pipe','pipe']
  });
  let out='';
  child.stdout.on('data', d=>{ out+=d.toString(); });
  child.stderr.on('data', d=>{ out+=d.toString(); });

  const base = `http://localhost:${PORT}`;
  const up = await waitForServer(base);
  if (!up) {
    child.kill('SIGKILL');
    throw new Error('Server did not start');
  }

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

  // Malformed: missing destination
  try {
    const resp = await post('/suggest', { start: '2025-05-10', end: '2025-05-11', travelers: 0, budgetUSD: -1 });
    assert(!resp.ok && resp.status === 400, 'Expected 400 for invalid body');
    const j = await resp.json();
    assert(j?.error, 'Expected error message');
    console.log('✓ Malformed body');
  } catch (e) { console.error('✗ Malformed body failed:', e.message); failures++; }

  child.kill('SIGTERM');
  if (failures) {
    console.error(`Smoke tests failed: ${failures}`);
    process.exit(1);
  } else {
    console.log('All smoke tests passed');
  }
}

run().catch(e=>{ console.error('Test run error:', e); process.exit(1); });

