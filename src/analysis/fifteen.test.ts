import { describe, expect, it } from 'vitest';
import { ESSENTIALS, NearestIndex, analyzeFifteen, inRing, meters, walkMinutes, type Essential, type Place } from './fifteen';

const at = (dxM: number, dyM: number): [number, number] => [-0.376 + dxM / 85_960, 39.47 + dyM / 111_130];

describe('ciudad de los 15 minutos', () => {
  it('15 minutos a pie son unos 920 m en línea recta', () => {
    expect(walkMinutes(923)).toBeCloseTo(15, 0);
    expect(meters(at(0, 0), at(300, 400))).toBeCloseTo(500, -1);
  });

  it('el índice encuentra el más cercano igual que la fuerza bruta', () => {
    const pts: Place[] = Array.from({ length: 300 }, (_, i) => ({ name: `p${i}`, at: at(((i * 7919) % 6000) - 3000, ((i * 104729) % 6000) - 3000) }));
    const idx = new NearestIndex(pts);
    for (let k = 0; k < 40; k++) {
      const q = at(((k * 1237) % 5000) - 2500, ((k * 2971) % 5000) - 2500);
      const brute = pts.reduce((b, p) => (meters(q, p.at) < meters(q, b.at) ? p : b));
      expect(idx.nearest(q)!.place).toBe(brute);
    }
  });

  it('agrega por barrio ponderando por población', () => {
    const near = (name: string) => ({ name, at: at(100, 0) });
    const places = Object.fromEntries(ESSENTIALS.map((e) => [e.id, [near(e.id)]])) as Record<Essential, Place[]>;
    places.green = [{ name: 'parque lejano', at: at(3000, 0) }];
    const r = analyzeFifteen([
      { id: 'a', at: at(0, 0), pop: 300, barrio: 'Centro' },
      { id: 'b', at: at(2900, 0), pop: 100, barrio: 'Centro' },
    ], places);
    const c = r.barrios.get('Centro')!;
    expect(c.pop).toBe(400);
    // la manzana b tiene el parque cerca pero el resto lejos; la a tiene todo menos el parque
    expect(c.full).toBe(0);
    expect(c.byEssential.health).toBe(75);
    expect(c.byEssential.green).toBe(25);
    expect(c.weakest).toBe('green');
    expect(r.city.avgScore).toBeCloseTo((6 * 300 + 1 * 100) / 400);
  });

  it('punto en polígono', () => {
    const sq: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
    expect(inRing([0.5, 0.5], sq)).toBe(true);
    expect(inRing([1.5, 0.5], sq)).toBe(false);
  });
});

import { utm30ToLngLat } from './fifteenData';
import { meters as dist } from './fifteen';

describe('coordenadas UTM del Geoportal', () => {
  it('convierte ETRS89 UTM 30N a longitud/latitud', () => {
    // manzana 17561 (Benimàmet): su contorno va de -0.4193 a -0.4227 y de 39.5009 a 39.5019
    const p = utm30ToLngLat(721738.63, 4375632.76);
    expect(dist(p, [-0.421, 39.5014])).toBeLessThan(250);
  });
});
