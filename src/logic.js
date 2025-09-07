// Core validation and mock generation (no third-party deps)

export function validateSuggestRequest(body = {}) {
  const errors = [];
  const out = {};

  const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
  const isISODate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

  // destination
  if (!isNonEmptyString(body.destination)) errors.push({ field: 'destination', message: 'destination is required' });
  else out.destination = String(body.destination).trim();

  // dates
  const start = body.start ?? body?.dates?.start;
  const end = body.end ?? body?.dates?.end;
  if (!isISODate(start)) errors.push({ field: 'dates.start', message: 'start must be YYYY-MM-DD' });
  if (!isISODate(end)) errors.push({ field: 'dates.end', message: 'end must be YYYY-MM-DD' });
  if (isISODate(start) && isISODate(end)) {
    const s = new Date(start);
    const e = new Date(end);
    if (e < s) errors.push({ field: 'dates', message: 'end must be on/after start' });
  }
  out.dates = { start, end };

  // travelers
  const travelers = Number(body.travelers);
  if (!Number.isInteger(travelers) || travelers < 1) errors.push({ field: 'travelers', message: 'travelers must be an integer >= 1' });
  else out.travelers = travelers;

  // budgetUSD
  const budgetUSD = Number(body.budgetUSD);
  if (!Number.isFinite(budgetUSD) || budgetUSD <= 0) errors.push({ field: 'budgetUSD', message: 'budgetUSD must be a number > 0' });
  else out.budgetUSD = budgetUSD;

  return { valid: errors.length === 0, errors, value: out };
}

export function mockPlan({ destination, dates, travelers, budgetUSD }) {
  return {
    destination,
    dates,
    travelers,
    budgetUSD,
    plan: {
      summary: `A short, budget-aware plan for ${destination} (${dates.start}→${dates.end}) for ${travelers}.`,
      hotelIdeas: [
        { name: 'Central Stay', area: 'Downtown', estPricePerNightUSD: Math.round(budgetUSD / 10) },
        { name: 'Cozy Corner', area: 'Old Town', estPricePerNightUSD: Math.round(budgetUSD / 12) },
        { name: 'Transit Hub Inn', area: 'Near Station', estPricePerNightUSD: Math.round(budgetUSD / 14) }
      ],
      flightNotes: 'Look for morning departures; consider one-stop options to save.',
      mustDo: ['City highlights', 'Local market', 'Neighborhood food tour']
    }
  };
}

