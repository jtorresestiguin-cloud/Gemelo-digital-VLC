/**
 * Diagnóstico de las APIs reales usando el mismo código que la app.
 * Ejecutar con internet: npx vitest run -c vitest.live.config.ts
 */
import { describe, expect, it } from 'vitest';
import { DATASETS, fetchAir, fetchBikes, fetchTraffic, fetchWeather } from '../src/adapters/opendata';
import { DISTRICTS_DATASET, fetchDistricts } from '../src/adapters/districts';
import { buildOverpassQuery, parseOverpass } from '../src/adapters/services';

const ODS = 'https://valencia.opendatasoft.com/api/explore/v2.1/catalog/datasets';
const ORIGIN = 'https://jtorresestiguin-cloud.github.io';

async function probe(name: string, url: string, init?: RequestInit) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { ...init, headers: { Origin: ORIGIN, ...(init?.headers ?? {}) } });
    const text = await r.text();
    console.log(`[${name}] HTTP ${r.status} en ${Date.now() - t0} ms · CORS=${r.headers.get('access-control-allow-origin')} · ${text.length} bytes · ${text.slice(0, 300).replace(/\s+/g, ' ')}`);
    return { status: r.status, text };
  } catch (e) {
    console.log(`[${name}] ERROR ${(e as Error).message}`);
    return { status: 0, text: '' };
  }
}

describe('APIs reales', () => {
  it('Opendatasoft: datasets usados por la app', async () => {
    for (const [k, id] of Object.entries({ ...DATASETS, districts: DISTRICTS_DATASET })) {
      const r = await probe(`ods:${k}`, `${ODS}/${id}/records?limit=1`);
      if (r.status === 200) {
        const rec = JSON.parse(r.text).results?.[0] ?? {};
        console.log(`[ods:${k}] campos: ${Object.keys(rec).join(', ')}`);
      }
    }
    for (const q of ['trafic', 'valenbisi', 'contaminacio', 'atmosf', 'districte', 'distrito']) {
      const r = await probe(`ods:buscar:${q}`, `${ODS}?where=${encodeURIComponent(`search("${q}")`)}&limit=10&select=dataset_id`);
      if (r.status === 200) console.log(`[ods:buscar:${q}] ${JSON.parse(r.text).results.map((x: { dataset_id: string }) => x.dataset_id).join(' | ')}`);
    }
  });

  it('Adaptadores de la app', async () => {
    const run = async (name: string, f: () => Promise<unknown[] | object>) => {
      try {
        const v = await f();
        const arr = Array.isArray(v) ? v : [v];
        console.log(`[app:${name}] OK ${arr.length} elementos · ejemplo: ${JSON.stringify(arr[0]).slice(0, 250)}`);
      } catch (e) {
        console.log(`[app:${name}] FALLO ${(e as Error).message}`);
      }
    };
    await run('traffic', fetchTraffic);
    await run('bikes', fetchBikes);
    await run('air', fetchAir);
    await run('weather', fetchWeather);
    await run('districts', fetchDistricts);
  });

  it('Overpass: servicios públicos', async () => {
    await probe('overpass:area', 'https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: new URLSearchParams({ data: '[out:json];area["wikidata"="Q8818"]["boundary"="administrative"];out ids tags;' }),
    });
    await probe('overpass:rel', 'https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: new URLSearchParams({ data: '[out:json];rel["wikidata"="Q8818"];out ids tags;' }),
    });
    for (const url of ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']) {
      const r = await probe(`overpass:${new URL(url).host}`, url, { method: 'POST', body: new URLSearchParams({ data: buildOverpassQuery() }) });
      if (r.status === 200) {
        try {
          const s = parseOverpass(JSON.parse(r.text));
          const byCat: Record<string, number> = {};
          s.forEach((x) => (byCat[x.category] = (byCat[x.category] ?? 0) + 1));
          console.log(`[overpass:${new URL(url).host}] ${s.length} servicios ${JSON.stringify(byCat)}`);
        } catch (e) {
          console.log(`[overpass] no es JSON: ${(e as Error).message}`);
        }
      }
    }
    expect(true).toBe(true);
  });
});
