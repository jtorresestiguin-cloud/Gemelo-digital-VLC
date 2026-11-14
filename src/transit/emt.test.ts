import { describe, expect, it } from 'vitest';
import { BusTracker, bearing, parseBuses, parseStops, routeLayersByLine, type BusReading } from './emt';

const r = (line: string, trip: string, lng: number, lat: number, ts: number): BusReading => ({ line, trip, lngLat: [lng, lat], ts });
const T0 = Date.UTC(2026, 10, 14, 8, 0, 0);

describe('EMT: lectura de datos del Geoportal', () => {
  it('lee posiciones de autobuses', () => {
    const b = parseBuses({ type: 'FeatureCollection', features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.35, 39.48] }, properties: { linea: '12', trayecto: 'Pl. America - C.Art.Faller', fecha: T0 } },
      { type: 'Feature', geometry: null, properties: { linea: '67' } },
    ] });
    expect(b).toEqual([{ line: '12', trip: 'Pl. America - C.Art.Faller', lngLat: [-0.35, 39.48], ts: T0 }]);
  });

  it('lee paradas, separa las líneas y descarta las suprimidas', () => {
    const s = parseStops({ type: 'FeatureCollection', features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.364, 39.469] }, properties: { id_parada: 764, denominacion: "Plaça d'Amèrica (764)", lineas: '10,12, 23', suprimida: 0, proximas_llegadas: 'http://www.emtvalencia.es/QR.php?sec=est&p=764' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.36, 39.46] }, properties: { id_parada: 1, suprimida: 1 } },
    ] });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ id: '764', lines: ['10', '12', '23'], arrivalsUrl: 'https://www.emtvalencia.es/QR.php?sec=est&p=764' });
  });

  it('encuentra la subcapa «Ruta» de cada línea', () => {
    const layers = [
      { id: 1, name: 'Linea 4', parentLayerId: -1, subLayerIds: [2, 3, 4, 5] },
      { id: 2, name: 'Buses', parentLayerId: 1, subLayerIds: null },
      { id: 4, name: 'Ruta', parentLayerId: 1, subLayerIds: null },
      { id: 366, name: 'Linea C1', parentLayerId: -1, subLayerIds: [360, 362] },
      { id: 362, name: 'Ruta', parentLayerId: 366, subLayerIds: null },
      { id: 374, name: 'Línea C2', parentLayerId: -1, subLayerIds: [377] },
      { id: 377, name: 'Ruta', parentLayerId: 374, subLayerIds: null },
      { id: 384, name: 'Buses EMT', parentLayerId: -1, subLayerIds: null },
    ];
    expect(routeLayersByLine(layers)).toEqual([{ line: '4', layerId: 4 }, { line: 'C1', layerId: 362 }, { line: 'C2', layerId: 377 }]);
  });
});

describe('BusTracker: movimiento reconstruido', () => {
  it('calcula rumbo', () => {
    expect(bearing([0, 0], [0, 1])).toBeCloseTo(0);
    expect(bearing([0, 0], [1, 0])).toBeCloseTo(90);
  });

  it('sigue a cada autobús entre lecturas y reconstruye velocidad, rumbo y estela', () => {
    const tr = new BusTracker();
    const a = tr.update([r('12', 'A-B', -0.36, 39.47, T0), r('12', 'A-B', -0.34, 39.47, T0)], T0);
    expect(a).toHaveLength(2);
    // 30 s después: el primero avanza ~150 m hacia el norte, el segundo ~75 m hacia el este
    const b = tr.update([r('12', 'A-B', -0.36, 39.47135, T0 + 30_000), r('12', 'A-B', -0.33913, 39.47, T0 + 30_000)], T0 + 31_000);
    expect(b).toHaveLength(2);
    const north = b.find((x) => x.to[1] > 39.471)!;
    const east = b.find((x) => x.to[0] > -0.34)!;
    expect(north.id).toBe(a[0].id);
    expect(north.speedKmh).toBeGreaterThan(15);
    expect(north.speedKmh).toBeLessThan(21);
    expect(north.heading).toBeCloseTo(0, 0);
    expect(east.heading).toBeCloseTo(90, 0);
    expect(north.from).toEqual([-0.36, 39.47]);
    expect(north.trail).toHaveLength(2);
  });

  it('no confunde autobuses de distinto trayecto ni empareja saltos imposibles', () => {
    const tr = new BusTracker();
    const [a] = tr.update([r('12', 'A-B', -0.36, 39.47, T0)], T0);
    const [b] = tr.update([r('12', 'B-A', -0.36, 39.4701, T0 + 20_000)], T0 + 20_000);
    expect(b.id).not.toBe(a.id);
    const [c] = tr.update([r('12', 'B-A', -0.30, 39.50, T0 + 40_000)], T0 + 40_000);
    expect(c.id).not.toBe(b.id);
  });

  it('olvida los autobuses que dejan de aparecer', () => {
    const tr = new BusTracker();
    tr.update([r('4', 'X', -0.36, 39.47, T0)], T0);
    expect(tr.update([], T0 + 60_000)).toHaveLength(0);
    const [again] = tr.update([r('4', 'X', -0.36, 39.4701, T0 + 70_000)], T0 + 70_000);
    expect(again.id).toBe('bus-1');
    tr.update([], T0 + 10 * 60_000);
    const [fresh] = tr.update([r('4', 'X', -0.36, 39.4702, T0 + 11 * 60_000)], T0 + 11 * 60_000);
    expect(fresh.id).toBe('bus-2');
  });
});

import { busFootprint, busLabel, interpolate } from '../map/transit';
import type { BusTrack } from '../core/types';

describe('dibujo de autobuses', () => {
  const bus: BusTrack = {
    id: 'b', line: '12', trip: 'A-B', from: [-0.36, 39.47], to: [-0.36, 39.471], receivedAt: 1000, ts: 0,
    speedKmh: 18.4, heading: 44, trail: [[-0.36, 39.47], [-0.36, 39.471]], zoneId: 'ciutat-vella',
  };
  it('anima entre lecturas', () => {
    expect(interpolate(bus, 1000)).toEqual([-0.36, 39.47]);
    expect(interpolate(bus, 1000 + 7500)[1]).toBeCloseTo(39.4705);
    expect(interpolate(bus, 99_999)).toEqual([-0.36, 39.471]);
  });
  it('etiqueta con línea, velocidad y flecha de rumbo', () => {
    expect(busLabel(bus)).toBe('12  18 km/h ↗');
    expect(busLabel({ ...bus, trail: [bus.to] })).toBe('12');
  });
  it('carrocería orientada según el rumbo', () => {
    const north = busFootprint([0, 0], 0, 12, 2.5);
    const lenDeg = Math.abs(north[0][1] - north[2][1]);
    expect(lenDeg * 111_320).toBeCloseTo(12, 1);
    const east = busFootprint([0, 0], 90, 12, 2.5);
    expect(Math.abs(east[0][0] - east[2][0]) * 111_320).toBeCloseTo(12, 1);
  });
});
