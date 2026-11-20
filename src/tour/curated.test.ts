import { describe, expect, it } from 'vitest';
import { CURATED_TOURS } from './curated';
import { parseTour } from './tours';
import { buildTimeline } from './camera';

describe('visitas guiadas temáticas', () => {
  it('tienen ids únicos', () => {
    const ids = CURATED_TOURS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(CURATED_TOURS.map((t) => [t.title, t] as const))('%s es un guion válido dentro de València', (_title, tour) => {
    expect(parseTour(JSON.parse(JSON.stringify(tour))).stops.length).toBe(tour.stops.length);
    expect(tour.stops.length).toBeGreaterThanOrEqual(5);
    for (const s of tour.stops) {
      const [lng, lat] = s.center;
      expect(lng).toBeGreaterThan(-0.45);
      expect(lng).toBeLessThan(-0.28);
      expect(lat).toBeGreaterThan(39.28);
      expect(lat).toBeLessThan(39.57);
    }
    expect(buildTimeline(tour).duration).toBeGreaterThan(10);
  });
});
