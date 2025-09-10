import { describe, it, expect } from 'vitest';

const { flightSearch, hotelLookup, mainPreference } = await import('../src/tools.ts');

describe('tools', () => {
  it('determines main preference', () => {
    expect(mainPreference({ comfort: 0.2, cost: 0.5, speed: 0.3 })).toBe('cost');
  });

  it('returns hotel options', () => {
    const hotels = hotelLookup('Paris', 1200, { comfort: 0.6, cost: 0.2, speed: 0.2 });
    expect(hotels.length).toBe(3);
    expect(hotels[0]).toHaveProperty('name');
  });

  it('returns flight notes', () => {
    const result = flightSearch('Tokyo', { comfort: 0.1, cost: 0.1, speed: 0.8 });
    expect(typeof result.notes).toBe('string');
    expect(result.options[0].to).toBe('Tokyo');
  });
});
