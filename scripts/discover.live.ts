// TEMPORAL: exploración para el análisis de la ciudad de 15 minutos (se borra al terminar).
import { it } from 'vitest';

async function probe(label: string, url: string, show = 1500) {
  try {
    const r = await fetch(url, { headers: { Origin: 'https://jtorresestiguin-cloud.github.io' }, signal: AbortSignal.timeout(60_000) });
    const txt = await r.text();
    console.log(`\n### ${label}\n${url}\nHTTP ${r.status} · CORS=${r.headers.get('access-control-allow-origin')} · ${txt.length} B\n${txt.slice(0, show)}`);
    return txt;
  } catch (e) {
    console.log(`\n### ${label}\nERROR ${(e as Error).message}`);
    return '';
  }
}

it('15 minutos: vulnerabilidad', async () => {
  const t = await probe('vulnerabilidad geojson', 'https://opendata.vlci.valencia.es/dataset/ca18278b-d040-4274-b9c7-c1a9daae54b9/resource/fd2ca0dc-5344-4aad-8934-2077a0bb120d/download/vulnerabilidad-por-barrios.geojson', 0);
  try {
    const j = JSON.parse(t);
    console.log('features', j.features.length, 'bytes', t.length);
    console.log(JSON.stringify(j.features[0].properties));
    console.log(JSON.stringify(j.features[1].properties));
    console.log('geom', j.features[0].geometry.type, JSON.stringify(j.features[0].geometry.coordinates).slice(0, 120));
  } catch (e) { console.log('no json', (e as Error).message, t.slice(0, 300)); }
  const c = await probe('vulnerabilidad csv', 'https://opendata.vlci.valencia.es/dataset/ca18278b-d040-4274-b9c7-c1a9daae54b9/resource/6648d1d5-4d35-410d-8260-432069045334/download/vulnerabilidad-por-barrios.csv', 1200);
  console.log('csv lines', c.split('\n').length);
  const pk = await probe('ckan vulnerabilidad', 'https://opendata.vlci.valencia.es/api/3/action/package_show?id=vulnerabilidad-por-barrios', 0);
  try { console.log(JSON.parse(pk).result.notes.slice(0, 1500)); } catch { /* */ }
});
