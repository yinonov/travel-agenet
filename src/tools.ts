export type Preference = { comfort: number; cost: number; speed: number };

export type FlightOption = {
  from: string;
  to: string;
  airline: string;
  priceUSD: number;
};

export type FlightResult = {
  notes: string;
  options: FlightOption[];
};

export type HotelOption = {
  name: string;
  area: string;
  estPricePerNightUSD: number;
};

export function mainPreference(prefs: Preference): 'comfort' | 'cost' | 'speed' {
  const { comfort, cost, speed } = prefs;
  if (cost >= comfort && cost >= speed) return 'cost';
  if (comfort >= cost && comfort >= speed) return 'comfort';
  return 'speed';
}

export function flightSearch(destination: string, prefs: Preference): FlightResult {
  const main = mainPreference(prefs);
  const notes =
    main === 'speed'
      ? 'Aim for direct flights or minimal layovers to save time.'
      : main === 'comfort'
      ? 'Consider premium seating or lay-flat options for comfort.'
      : 'Consider budget airlines and flexible dates to save money.';
  const option: FlightOption = {
    from: 'Home City',
    to: destination,
    airline: main === 'comfort' ? 'ComfortAir' : main === 'speed' ? 'SpeedyAir' : 'BudgetAir',
    priceUSD: main === 'cost' ? 300 : main === 'speed' ? 500 : 700,
  };
  return { notes, options: [option] };
}

export function hotelLookup(destination: string, budgetUSD: number, prefs: Preference): HotelOption[] {
  const main = mainPreference(prefs);
  const divisors =
    main === 'comfort' ? [8, 10, 12] : main === 'cost' ? [12, 14, 16] : [10, 12, 14];
  return [
    { name: 'Central Stay', area: 'Downtown', estPricePerNightUSD: Math.round(budgetUSD / divisors[0]) },
    { name: 'Cozy Corner', area: 'Old Town', estPricePerNightUSD: Math.round(budgetUSD / divisors[1]) },
    { name: 'Transit Hub Inn', area: 'Near Station', estPricePerNightUSD: Math.round(budgetUSD / divisors[2]) },
  ];
}
