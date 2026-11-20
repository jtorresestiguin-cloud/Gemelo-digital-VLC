/** Descubrimiento temporal: datos abiertos sin clave para el modo realista. */
import { it } from 'vitest';

const GEO = 'https://geoportal.valencia.es/server/rest/services/OPENDATA';
const H = { headers: { 'User-Agent': 'GemeloDigitalVLC/0.1', Origin: 'https://jtorresestiguin-cloud.github.io' } };

async function head(name: string, url: string) {
  try {
    const r = await fetch(url, H);
    const buf = await r.arrayBuffer();
    console.log(`\n### ${name} HTTP ${r.status} type=${r.headers.get('content-type')} CORS=${r.headers.get('access-control-allow-origin')} bytes=${buf.byteLength}`);
    return { r, text: new TextDecoder().decode(buf.slice(0, 2000)) };
  } catch (e) {
    console.log(`\n### ${name} ERROR ${(e as Error).message}`);
    return null;
  }
}

async function layer(name: string, path: string, bbox = '-0.380,39.472,-0.372,39.478') {
  const meta = await (await fetch(`${GEO}/${path}?f=json`, H)).json().catch(() => null);
  const [x0, y0, x1, y1] = bbox.split(',');
  const q = new URLSearchParams({ where: '1=1', outFields: '*', outSR: '4326', f: 'geojson', geometry: `${x0},${y0},${x1},${y1}`, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', resultRecordCount: '3' });
  const cnt = await (await fetch(`${GEO}/${path}/query?where=1%3D1&returnCountOnly=true&f=json`, H)).json().catch(() => null);
  const cntBox = await (await fetch(`${GEO}/${path}/query?${new URLSearchParams({ where: '1=1', returnCountOnly: 'true', f: 'json', geometry: `${x0},${y0},${x1},${y1}`, geometryType: 'esriGeometryEnvelope', inSR: '4326' })}`, H)).json().catch(() => null);
  const res = await fetch(`${GEO}/${path}/query?${q}`, H);
  const j = await res.json().catch(() => null);
  console.log(`\n### ${name} (${path}) name=${meta?.name} geom=${meta?.geometryType} total=${cnt?.count} enCentro(~600m)=${cntBox?.count} maxRec=${meta?.maxRecordCount} CORS=${res.headers.get('access-control-allow-origin')}`);
  console.log(`   campos: ${(meta?.fields ?? []).map((f: { name: string; type: string }) => `${f.name}:${f.type.replace('esriFieldType', '')}`).join(', ')}`);
  for (const f of j?.features ?? []) console.log(`   ej: ${JSON.stringify(f.properties).slice(0, 500)} geom=${JSON.stringify(f.geometry).slice(0, 140)}`);
}

it('datos para el modo realista', async () => {
  // Ortofoto PNOA (IGN), tesela z18 sobre el Micalet
  const z = 18, lat = 39.4755, lng = -0.3753;
  const n = 2 ** z, x = Math.floor(((lng + 180) / 360) * n), y = Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
  for (const zz of [18, 19, 20]) {
    const f = 2 ** (zz - z);
    await head(`PNOA z${zz}`, `https://www.ign.es/wmts/pnoa-ma?layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/jpeg&TileMatrix=${zz}&TileCol=${x * f}&TileRow=${y * f}`);
  }
  await head('PNOA WMS', 'https://www.ign.es/wms-inspire/pnoa-ma?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=OI.OrthoimageCoverage&STYLES=&CRS=EPSG:4326&BBOX=39.474,-0.377,39.477,-0.373&WIDTH=512&HEIGHT=512&FORMAT=image/jpeg');
  // MDT del IGN (WCS) y Terrarium
  await head('Terrarium z14', 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/14/8175/6229.png');
  // Edificios del Geoportal y del Catastro
  for (const id of [112, 114, 287, 323, 306]) await layer(`Urbanismo ${id}`, `UrbanismoEInfraestructuras/MapServer/${id}`);
  await layer('Arbolado', 'MedioAmbiente/MapServer/151');
  await layer('Espacios verdes', 'MedioAmbiente/MapServer/8');
  const cat = await head('Catastro INSPIRE WFS edificios', 'https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx?service=WFS&version=2.0.0&request=GetFeature&STOREDQUERIE_ID=GetBuildingByBBox&srsname=EPSG::4326&bbox=39.474,-0.377,39.476,-0.375');
  if (cat) console.log(`   ${cat.text.slice(0, 1500).replace(/\s+/g, ' ')}`);
}, 280_000);
