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
import { loadFifteen, type Padron } from '../src/analysis/fifteenData';
import { fetchLayer } from '../src/adapters/geoportal';
import { fetchBeaches, fetchDepartures, fetchNoise, fetchSea, fetchSky, parseForecast, parseMetro, parseParkings, parseWorks } from '../src/live/extras';
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
    const withFicha = inCity.filter((x) => matchFicha(doc, x.name, x.lngLat, x.category));
    const byCatF: Record<string, string> = {};
    for (const c of new Set(inCity.map((x) => x.category))) {
      const all = inCity.filter((x) => x.category === c).length;
      byCatF[c] = `${withFicha.filter((x) => x.category === c).length}/${all}`;
    }
    const sinFicha = inCity.filter((x) => !withFicha.includes(x) && (x.category === 'education' || x.category === 'health')).slice(0, 12).map((x) => {
      let near = doc.points[0];
      let dm = Infinity;
      for (const f of doc.points) { const d = Math.hypot((f.ll[0] - x.lngLat[0]) * 85_900, (f.ll[1] - x.lngLat[1]) * 111_100); if (d < dm) { dm = d; near = f; } }
      return `${x.name} (${x.kind}) → ${near.n} a ${Math.round(dm)} m`;
    });
    console.log('sin ficha (muestra):\n  ' + sinFicha.join('\n  '));
    report('fichas', withFicha.length, { total: inCity.length, porCategoria: byCatF, ejemplos: withFicha.slice(0, 5).map((x) => [x.name, matchFicha(doc, x.name, x.lngLat, x.category)!.n]) });
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
  it('más datos en vivo: aparcamientos, previsión, obras, metro, playas, ruido, mar, polen y UV', async () => {
    const pk = parseParkings(await fetchLayer('Trafico/MapServer/194'));
    report('aparcamientos', pk.geo.features.length, pk.info);
    const fo = parseForecast(await fetchLayer('Trafico/MapServer/254'), 'ocupacion_1');
    report('prevision', fo.geo.features.length, fo.info);
    const wo = parseWorks(await fetchLayer('Trafico/MapServer/235', { where: 'fecha_fin_periodo >= CURRENT_TIMESTAMP AND fecha_inicio_periodo <= CURRENT_TIMESTAMP' }));
    report('obras', wo.geo.features.length, wo.info);
    const me = parseMetro(await fetchLayer('Trafico/MapServer/221'));
    const deps = await fetchDepartures(String(me.geo.features[0].properties!.url));
    report('metro', me.geo.features.length, { info: me.info, estacion: me.geo.features[0].properties!.name, trenes: deps.slice(0, 3) });
    // la AEMA no siempre responde a servidores fuera de Europa (las ejecuciones de GitHub están en EE. UU.)
    const be = await fetchBeaches().catch((e) => { console.log('playas: sin respuesta de la AEMA desde este servidor', e.message); return { geo: { features: [{ properties: {} }] as never[] }, info: 'sin respuesta' }; });
    report('playas', be.geo.features.length, { info: be.info, playas: be.geo.features.map((f) => `${f.properties!.name}: ${f.properties!.label}`) });
    const no = await fetchNoise();
    report('ruido', no.geo.features.length, { info: no.info, ejemplo: no.geo.features[0].properties });
    report('mar', 1, await fetchSea());
    report('cielo', 1, await fetchSky());
    expect(pk.geo.features.length).toBeGreaterThan(10);
    expect(fo.geo.features.length).toBeGreaterThan(100);
    expect(me.geo.features.length).toBeGreaterThan(100);
    expect(no.geo.features.length).toBeGreaterThan(5);
  });
  it('ciudad de los 15 minutos (padrón, secciones, manzanas, zonas verdes)', async () => {
    const services = await fetchServices();
    const padron = JSON.parse(readFileSync('public/data/padron-2024.json', 'utf8')) as Padron;
    const t0 = Date.now();
    const d = await loadFifteen(services, { padron });
    const worst = [...d.result.barrios.values()].sort((a, b) => a.avgScore - b.avgScore).slice(0, 8)
      .map((b) => `${b.name}: ${b.avgScore.toFixed(1)}/7, todo ${b.full.toFixed(0)} %, peor ${b.weakest}`);
    report('15min', d.result.homes.length, {
      segundos: (Date.now() - t0) / 1000, cobertura: d.coverage, secciones: d.sections.features.length, barrios: d.result.barrios.size,
      ciudad: { full: d.result.city.full.toFixed(1), avg: d.result.city.avgScore.toFixed(2), por: Object.fromEntries(Object.entries(d.result.city.byEssential).map(([k, v]) => [k, v.toFixed(1)])) },
      lugares: Object.fromEntries(Object.entries(d.places).map(([k, v]) => [k, v.length])),
      peores: worst,
    });
    console.log('15min ciudad:', JSON.stringify(d.result.city));
    console.log('15min peores barrios:\n  ' + worst.join('\n  '));
    console.log('15min mejores:', [...d.result.barrios.values()].sort((a, b) => b.full - a.full).slice(0, 5).map((b) => `${b.name} ${b.full.toFixed(0)} %`).join(' · '));
    expect(d.coverage.pop).toBeGreaterThan(0.97 * d.coverage.padron);
    expect(d.sections.features.length).toBeGreaterThan(500);
  });
});
