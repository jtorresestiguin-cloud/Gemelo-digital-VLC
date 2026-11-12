/** Descubrimiento de campos de las capas del Geoportal (diagnóstico). */
import { it } from 'vitest';

const GEO = 'https://geoportal.valencia.es/server/rest/services/OPENDATA';
const H = { headers: { 'User-Agent': 'GemeloDigitalVLC/0.1', Origin: 'https://jtorresestiguin-cloud.github.io' } };
const get = async (u: string) => { const r = await fetch(u, H); return { r, j: await r.json().catch(() => null) }; };

const LAYERS: Record<string, string> = {
  trafico: 'Trafico/MapServer/192',
  valenbisi: 'Trafico/MapServer/228',
  contaminacion: 'MedioAmbiente/MapServer/156',
  atmosfericas: 'MedioAmbiente/MapServer/157',
  ruido: 'MedioAmbiente/MapServer/160',
  distritos: 'UrbanismoEInfraestructuras/MapServer/225',
  equipamientos: 'SociedadBienestar/MapServer/1',
  emt_paradas: 'Trafico/MapServer/226',
};

it('campos y muestras', async () => {
  for (const [k, path] of Object.entries(LAYERS)) {
    const meta = (await get(`${GEO}/${path}?f=json`)).j;
    const count = (await get(`${GEO}/${path}/query?where=1%3D1&returnCountOnly=true&f=json`)).j;
    const { r, j } = await get(`${GEO}/${path}/query?where=1%3D1&outFields=*&outSR=4326&resultRecordCount=2&f=geojson`);
    console.log(`\n### ${k} (${path}) count=${count?.count} maxRecordCount=${meta?.maxRecordCount} pagination=${meta?.advancedQueryCapabilities?.supportsPagination} geom=${meta?.geometryType} HTTP=${r.status} CORS=${r.headers.get('access-control-allow-origin')}`);
    console.log(`   campos: ${(meta?.fields ?? []).map((f: { name: string; type: string }) => `${f.name}:${f.type.replace('esriFieldType', '')}`).join(', ')}`);
    for (const f of j?.features ?? []) console.log(`   ej: ${JSON.stringify(f.properties).slice(0, 700)} geom=${JSON.stringify(f.geometry).slice(0, 120)}`);
  }
  // valores de los campos de texto de equipamientos (para clasificar)
  const all = (await get(`${GEO}/${LAYERS.equipamientos}/query?where=1%3D1&outFields=*&returnGeometry=false&f=json`)).j;
  const feats = (all?.features ?? []).map((f: { attributes: Record<string, unknown> }) => f.attributes);
  console.log(`\n### equipamientos: ${feats.length} registros (exceeded=${all?.exceededTransferLimit})`);
  const keys = Object.keys(feats[0] ?? {});
  for (const k of keys) {
    const m = new Map<string, number>();
    feats.forEach((a: Record<string, unknown>) => m.set(String(a[k]), (m.get(String(a[k])) ?? 0) + 1));
    if (m.size <= 120) console.log(`   ${k} (${m.size}): ${[...m].sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v}=${n}`).join(' | ').slice(0, 3000)}`);
    else console.log(`   ${k}: ${m.size} valores distintos`);
  }
  const hosp = await fetch('https://opendata.vlci.valencia.es/dataset/c389b148-0fad-46b2-8c7b-f5c5aa866a65/resource/82588e44-2ba8-4038-9bc9-5fb1ce2428d2/download/hospitales.geojson', H);
  const hj = await hosp.json().catch(() => null);
  console.log(`\n### hospitales HTTP ${hosp.status} CORS=${hosp.headers.get('access-control-allow-origin')} n=${hj?.features?.length}: ${JSON.stringify(hj?.features?.[0]).slice(0, 600)}`);
}, 280_000);
