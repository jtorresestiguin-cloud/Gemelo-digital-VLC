import { describe, expect, it } from 'vitest';
import { buildOverpassQuery, classify, parseOverpass } from './services';

describe('servicios públicos (Overpass / OpenStreetMap)', () => {
  it('genera una consulta limitada al término municipal de València', () => {
    const q = buildOverpassQuery();
    expect(q).toContain('area["wikidata"="Q8818"]');
    expect(q).toMatch(/nwr\["amenity"~"\^\(hospital\|clinic/);
    expect(q).toContain('nwr["tourism"~"^(museum)$"](area.vlc)');
    expect(q).toContain('out center tags');
  });

  it('clasifica por prioridad (un hospital con farmacia sigue siendo hospital)', () => {
    expect(classify({ amenity: 'hospital', healthcare: 'centre' })).toEqual(['health', 'Hospital']);
    expect(classify({ amenity: 'fire_station' })).toEqual(['emergency', 'Bomberos']);
    expect(classify({ amenity: 'bench' })).toBeUndefined();
  });

  it('lee nodos y vías (centro), descarta lo no clasificable y duplicados', () => {
    const services = parseOverpass({
      elements: [
        { type: 'node', id: 1, lat: 39.47, lon: -0.376, tags: { amenity: 'library', name: 'Biblioteca Pública', 'addr:street': 'Carrer Hospital', 'addr:housenumber': '13' } },
        { type: 'way', id: 2, center: { lat: 39.48, lon: -0.38 }, tags: { amenity: 'hospital', name: 'Hospital X', emergency: 'yes' } },
        { type: 'way', id: 2, center: { lat: 39.48, lon: -0.38 }, tags: { amenity: 'hospital', name: 'Hospital X' } },
        { type: 'node', id: 3, lat: 39.47, lon: -0.37, tags: { amenity: 'bench' } },
        { type: 'relation', id: 4, tags: { amenity: 'school' } },
        { type: 'node', id: 5, lat: 39.46, lon: -0.37, tags: { amenity: 'pharmacy' } },
      ],
    });
    expect(services.map((s) => s.id)).toEqual(['n1', 'w2', 'n5']);
    expect(services[0]).toMatchObject({ category: 'culture', kind: 'Biblioteca', address: 'Carrer Hospital, 13', zoneId: 'ciutat-vella' });
    expect(services[1].emergency).toBe(true);
    expect(services[2].name).toBe('Farmacia');
  });
});
