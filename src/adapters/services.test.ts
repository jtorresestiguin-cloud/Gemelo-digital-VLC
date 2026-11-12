import { describe, expect, it } from 'vitest';
import { classifyClass, parseFacilities, parseHospitals } from './services';
import type { GeoCollection } from './geoportal';

const pt = (lng: number, lat: number) => ({ type: 'Point', coordinates: [lng, lat] });

describe('servicios públicos (fuentes oficiales del Ajuntament)', () => {
  it('clasifica las clases reales del Geoportal', () => {
    expect(classifyClass('Instalaciones educativas')).toBe('education');
    expect(classifyClass('Instalaciones sanitarias')).toBe('health');
    expect(classifyClass('Bienestar Social')).toBe('social');
    expect(classifyClass('Centros juveniles')).toBe('social');
    expect(classifyClass('Instalaciones deportivas')).toBe('sport');
    expect(classifyClass('Policía')).toBe('emergency');
    expect(classifyClass('Museos')).toBe('culture');
    expect(classifyClass('Bibliotecas')).toBe('culture');
    expect(classifyClass('Teatros')).toBe('culture');
    expect(classifyClass('Mercados')).toBe('market');
    expect(classifyClass('Oficinas municipales')).toBe('administration');
    expect(classifyClass('Puntos de venta EMT')).toBeUndefined();
    expect(classifyClass('Sin clase Mapa')).toBeUndefined();
    expect(classifyClass('invisible')).toBeUndefined();
  });

  it('lee equipamientos municipales (formato del Geoportal)', () => {
    const fc: GeoCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: pt(-0.376, 39.47), properties: { objectid: 1, equipamien: 'BIBLIOTECA PÚBLICA MUNICIPAL', clase: 'Bibliotecas', telefono: 963525478 } },
        { type: 'Feature', geometry: pt(-0.377, 39.452), properties: { objectid: 2, equipamien: 'QUIOSCO C. OLTA', clase: 'Puntos de venta EMT' } },
        { type: 'Feature', geometry: null, properties: { objectid: 3, equipamien: 'X', clase: 'Bibliotecas' } },
      ],
    };
    const s = parseFacilities(fc);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ id: 'eq-1', name: 'Biblioteca Pública Municipal', category: 'culture', kind: 'Bibliotecas', phone: '963525478', zoneId: 'ciutat-vella' });
  });

  it('lee hospitales del portal de datos abiertos (MultiPoint)', () => {
    const fc: GeoCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'MultiPoint', coordinates: [[-0.3949, 39.4531]] },
        properties: { nombre: 'Hospital pare Jofre', financiaci: 'Publico', tipo: 'Hospital', camas: 125, direccion: 'San Llátzer s/n' },
      }],
    };
    const [h] = parseHospitals(fc);
    expect(h).toMatchObject({ name: 'Hospital pare Jofre', kind: 'Hospital', category: 'health', publicFunded: true, address: 'San Llátzer s/n' });
    expect(h.detail).toContain('125 camas');
  });
});
