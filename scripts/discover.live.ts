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

it('nuevas fuentes', async () => {
  const G = 'https://geoportal.valencia.es/server/rest/services/OPENDATA';
  const folders = await probe('Geoportal carpetas', `${G}?f=json`, 3000);
  try {
    const services = (JSON.parse(folders).services ?? []) as { name: string; type: string }[];
    console.log(services.map((s) => `${s.name} (${s.type})`).join('\n'));
    for (const f of JSON.parse(folders).folders ?? []) console.log('carpeta', f);
  } catch { /* */ }
  for (const svc of ['Trafico', 'MedioAmbiente', 'UrbanismoEInfraestructuras', 'SociedadBienestar', 'Turismo']) {
    const t = await probe(`Capas ${svc}`, `${G}/${svc}/MapServer?f=json`, 0);
    try {
      console.log((JSON.parse(t).layers ?? []).map((l: { id: number; name: string }) => `${l.id} ${l.name}`).join('\n'));
    } catch { /* */ }
  }
  // aparcamientos: se busca la capa por nombre
  const traf = await probe('Trafico json', `${G}/Trafico/MapServer?f=json`, 0);
  try {
    for (const l of JSON.parse(traf).layers as { id: number; name: string }[]) {
      if (/aparc|parking|metro|tranv|carga|recarga|taxi|semaf|accid|corte|obra/i.test(l.name)) {
        await probe(`Trafico/${l.id} ${l.name}`, `${G}/Trafico/MapServer/${l.id}/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&resultRecordCount=2&f=json`, 1800);
      }
    }
  } catch { /* */ }
  const ma = await probe('MedioAmbiente json', `${G}/MedioAmbiente/MapServer?f=json`, 0);
  try {
    for (const l of JSON.parse(ma).layers as { id: number; name: string }[]) {
      if (/playa|platj|agua|aigua|ruido|soroll|sensor|polen|ozono|meteo|temperat|fuente|font/i.test(l.name)) {
        await probe(`MedioAmbiente/${l.id} ${l.name}`, `${G}/MedioAmbiente/MapServer/${l.id}/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&resultRecordCount=2&f=json`, 1800);
      }
    }
  } catch { /* */ }

  // Agua de baño (Generalitat)
  for (const id of ['puntos-de-muestreo-de-la-calidad-del-agua-en-la-comunitat-valenciana1', 'censo-de-zonas-aguas-de-bano-de-la-comunitat-valenciana']) {
    const t = await probe(`GVA ${id}`, `https://dadesobertes.gva.es/api/3/action/package_show?id=${id}`, 0);
    try {
      for (const r of JSON.parse(t).result.resources as { name: string; url: string; format: string }[]) console.log(` - ${r.format} · ${r.name} · ${r.url}`);
    } catch { /* */ }
  }
  await probe('Calidad agua València', 'https://valencia.es/ayuntamiento/calidad_aguas.nsf/fudatospw?readform=', 2500);

  // Mar en vivo (Open-Meteo Marine)
  await probe('Open-Meteo marine', 'https://marine-api.open-meteo.com/v1/marine?latitude=39.47&longitude=-0.31&current=wave_height,wave_period,wave_direction,sea_surface_temperature&timezone=Europe%2FMadrid', 800);
  // FGV: comprobar CORS
  await probe('FGV previsión (Xàtiva)', 'https://www.fgv.es/fgv/app/es/api/v1/V/horarios-prevision-3/43', 600);
  // Polen / UV (Open-Meteo air quality)
  await probe('Open-Meteo aire (polen, UV)', 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=39.47&longitude=-0.376&current=uv_index,grass_pollen,olive_pollen,european_aqi&timezone=Europe%2FMadrid', 800);
});
