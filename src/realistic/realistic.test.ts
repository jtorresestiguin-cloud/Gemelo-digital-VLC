import { describe, expect, it } from 'vitest';
import { ShapeUtils, Vector2 } from 'three';
import { classMid, fromLocal, lngLatToTile, madridLocalToDate, sunPosition, sunTimes, tileToLngLat, toLocal, treeFromRecord } from './geo';
import { buildBuildingArrays, signedArea } from './buildings';
import type { LngLat } from '../core/types';

const O: LngLat = [-0.3763, 39.4699];
const triangulate = (c: [number, number][], h: [number, number][][]) =>
  ShapeUtils.triangulateShape(c.map(([x, y]) => new Vector2(x, y)), h.map((r) => r.map(([x, y]) => new Vector2(x, y))));

describe('modo realista: geometría pura', () => {
  it('convierte a metros locales (x este, z sur) y vuelve', () => {
    const [x, z] = toLocal(O, [-0.3763, 39.4799]);
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(-1113.2, 0); // 0,01° al norte ≈ 1,1 km (z negativo = norte)
    const back = fromLocal(O, 500, -300);
    const [x2, z2] = toLocal(O, back);
    expect(x2).toBeCloseTo(500, 3);
    expect(z2).toBeCloseTo(-300, 3);
  });

  it('teselas web Mercator ida y vuelta', () => {
    const [tx, ty] = lngLatToTile(O, 16);
    const p = tileToLngLat(tx, ty, 16);
    expect(p[0]).toBeCloseTo(O[0], 6);
    expect(p[1]).toBeCloseTo(O[1], 6);
  });

  it('sol en València: alto a mediodía de verano, bajo en invierno, bajo el horizonte de noche', () => {
    const summer = sunPosition(new Date('2026-06-21T12:05:00Z'), O[1], O[0]);
    expect(summer.altitude).toBeGreaterThan(70);
    expect(summer.azimuth).toBeGreaterThan(150);
    expect(summer.azimuth).toBeLessThan(210);
    const winter = sunPosition(new Date('2026-12-21T12:05:00Z'), O[1], O[0]);
    expect(winter.altitude).toBeGreaterThan(22);
    expect(winter.altitude).toBeLessThan(31);
    expect(sunPosition(new Date('2026-06-21T23:00:00Z'), O[1], O[0]).altitude).toBeLessThan(0);
    const evening = sunPosition(new Date('2026-06-21T18:30:00Z'), O[1], O[0]);
    expect(evening.azimuth).toBeGreaterThan(270); // por el oeste-noroeste
  });

  it('interpreta el inventario de arbolado (clases de altura y copa, palmeras)', () => {
    expect(classMid('4/8', 0)).toBe(6);
    expect(classMid('<2.5', 0)).toBe(2.5);
    expect(classMid(null, 7)).toBe(7);
    expect(treeFromRecord({ nom_botanico: 'Washingtonia robusta', altura: '8/12' }, O)).toMatchObject({ kind: 'palm', height: 10 });
    expect(treeFromRecord({ nom_botanico: "Cupressus sempervirens 'Stricta'", grupo: 'Conifera' }, O).kind).toBe('conifer');
    expect(treeFromRecord({ nom_botanico: 'Falta', grupo: 'SD' }, O)).toMatchObject({ kind: 'broadleaf', height: 7 });
  });

  it('extruye un edificio con patio: muros hacia fuera y tejado hacia arriba', () => {
    const d = 0.0002; // ~17 m
    const sq = (s: number): LngLat[] => [[O[0] - s, O[1] - s], [O[0] + s, O[1] - s], [O[0] + s, O[1] + s], [O[0] - s, O[1] + s], [O[0] - s, O[1] - s]];
    const a = buildBuildingArrays(O, [{ rings: [sq(d), [...sq(d / 3)].reverse().reverse()], height: 21, minHeight: 0, seed: 3 }], triangulate);
    // 4 muros exteriores + 4 del patio, 6 vértices cada uno
    expect(a.wallPositions.length / 3).toBe(8 * 6);
    // el muro sur exterior (el de menor latitud) mira al sur (+z)
    let southFacing = 0, northFacing = 0;
    for (let i = 0; i < a.wallNormals.length; i += 3) {
      if (a.wallNormals[i + 2] > 0.9) southFacing++;
      if (a.wallNormals[i + 2] < -0.9) northFacing++;
    }
    expect(southFacing).toBe(12); // muro exterior sur + muro norte del patio (que mira al sur)
    expect(northFacing).toBe(12);
    // altura de los muros en la coordenada v
    expect(Math.max(...a.wallUvs.filter((_, i) => i % 2 === 1))).toBe(21);
    // el tejado tiene huecos: triángulos de anillo (8 vértices) y todos a 21 m
    expect(a.roofPositions.length / 3).toBe(8);
    expect(a.roofIndices.length % 3).toBe(0);
    for (let i = 1; i < a.roofPositions.length; i += 3) expect(a.roofPositions[i]).toBe(21);
    // normal del primer triángulo del tejado hacia arriba
    const p = (k: number) => [a.roofPositions[k * 3], a.roofPositions[k * 3 + 1], a.roofPositions[k * 3 + 2]];
    const [i0, i1, i2] = [a.roofIndices[0], a.roofIndices[1], a.roofIndices[2]];
    const [A, B, C] = [p(i0), p(i1), p(i2)];
    const ny = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]);
    expect(ny).toBeGreaterThan(0);
    expect(signedArea([[0, 0], [1, 0], [1, 1], [0, 1]])).toBeGreaterThan(0);
  });

  it('descarta construcciones sin altura', () => {
    const a = buildBuildingArrays(O, [{ rings: [[[0, 0], [0.0001, 0], [0.0001, 0.0001], [0, 0]]], height: 1, minHeight: 0, seed: 1 }], triangulate);
    expect(a.wallPositions.length).toBe(0);
  });

  it('amanecer y puesta de sol reales en València (hora local)', () => {
    const nov = sunTimes(new Date('2026-11-20T12:00:00Z'), O[1], O[0]);
    expect(nov.sunrise).toBeGreaterThan(7.6); expect(nov.sunrise).toBeLessThan(8.2);   // ~7:55
    expect(nov.sunset).toBeGreaterThan(17.4); expect(nov.sunset).toBeLessThan(17.9);   // ~17:40
    const jun = sunTimes(new Date('2026-06-21T12:00:00Z'), O[1], O[0]);
    expect(jun.sunrise).toBeGreaterThan(6.3); expect(jun.sunrise).toBeLessThan(6.8);   // ~6:35 (CEST)
    expect(jun.sunset).toBeGreaterThan(21.3); expect(jun.sunset).toBeLessThan(21.7);   // ~21:30
    expect(madridLocalToDate(new Date('2026-06-21T12:00:00Z'), 14).toISOString()).toBe('2026-06-21T12:00:00.000Z');
    expect(madridLocalToDate(new Date('2026-11-20T12:00:00Z'), 14).toISOString()).toBe('2026-11-20T13:00:00.000Z');
  });
});
