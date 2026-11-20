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

import { MONUMENTS } from './monuments';
import { monumentHtml } from '../map/CityMap';

describe('fichas de monumentos', () => {
  it('cada monumento tiene texto, visita e id único', () => {
    expect(MONUMENTS.length).toBeGreaterThan(40);
    expect(new Set(MONUMENTS.map((m) => m.id)).size).toBe(MONUMENTS.length);
    for (const m of MONUMENTS) {
      expect(m.info.text.length, m.name).toBeGreaterThan(20);
      expect(m.info.text.length, m.name).toBeLessThan(160);
      expect(m.tours.length).toBeGreaterThan(0);
    }
  });

  it('los monumentos repetidos se unen y enlazan a todas sus visitas', () => {
    const reloj = MONUMENTS.find((m) => m.name === 'Edificio del Reloj')!;
    expect(reloj.tours.map((t) => t.id)).toEqual(expect.arrayContaining(['modernista', 'maritima']));
    const html = monumentHtml(reloj);
    expect(html).toContain('data-tour="maritima"');
    expect(html).toContain('google.com/maps/dir');
  });
});

describe('horarios y precios', () => {
  it('los monumentos visitables muestran horario, precio y enlace oficial', () => {
    const visitable = MONUMENTS.filter((m) => m.info.visit);
    expect(visitable.map((m) => m.name)).toEqual(expect.arrayContaining(['Lonja de la Seda', 'Catedral y Miguelete', 'Refugio de Serranos', 'Torres de Serranos']));
    for (const m of visitable) expect(m.info.visit!.url).toMatch(/^https:\/\//);
    const html = monumentHtml(MONUMENTS.find((m) => m.name === 'Lonja de la Seda')!);
    expect(html).toContain('🎟 2 €');
    expect(html).toContain('confirmar en la web oficial');
  });
});
