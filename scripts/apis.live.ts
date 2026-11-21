/**
 * Comprobación de las fuentes reales con el mismo código que usa la app.
 * Necesita internet: npx vitest run -c vitest.live.config.ts
 * Falla si alguna fuente deja de responder o devuelve muchos menos datos de lo normal.
 */
import { describe, expect, it } from 'vitest';
import { fetchAir, fetchBikes, fetchTraffic, fetchWeather } from '../src/adapters/opendata';
import { fetchDistricts } from '../src/adapters/districts';
import { fetchServices } from '../src/adapters/services';
import { matchFicha, type FichasDoc } from '../src/adapters/fichas';
import { readFileSync } from 'node:fs';
import { fetchBusPositions, fetchRoutes, fetchStops } from '../src/transit/emt';
import { ION_API, ION_GOOGLE_ASSET, tilesetFromIonEndpoint } from '../src/map/google3d';

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
    // cuántos puntos del mapa tienen ficha ampliada (Mapa de Servicios Públicos CV)
    const doc = JSON.parse(readFileSync('public/data/fichas-vlc.json', 'utf8')) as FichasDoc;
    const inCity = s.filter((x) => x.lngLat[1] > 39.4 && x.lngLat[1] < 39.53 && x.lngLat[0] > -0.43 && x.lngLat[0] < -0.3);
    const withFicha = inCity.filter((x) => matchFicha(doc, x.name, x.lngLat));
    const byCatF: Record<string, string> = {};
    for (const c of new Set(inCity.map((x) => x.category))) {
      const all = inCity.filter((x) => x.category === c).length;
      byCatF[c] = `${withFicha.filter((x) => x.category === c).length}/${all}`;
    }
    report('fichas', withFicha.length, { total: inCity.length, porCategoria: byCatF, ejemplos: withFicha.slice(0, 5).map((x) => [x.name, matchFicha(doc, x.name, x.lngLat)!.n]) });
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
  it('Cesium ion: token de la web y modelos fotorrealistas de Google', async () => {
    const token = process.env.CESIUM_ION_TOKEN?.trim();
    if (!token) return console.log('[ion] sin token configurado (secreto CESIUM_ION_TOKEN)');
    const origin = { Origin: 'https://jtorresestiguin-cloud.github.io', Referer: 'https://jtorresestiguin-cloud.github.io/Gemelo-digital-VLC/' };
    const r = await fetch(`${ION_API}/${ION_GOOGLE_ASSET}/endpoint`, { headers: { Authorization: `Bearer ${token}`, ...origin } });
    const body = await r.text();
    console.log(`[ion] endpoint HTTP ${r.status} · ${body.replace(/key=[^"&]+/g, 'key=***').slice(0, 300)}`);
    expect(r.status).toBe(200);
    const url = tilesetFromIonEndpoint(JSON.parse(body));
    const root = await fetch(url, { headers: origin });
    const rootText = await root.text();
    console.log(`[google] root.json HTTP ${root.status} · ${rootText.slice(0, 200)}`);
    expect(root.status).toBe(200);
    expect(JSON.parse(rootText).root).toBeTruthy();
  });
});
