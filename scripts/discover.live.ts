// TEMPORAL: exploración de nuevas fuentes en vivo (se borra al terminar).
import { it } from 'vitest';

const ORIGIN = 'https://jtorresestiguin-cloud.github.io';
async function probe(label: string, url: string, show = 1500) {
  try {
    const r = await fetch(url, { headers: { Origin: ORIGIN }, signal: AbortSignal.timeout(25_000) });
    const txt = await r.text();
    console.log(`\n### ${label}\n${url}\nHTTP ${r.status} · CORS=${r.headers.get('access-control-allow-origin')} · ${r.headers.get('content-type')} · ${txt.length} B\n${txt.slice(0, show)}`);
    return txt;
  } catch (e) {
    console.log(`\n### ${label}\n${url}\nERROR ${(e as Error).message}`);
    return '';
  }
}

it('nuevas fuentes 3', async () => {
  const html = await probe('metro salidas html', 'https://geoportal.valencia.es/geoportal-services/api/v1/salidas-metro.html?estacion=24&lang=es', 0);
  const i = html.indexOf('data-role="content"');
  console.log(html.slice(i, i + 4500));
  const caps = await probe('WFS GVA tipos', 'https://terramapas.icv.gva.es/0501_CalidadAguas?service=WFS&request=GetCapabilities', 0);
  console.log([...caps.matchAll(/<Name>([^<]+)<\/Name>\s*<Title>([^<]*)<\/Title>/g)].map((m) => `${m[1]} · ${m[2]}`).join('\n'));
  const E = 'https://water.discomap.eea.europa.eu/arcgis/rest/services';
  await probe('EEA servicios', `${E}?f=json`, 1500);
  await probe('EEA BathingWater carpeta', `${E}/BathingWater?f=json`, 2000);
  const ck = await probe('CKAN VLCi ruido', 'https://opendata.vlci.valencia.es/api/3/action/package_search?q=ruido&rows=30', 0);
  try {
    for (const p of JSON.parse(ck).result.results as { name: string; title: string; metadata_modified: string; resources: { format: string; url: string; name: string }[] }[]) {
      console.log(`* ${p.name} · ${p.title} · ${p.metadata_modified}`);
      for (const r of p.resources.slice(0, 4)) console.log(`   - ${r.format} ${r.name} ${r.url}`);
    }
  } catch { /* */ }
  const ck2 = await probe('CKAN VLCi playas/agua', 'https://opendata.vlci.valencia.es/api/3/action/package_search?q=playas%20agua&rows=15', 0);
  try {
    for (const p of JSON.parse(ck2).result.results as { name: string; title: string; metadata_modified: string; resources: { format: string; url: string; name: string }[] }[]) {
      console.log(`* ${p.name} · ${p.title} · ${p.metadata_modified}`);
      for (const r of p.resources.slice(0, 4)) console.log(`   - ${r.format} ${r.name} ${r.url}`);
    }
  } catch { /* */ }
});
