/** Descubrimiento de endpoints (diagnóstico). npx vitest run -c vitest.live.config.ts scripts/discover */
import { it } from 'vitest';
import { buildOverpassQuery } from '../src/adapters/services';

const UA = 'GemeloDigitalVLC/0.1 (+https://github.com/jtorresestiguin-cloud/Gemelo-digital-VLC)';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

async function probe(name: string, url: string, init: RequestInit = {}, show = 400) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { redirect: 'follow', ...init, headers: { 'User-Agent': UA, Origin: 'https://jtorresestiguin-cloud.github.io', ...(init.headers ?? {}) } });
    const text = await r.text();
    console.log(`\n### ${name} → HTTP ${r.status} (${Date.now() - t0} ms) final=${r.url} CORS=${r.headers.get('access-control-allow-origin')} type=${r.headers.get('content-type')} len=${text.length}\n${text.slice(0, show).replace(/\s+/g, ' ')}`);
    return text;
  } catch (e) {
    console.log(`\n### ${name} → ERROR ${(e as Error).message} ${(e as { cause?: Error }).cause?.message ?? ''}`);
    return '';
  }
}

it('portal de datos abiertos de València', async () => {
  for (const u of [
    'https://valencia.opendatasoft.com/',
    'https://valencia.huwise.com/api/explore/v2.1/catalog/datasets?limit=3&select=dataset_id',
    'https://opendata.vlci.valencia.es/api/3/action/package_search?q=trafico&rows=5',
    'https://opendata.vlci.valencia.es/api/3/action/package_search?q=valenbisi&rows=5',
    'https://opendata.vlci.valencia.es/api/3/action/package_search?q=contaminacion&rows=5',
    'https://opendata.vlci.valencia.es/api/3/action/package_search?q=distritos&rows=5',
    'https://www.valencia.es/dadesobertes',
    'https://geoportal.valencia.es/server/rest/services?f=json',
    'https://geoportal.valencia.es/apps/OpenData/Trafico/tra_estado_trafico.json',
  ]) await probe(u, u, {}, 1500);
});

it('overpass con distintas cabeceras', async () => {
  const small = '[out:json][timeout:25];rel["wikidata"="Q8818"];out ids tags;';
  const body = () => new URLSearchParams({ data: small });
  await probe('overpass UA propio POST', 'https://overpass-api.de/api/interpreter', { method: 'POST', body: body() });
  await probe('overpass UA navegador POST', 'https://overpass-api.de/api/interpreter', { method: 'POST', body: body(), headers: { 'User-Agent': BROWSER_UA, Accept: '*/*' } });
  await probe('overpass GET', `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(small)}`, { headers: { 'User-Agent': BROWSER_UA } });
  await probe('private.coffee UA propio', 'https://overpass.private.coffee/api/interpreter', { method: 'POST', body: body() });
  await probe('kumi', 'https://overpass.kumi.systems/api/interpreter', { method: 'POST', body: body() });
  const full = await probe('overpass consulta completa', 'https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: buildOverpassQuery() }), headers: { 'User-Agent': BROWSER_UA } }, 200);
  try { console.log('elementos:', JSON.parse(full).elements.length); } catch { /* */ }
}, 240_000);
