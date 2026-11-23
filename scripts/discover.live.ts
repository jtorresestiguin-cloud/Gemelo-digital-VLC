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

it('15 minutos', async () => {
  const U = 'https://geoportal.valencia.es/server/rest/services/OPENDATA/UrbanismoEInfraestructuras/MapServer';
  const M = 'https://geoportal.valencia.es/server/rest/services/OPENDATA/MedioAmbiente/MapServer';
  for (const [l, base] of [['224', U], ['215', U], ['8', M]] as const) {
    const meta = await probe(`meta ${l}`, `${base}/${l}?f=json`, 0);
    try {
      const j = JSON.parse(meta);
      console.log(`${j.name} · ${j.geometryType} · maxRecord ${j.maxRecordCount} · centroid ${j.supportsReturningGeometryCentroid ?? j.advancedQueryCapabilities?.supportsReturningGeometryCentroid}`);
      console.log((j.fields ?? []).map((f: { name: string; type: string }) => `${f.name}:${f.type}`).join(', '));
    } catch { /* */ }
    await probe(`count ${l}`, `${base}/${l}/query?where=1%3D1&returnCountOnly=true&f=json`, 200);
    await probe(`muestra ${l}`, `${base}/${l}/query?where=1%3D1&outFields=*&returnGeometry=false&resultRecordCount=3&f=json`, 1500);
    await probe(`centroides ${l}`, `${base}/${l}/query?where=1%3D1&outFields=objectid&returnGeometry=false&returnCentroid=true&outSR=4326&resultRecordCount=2&f=json`, 700);
  }
  // tamaño real de las manzanas con población, simplificadas, en GeoJSON
  const t = await probe('manzanas geojson simplificado (1000)', `${U}/215/query?where=1%3D1&outFields=*&outSR=4326&maxAllowableOffset=0.00005&geometryPrecision=5&resultRecordCount=1000&f=geojson`, 600);
  console.log('bytes por 1000 manzanas:', t.length);
  const b = await probe('barrios geojson simplificado', `${U}/224/query?where=1%3D1&outFields=*&outSR=4326&maxAllowableOffset=0.0001&geometryPrecision=5&f=geojson`, 400);
  console.log('bytes barrios:', b.length);
  const v = await probe('verdes geojson (1000)', `${M}/8/query?where=1%3D1&outFields=*&outSR=4326&maxAllowableOffset=0.00005&geometryPrecision=5&resultRecordCount=1000&f=geojson`, 600);
  console.log('bytes 1000 verdes:', v.length);
});
