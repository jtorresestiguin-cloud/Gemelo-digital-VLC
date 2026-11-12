/** Descubrimiento de endpoints (diagnóstico). */
import { it } from 'vitest';

const CKAN = 'https://opendata.vlci.valencia.es/api/3/action';
const GEO = 'https://geoportal.valencia.es/server/rest/services';
const H = { headers: { 'User-Agent': 'GemeloDigitalVLC/0.1', Origin: 'https://jtorresestiguin-cloud.github.io' } };
const j = async (u: string) => {
  const r = await fetch(u, H);
  return { status: r.status, cors: r.headers.get('access-control-allow-origin'), json: r.ok ? await r.json().catch(() => null) : null };
};

it('CKAN: conjuntos y recursos', async () => {
  const names = new Set<string>();
  for (const q of ['estat transit temps real', 'trafico tiempo real', 'valenbisi', 'contaminacion atmosferica', 'calidad aire', 'districtes', 'barris', 'equipaments', 'centros educativos', 'hospitales', 'centros de salud', 'farmacias', 'bibliotecas', 'polideportivos', 'mercados', 'bomberos', 'policia', 'centros municipales servicios sociales', 'museos']) {
    const r = await j(`${CKAN}/package_search?q=${encodeURIComponent(q)}&rows=6`);
    const res = r.json?.result?.results ?? [];
    console.log(`\n## búsqueda "${q}" (${r.json?.result?.count}): ${res.map((p: { name: string }) => p.name).join(' | ')}`);
    res.slice(0, 3).forEach((p: { name: string }) => names.add(p.name));
  }
  for (const n of names) {
    const r = await j(`${CKAN}/package_show?id=${n}`);
    const p = r.json?.result;
    if (!p) continue;
    console.log(`\n### ${n} · actualizado ${p.metadata_modified}`);
    for (const res of p.resources ?? []) console.log(`   - [${res.format}] ds=${res.datastore_active} ${res.url}`);
  }
}, 180_000);

it('Geoportal: carpetas OPENDATA y TRAFICO', async () => {
  for (const folder of ['OPENDATA', 'TRAFICO', 'Sanidad', 'Bomberos', 'PoliciaLocal', 'EMT']) {
    const r = await j(`${GEO}/${folder}?f=json`);
    const services = r.json?.services ?? [];
    console.log(`\n## ${folder} (HTTP ${r.status}, CORS=${r.cors}): ${services.map((s: { name: string; type: string }) => `${s.name}(${s.type})`).join(' | ')}`);
    for (const s of services.slice(0, 40)) {
      const d = await j(`${GEO}/${s.name}/${s.type}?f=json`);
      const layers = (d.json?.layers ?? []).map((l: { id: number; name: string }) => `${l.id}:${l.name}`);
      console.log(`   ${s.name}: ${layers.join(' | ')}`);
    }
  }
}, 240_000);
