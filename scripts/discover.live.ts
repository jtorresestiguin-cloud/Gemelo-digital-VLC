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

it('nuevas fuentes 4', async () => {
  const E = 'https://water.discomap.eea.europa.eu/arcgis/rest/services/BathingWater';
  const list = await probe('EEA lista', `${E}?f=json`, 0);
  const names = (JSON.parse(list).services as { name: string }[]).map((s) => s.name);
  console.log(names.join('\n'));
  const last = names.filter((n) => /Dyna_WM_\d{4}$/.test(n)).sort().pop()!;
  const svc = await probe(`EEA ${last}`, `https://water.discomap.eea.europa.eu/arcgis/rest/services/${last}/MapServer?f=json`, 0);
  console.log((JSON.parse(svc).layers ?? []).map((l: { id: number; name: string }) => `${l.id} ${l.name}`).join('\n'));
  for (const l of (JSON.parse(svc).layers ?? []).slice(0, 3) as { id: number }[]) {
    await probe(`EEA capa ${l.id} (València)`, `https://water.discomap.eea.europa.eu/arcgis/rest/services/${last}/MapServer/${l.id}/query?geometry=-0.36,39.28,-0.29,39.50&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&outSR=4326&f=json`, 3500);
  }
  await probe('Ruzafa ruido CSV', 'https://datosbi.vlci.valencia.es/pentaho/plugin/cda/api/doQuery?path=/public/vlci/datosabiertos/calidadambiental_sonometros_ruzafa_diarios.cda&dataAccessId=sqlSonometrosRuzafaDaily&paramid=T248680-daily&outputType=CSV&_TRUST_USER_=publicoda', 900);
  await probe('Ruzafa ruido JSON', 'https://datosbi.vlci.valencia.es/pentaho/plugin/cda/api/doQuery?path=/public/vlci/datosabiertos/calidadambiental_sonometros_ruzafa_diarios.cda&dataAccessId=sqlSonometrosRuzafaDaily&paramid=T248680-daily&outputType=json&_TRUST_USER_=publicoda', 900);
  const pk = await probe('CKAN t248680', 'https://opendata.vlci.valencia.es/api/3/action/package_show?id=t248680-daily', 0);
  try { const r = JSON.parse(pk).result; console.log(JSON.stringify({ extras: r.extras, notes: r.notes, spatial: r.spatial, tags: r.tags?.map((t: { name: string }) => t.name) }).slice(0, 1500)); } catch { /* */ }
  const ck = await probe('CKAN sonometros', 'https://opendata.vlci.valencia.es/api/3/action/package_search?q=sonometros%20OR%20sensores%20ruido%20ubicacion&rows=10', 0);
  try { for (const p of JSON.parse(ck).result.results as { name: string; title: string; resources: { format: string; url: string }[] }[]) console.log(`* ${p.name} · ${p.title} · ${p.resources.map((r) => r.format + ' ' + r.url).slice(0, 2).join(' | ')}`); } catch { /* */ }
});
