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

it('nuevas fuentes 5', async () => {
  const ck = await probe('CKAN sensores Ruzafa', 'https://opendata.vlci.valencia.es/api/3/action/package_search?q=%22sensor%20de%20ruido%22%20Ruzafa&rows=40', 0);
  for (const p of JSON.parse(ck).result.results as { name: string; title: string; notes: string }[]) {
    const m = p.notes.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
    console.log(`SENSOR ${p.name.toUpperCase()} | ${p.title.replace(/.*calle /i, '')} | ${m ? `${m[1]},${m[2]}` : 'SIN COORD'}`);
  }
  const base = 'https://datosbi.vlci.valencia.es/pentaho/plugin/cda/api/doQuery?path=/public/vlci/datosabiertos/calidadambiental_sonometros_ruzafa_diarios.cda&dataAccessId=sqlSonometrosRuzafaDaily&paramid=T248680-daily&outputType=json&_TRUST_USER_=publicoda';
  await probe('ruido paginado', `${base}&paginateQuery=true&pageSize=1&pageStart=0`, 700);
  const E = 'https://water.discomap.eea.europa.eu/arcgis/rest/services/BathingWater/BathingWater_Dyna_WM_2025/MapServer/3/query?geometry=-0.36,39.28,-0.29,39.50&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=bathingWaterName,qualityStatus,qualityStatus_minus1,longitude,latitude&returnGeometry=false&f=json';
  const e = await probe('EEA playas València', E, 0);
  for (const f of JSON.parse(e).features as { attributes: Record<string, unknown> }[]) console.log(`PLAYA ${JSON.stringify(f.attributes)}`);
});
