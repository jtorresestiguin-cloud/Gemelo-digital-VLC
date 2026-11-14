/** Descubrimiento: capas de seguimiento de la EMT en el Geoportal (diagnóstico temporal). */
import { it } from 'vitest';

const BASE = 'https://geoportal.valencia.es/server/rest/services';
const H = { headers: { 'User-Agent': 'GemeloDigitalVLC/0.1', Origin: 'https://jtorresestiguin-cloud.github.io' } };
const get = async (u: string) => { const r = await fetch(u, H); return { r, j: await r.json().catch(() => null) }; };

async function describe(path: string, n = 2) {
  const meta = (await get(`${BASE}/${path}?f=json`)).j;
  const cnt = (await get(`${BASE}/${path}/query?where=1%3D1&returnCountOnly=true&f=json`)).j;
  const { r, j } = await get(`${BASE}/${path}/query?where=1%3D1&outFields=*&outSR=4326&resultRecordCount=${n}&f=geojson`);
  console.log(`\n### ${path} name=${meta?.name} type=${meta?.type} geom=${meta?.geometryType} count=${cnt?.count} HTTP=${r.status} CORS=${r.headers.get('access-control-allow-origin')} cache=${r.headers.get('cache-control')}`);
  console.log(`   campos: ${(meta?.fields ?? []).map((f: { name: string; type: string }) => `${f.name}:${f.type.replace('esriFieldType', '')}`).join(', ')}`);
  for (const f of j?.features ?? []) console.log(`   ej: ${JSON.stringify(f.properties).slice(0, 600)} geom=${JSON.stringify(f.geometry).slice(0, 160)}`);
  return j;
}

it('EMT', async () => {
  const svc = (await get(`${BASE}/EMT/Seguimiento_EMT/MapServer?f=json`)).j;
  const layers = (svc?.layers ?? []) as { id: number; name: string; parentLayerId: number; subLayerIds: number[] | null }[];
  console.log(`\n## ${layers.length} capas. Grupos (líneas): ${layers.filter((l) => l.subLayerIds).map((l) => `${l.id}:${l.name}`).join(' | ')}`);
  console.log(`## hojas sin grupo: ${layers.filter((l) => !l.subLayerIds && l.parentLayerId === -1).map((l) => `${l.id}:${l.name}`).join(' | ')}`);
  await describe('EMT/Seguimiento_EMT/MapServer/384', 3);
  const linea4 = layers.find((l) => l.name === 'Linea 4');
  for (const id of linea4?.subLayerIds ?? [2, 3, 4, 5]) await describe(`EMT/Seguimiento_EMT/MapServer/${id}`, 2);
  await describe('OPENDATA/Trafico/MapServer/226', 2);
  await describe('OPENDATA/Trafico/MapServer/248', 2);
  // ¿cada cuánto cambia? dos lecturas separadas 40 s
  const q = `${BASE}/EMT/Seguimiento_EMT/MapServer/384/query?where=1%3D1&outFields=*&outSR=4326&f=geojson`;
  const a = (await get(q)).j;
  await new Promise((res) => setTimeout(res, 40_000));
  const b = (await get(q)).j;
  const key = (f: { properties: Record<string, unknown> }) => JSON.stringify(Object.values(f.properties).slice(0, 2));
  const pa = new Map((a?.features ?? []).map((f: { properties: Record<string, unknown>; geometry: unknown }) => [key(f), JSON.stringify(f.geometry)]));
  let moved = 0, same = 0;
  for (const f of b?.features ?? []) { const g = pa.get(key(f)); if (g === undefined) continue; if (g === JSON.stringify(f.geometry)) same++; else moved++; }
  console.log(`\n### cambio en 40 s: total=${b?.features?.length} movidos=${moved} iguales=${same}`);
}, 280_000);
