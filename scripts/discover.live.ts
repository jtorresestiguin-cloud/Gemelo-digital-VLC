/** Descubrimiento temporal: puntos de interés turísticos del Geoportal (nombre + coordenadas). */
import { it } from 'vitest';

const GEO = 'https://geoportal.valencia.es/server/rest/services/OPENDATA';
const H = { headers: { 'User-Agent': 'GemeloDigitalVLC/0.1', Origin: 'https://jtorresestiguin-cloud.github.io' } };

async function dump(name: string, layer: string) {
  const meta = await (await fetch(`${GEO}/${layer}?f=json`, H)).json().catch(() => null);
  const q = new URLSearchParams({ where: '1=1', outFields: '*', outSR: '4326', f: 'geojson', resultRecordCount: '400' });
  const j = await (await fetch(`${GEO}/${layer}/query?${q}`, H)).json().catch(() => null);
  const feats = j?.features ?? [];
  console.log(`\n### ${name} (${layer}) «${meta?.name}» geom=${meta?.geometryType} n=${feats.length} campos=${(meta?.fields ?? []).map((f: { name: string }) => f.name).join(',')}`);
  for (const f of feats) {
    const p = f.properties ?? {};
    const label = [p.denominaci, p.nombre_edificio, p.numero, p.situacion, p.clasificac, p.grad_prote, p.barrio, p.ruta, p.tipo_ruta, p.nombre].filter((v) => v !== null && v !== undefined && v !== '').slice(0, 5).join(' | ');
    let c = f.geometry?.coordinates;
    if (f.geometry?.type === 'Polygon') c = c[0][0];
    if (f.geometry?.type === 'MultiPolygon') c = c[0][0][0];
    if (f.geometry?.type === 'LineString') c = c[0];
    if (f.geometry?.type === 'MultiLineString') c = c[0][0];
    const xy = Array.isArray(c) ? `${(+c[0]).toFixed(5)},${(+c[1]).toFixed(5)}` : '?';
    console.log(`   ${xy}  ${String(label).slice(0, 110)}`);
  }
}

it('puntos de interés', async () => {
  await dump('Refugios antiaéreos', 'Turismo/MapServer/229');
  await dump('Edificaciones industriales', 'Turismo/MapServer/218');
  await dump('Recursos turísticos (ruta)', 'Turismo/MapServer/226');
}, 280_000);
