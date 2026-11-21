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

it('nuevas fuentes 2', async () => {
  const G = 'https://geoportal.valencia.es/server/rest/services/OPENDATA';
  const q = (path: string, extra = '') => `${G}/${path}/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&resultRecordCount=2&f=json${extra}`;
  for (const l of ['221', '220', '253', '252', '4']) await probe(`Trafico/${l}`, q(`Trafico/MapServer/${l}`), 1500);
  for (const l of ['194', '221', '235', '254']) await probe(`count Trafico/${l}`, `${G}/Trafico/MapServer/${l}/query?where=1%3D1&returnCountOnly=true&f=json`, 200);
  const now = Date.now();
  await probe('obras vigentes', `${G}/Trafico/MapServer/235/query?where=${encodeURIComponent(`fecha_fin_periodo >= ${now} AND fecha_inicio_periodo <= ${now}`)}&returnCountOnly=true&f=json`, 300);
  await probe('obras vigentes (timestamp)', `${G}/Trafico/MapServer/235/query?where=${encodeURIComponent("fecha_fin_periodo >= CURRENT_TIMESTAMP AND fecha_inicio_periodo <= CURRENT_TIMESTAMP")}&returnCountOnly=true&f=json`, 300);
  await probe('obras estados', `${G}/Trafico/MapServer/235/query?where=1%3D1&outFields=estado,ocupacion&returnDistinctValues=true&returnGeometry=false&f=json`, 2500);
  await probe('parkings todos', `${G}/Trafico/MapServer/194/query?where=1%3D1&outFields=nombre,plazastota,plazaslibr,ocupacion,ultima_mod,tipo&returnGeometry=false&f=json`, 5000);
  await probe('metro salidas', 'https://geoportal.valencia.es/geoportal-services/api/v1/salidas-metro.html?estacion=28&lang=es', 1500);
  await probe('metro salidas json?', 'https://geoportal.valencia.es/geoportal-services/api/v1/salidas-metro?estacion=28&lang=es', 1500);
  await probe('ruido csv https', 'https://mapas.valencia.es/WebsMunicipales/uploads/atmosferica/ruido.csv', 1200);
  await probe('ruido csv http', 'http://mapas.valencia.es/WebsMunicipales/uploads/atmosferica/ruido.csv', 1200);
  await probe('ruido capa completa', `${G}/MedioAmbiente/MapServer/160/query?where=1%3D1&outFields=descripcio,localizaci,mediciones&returnGeometry=false&f=json`, 3000);
  const W = 'https://terramapas.icv.gva.es/0501_CalidadAguas?request=GetFeature&service=WFS&version=2.0.0';
  await probe('playas muestreo json', `${W}&typename=Playas.PuntosMuestreo&outputformat=application/json&count=2`, 2500);
  await probe('playas muestreo csv', `${W}&typename=Playas.PuntosMuestreo&outputformat=csv`, 1500);
  const csv = await probe('playas baño csv', `${W}&typename=Playas.PlayasBanyo&outputformat=csv`, 1500);
  console.log('Valencia:\n' + csv.split('\n').filter((l) => /val[eè]ncia/i.test(l)).slice(0, 30).join('\n'));
  const csv2 = await probe('muestreo csv (València)', `${W}&typename=Playas.PuntosMuestreo&outputformat=csv`, 0);
  console.log('Valencia muestreo:\n' + csv2.split('\n').filter((l, i) => i === 0 || /val[eè]ncia/i.test(l)).slice(0, 30).join('\n'));
  await probe('WFS capabilities', 'https://terramapas.icv.gva.es/0501_CalidadAguas?service=WFS&request=GetCapabilities', 4000);
  await probe('aire polen todos', 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=39.47&longitude=-0.376&current=uv_index,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen&timezone=Europe%2FMadrid', 900);
});
