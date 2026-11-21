import { describe, expect, it } from 'vitest';
import { parseDepartures, parseForecast, parseParkings, parseWorks, pollenLevel, uvLevel } from './extras';

const g = (features: { geometry: unknown; properties: Record<string, unknown> }[]) =>
  ({ type: 'FeatureCollection', features: features.map((f) => ({ type: 'Feature', ...f })) }) as never;

describe('más datos en vivo', () => {
  it('aparcamientos: solo cuenta como en vivo lo actualizado hace poco y sin valores negativos', () => {
    const now = 1_800_000_000_000;
    const r = parseParkings(g([
      { geometry: { type: 'Point', coordinates: [-0.37, 39.47] }, properties: { nombre: 'GLORIETA - PAZ', plazastota: 375, plazaslibr: 42, ultima_mod: now - 60_000 } },
      { geometry: { type: 'Point', coordinates: [-0.36, 39.47] }, properties: { nombre: 'PARKING CHILE', plazastota: 527, plazaslibr: -1, ultima_mod: now - 3600_000 } },
      { geometry: { type: 'Point', coordinates: [-0.35, 39.47] }, properties: { nombre: 'VIEJO', plazastota: 200, plazaslibr: 50, ultima_mod: now - 30 * 86400_000 } },
    ]), now);
    expect(r.geo.features.map((f) => f.properties!.live)).toEqual([true, false, false]);
    expect(r.geo.features[0].properties!.name).toBe('Glorieta - Paz');
    expect(r.info).toContain('1 de 3');
  });

  it('previsión y obras resumen lo importante', () => {
    const line = { type: 'LineString', coordinates: [[-0.37, 39.47], [-0.371, 39.471]] };
    expect(parseForecast(g([{ geometry: line, properties: { nombre_via: 'Calle', ocupacion_6: 90 } }, { geometry: line, properties: { ocupacion_6: 30 } }]), 'ocupacion_6').info)
      .toBe('2 calles · ocupación media 60 % · 1 casi llenas');
    const w = parseWorks(g([{ geometry: line, properties: { ocupacion: '100% CALZADA', fecha_inicio_periodo: 1735776000000, fecha_fin_periodo: 1796083140000 } }]));
    expect(w.geo.features[0].properties!.road).toBe(true);
    expect(w.info).toContain('1 ocupan calzada');
  });

  it('lee los próximos trenes de la página del Geoportal', () => {
    const html = `<span class="imagenParada"><img src="/geoportal-services/images/linea_metro_2.png" title="1" /></span><span style="x"> <span>2 - Llíria - Torrent Avinguda</span>, <span>Destino</span> <b>Torrent Avinguda</b> - <span>17:30:00</span></span>`;
    expect(parseDepartures(html)).toEqual([{ line: '2', route: '2 - Llíria - Torrent Avinguda', to: 'Torrent Avinguda', time: '17:30' }]);
  });

  it('niveles de polen y UV en palabras', () => {
    expect(pollenLevel(0)).toBe('muy bajo');
    expect(pollenLevel(60)).toBe('alto');
    expect(uvLevel(7)).toBe('alto');
  });
});
