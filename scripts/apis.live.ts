/**
 * Comprobación de las fuentes reales con el mismo código que usa la app.
 * Necesita internet: npx vitest run -c vitest.live.config.ts
 * Falla si alguna fuente deja de responder o devuelve muchos menos datos de lo normal.
 */
import { describe, expect, it } from 'vitest';
import { fetchAir, fetchBikes, fetchTraffic, fetchWeather } from '../src/adapters/opendata';
import { fetchDistricts } from '../src/adapters/districts';
import { fetchServices } from '../src/adapters/services';
import { fetchBusPositions, fetchRoutes, fetchStops } from '../src/transit/emt';

const report = (name: string, n: number, sample: unknown) => console.log(`[${name}] ${n} elementos · ${JSON.stringify(sample).slice(0, 250)}`);

describe('fuentes reales', () => {
  it('tráfico en tiempo real (Geoportal)', async () => {
    const t = await fetchTraffic();
    const states: Record<string, number> = {};
    t.forEach((s) => (states[s.state] = (states[s.state] ?? 0) + 1));
    report('tráfico', t.length, states);
    expect(t.length).toBeGreaterThan(200);
  });
  it('Valenbisi (Geoportal)', async () => {
    const b = await fetchBikes();
    report('valenbisi', b.length, b[0]);
    expect(b.length).toBeGreaterThan(200);
  });
  it('calidad del aire (Geoportal)', async () => {
    const a = await fetchAir();
    report('aire', a.length, a[0]);
    expect(a.length).toBeGreaterThan(5);
    expect(a.some((s) => s.no2 !== undefined)).toBe(true);
  });
  it('meteorología (Open-Meteo)', async () => {
    const w = await fetchWeather();
    report('meteo', 1, w);
    expect(Number.isFinite(w.temperature)).toBe(true);
  });
  it('distritos oficiales (Geoportal)', async () => {
    const d = await fetchDistricts();
    report('distritos', d.length, d.map((x) => x.zoneId));
    expect(d.length).toBe(19);
  });
  it('servicios públicos (equipamientos + hospitales)', async () => {
    const s = await fetchServices();
    const byCat: Record<string, number> = {};
    s.forEach((x) => (byCat[x.category] = (byCat[x.category] ?? 0) + 1));
    report('servicios', s.length, byCat);
    expect(s.length).toBeGreaterThan(1000);
    expect(s.filter((x) => x.kind === 'Hospital').length).toBeGreaterThan(20);
  });
  it('EMT: posiciones, paradas y rutas (Geoportal)', async () => {
    const buses = await fetchBusPositions();
    report('emt-buses', buses.length, buses[0]);
    // de madrugada puede haber muy pocos: basta con que la respuesta sea válida
    expect(Array.isArray(buses)).toBe(true);
    const stops = await fetchStops();
    report('emt-paradas', stops.length, stops[0]);
    expect(stops.length).toBeGreaterThan(800);
    const routes = await fetchRoutes();
    report('emt-rutas', routes.length, routes.map((r) => r.line));
    expect(routes.length).toBeGreaterThan(30);
  });
});
