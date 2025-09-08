export type SuggestRequest = {
  destination: string;
  start?: string; // legacy flat fields supported
  end?: string;
  dates?: { start?: string; end?: string };
  travelers: number;
  budgetUSD: number;
  preferences?: { comfort?: number; cost?: number; speed?: number };
};

export type PlanCore = {
  destination: string;
  dates: { start: string; end: string };
  travelers: number;
  budgetUSD: number;
  preferences: { comfort: number; cost: number; speed: number };
};

export type SuggestPlan = PlanCore & {
  reasoning: string;
  plan: {
    summary: string;
    hotelIdeas: { name: string; area: string; estPricePerNightUSD: number }[];
    flightNotes: string;
    mustDo: string[];
  };
};

export function validateSuggestRequest(body: Partial<SuggestRequest> = {}): {
  valid: boolean;
  errors: { field: string; message: string }[];
  value: Omit<SuggestRequest, 'start' | 'end' | 'dates' | 'preferences'> & {
    dates: { start: string; end: string };
    preferences: { comfort: number; cost: number; speed: number };
  } | null;
} {
  const errors: { field: string; message: string }[] = [];
  const out: any = {};

  const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
  const isISODate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

  if (!isNonEmptyString(body.destination)) errors.push({ field: 'destination', message: 'destination is required' });
  else out.destination = String(body.destination).trim();

  const start = body.start ?? body.dates?.start;
  const end = body.end ?? body.dates?.end;
  if (!isISODate(start)) errors.push({ field: 'dates.start', message: 'start must be YYYY-MM-DD' });
  if (!isISODate(end)) errors.push({ field: 'dates.end', message: 'end must be YYYY-MM-DD' });
  if (isISODate(start) && isISODate(end)) {
    const s = new Date(start);
    const e = new Date(end);
    if (e < s) errors.push({ field: 'dates', message: 'end must be on/after start' });
  }
  out.dates = { start, end };

  const travelers = Number(body.travelers);
  if (!Number.isInteger(travelers) || travelers < 1) errors.push({ field: 'travelers', message: 'travelers must be an integer >= 1' });
  else out.travelers = travelers;

  const budgetUSD = Number(body.budgetUSD);
  if (!Number.isFinite(budgetUSD) || budgetUSD <= 0) errors.push({ field: 'budgetUSD', message: 'budgetUSD must be a number > 0' });
  else out.budgetUSD = budgetUSD;

  const defaultPrefs = { comfort: 0.33, cost: 0.33, speed: 0.34 };
  const prefsIn = body.preferences || {};
  const parsePref = (name: keyof typeof defaultPrefs) => {
    const raw = (prefsIn as any)[name];
    if (raw === undefined) return defaultPrefs[name];
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0 || num > 1) {
      errors.push({ field: `preferences.${name}`, message: `${name} must be between 0 and 1` });
      return defaultPrefs[name];
    }
    return num;
  };
  out.preferences = {
    comfort: parsePref('comfort'),
    cost: parsePref('cost'),
    speed: parsePref('speed')
  };

  return { valid: errors.length === 0, errors, value: errors.length ? null : out };
}

export function mockPlan({ destination, dates, travelers, budgetUSD, preferences }: PlanCore): PlanCore & {
  plan: {
    summary: string;
    hotelIdeas: { name: string; area: string; estPricePerNightUSD: number }[];
    flightNotes: string;
    mustDo: string[];
  };
} {
  const main = ((): 'comfort' | 'cost' | 'speed' => {
    const { comfort, cost, speed } = preferences;
    if (cost >= comfort && cost >= speed) return 'cost';
    if (comfort >= cost && comfort >= speed) return 'comfort';
    return 'speed';
  })();

  const hotelDivisors =
    main === 'comfort' ? [8, 10, 12] : main === 'cost' ? [12, 14, 16] : [10, 12, 14];

  const flightNotes =
    main === 'speed'
      ? 'Aim for direct flights or minimal layovers to save time.'
      : main === 'comfort'
      ? 'Consider premium seating or lay-flat options for comfort.'
      : 'Consider budget airlines and flexible dates to save money.';

  return {
    destination,
    dates,
    travelers,
    budgetUSD,
    preferences,
    plan: {
      summary: `A ${main}-focused plan for ${destination} (${dates.start}→${dates.end}) for ${travelers}.`,
      hotelIdeas: [
        { name: 'Central Stay', area: 'Downtown', estPricePerNightUSD: Math.round(budgetUSD / hotelDivisors[0]) },
        { name: 'Cozy Corner', area: 'Old Town', estPricePerNightUSD: Math.round(budgetUSD / hotelDivisors[1]) },
        { name: 'Transit Hub Inn', area: 'Near Station', estPricePerNightUSD: Math.round(budgetUSD / hotelDivisors[2]) }
      ],
      flightNotes,
      mustDo: ['City highlights', 'Local market', 'Neighborhood food tour']
    }
  };
}

export function estimateCost(destination: string, travelers: number, days: number) {
  const dest = destination.toLowerCase();
  let base = 100;
  if (/paris|london|new york/.test(dest)) base = 200;
  else if (/bangkok|thailand|vietnam/.test(dest)) base = 50;
  const total = base * Math.max(days, 1) * Math.max(travelers, 1);
  return { minUSD: Math.round(total * 0.8), maxUSD: Math.round(total * 1.2) };
}

