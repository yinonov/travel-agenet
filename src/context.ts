import { Request } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HISTORY_FILE = process.env.HISTORY_FILE || path.join(__dirname, '..', 'data', 'history.json');
const DATA_DIR = path.dirname(HISTORY_FILE);

export function inferGeolocation(req: Request): string | null {
  return (req.headers['x-geo'] as string) || null;
}

export function inferLanguage(req: Request): string | null {
  const lang = req.headers['accept-language'];
  if (typeof lang !== 'string') return null;
  return lang.split(',')[0] || null;
}

export async function readPastQueries(): Promise<any[]> {
  try {
    const raw = await fs.readFile(HISTORY_FILE, 'utf8');
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return arr.map((e: any) => e.request || e);
    }
  } catch {}
  return [];
}

export function inferDeviceHints(req: Request): string | null {
  return (req.headers['user-agent'] as string) || null;
}

export async function collectContext(req: Request) {
  const geo = inferGeolocation(req);
  const language = inferLanguage(req);
  const device = inferDeviceHints(req);
  const pastQueries = await readPastQueries();
  const last = pastQueries[pastQueries.length - 1] || {};
  const defaults = {
    destination: last.destination,
    start: last.dates?.start,
    end: last.dates?.end,
    travelers: last.travelers,
    budgetUSD: last.budgetUSD,
  };
  return { geo, language, device, pastQueries, defaults };
}

export type RequestContext = Awaited<ReturnType<typeof collectContext>>;

