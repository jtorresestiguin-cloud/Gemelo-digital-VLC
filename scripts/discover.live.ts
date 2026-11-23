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

it('15 minutos: población', async () => {
  const U = 'https://geoportal.valencia.es/server/rest/services/OPENDATA/UrbanismoEInfraestructuras/MapServer';
  const meta = await probe('meta 210 secciones', `${U}/210?f=json`, 0);
  try { console.log((JSON.parse(meta).fields ?? []).map((f: { name: string }) => f.name).join(', ')); } catch { /* */ }
  await probe('muestra 210', `${U}/210/query?where=1%3D1&outFields=*&returnGeometry=false&resultRecordCount=2&f=json`, 1200);
  for (const q of ['poblacion barrios', 'padron barrio', 'padro barris', 'població barri', 'habitantes barrio', 'poblacion seccion censal']) {
    const t = await probe(`CKAN ${q}`, `https://opendata.vlci.valencia.es/api/3/action/package_search?q=${encodeURIComponent(q)}&rows=8`, 0);
    try {
      for (const p of JSON.parse(t).result.results as { name: string; title: string; metadata_modified: string; resources: { format: string; url: string; name: string }[] }[]) {
        console.log(`* ${p.name} · ${p.title} · ${p.metadata_modified.slice(0, 10)}`);
        for (const r of p.resources.slice(0, 3)) console.log(`   - ${r.format} ${r.name} ${r.url}`);
      }
    } catch { /* */ }
  }
});
