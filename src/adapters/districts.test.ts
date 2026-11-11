import { afterEach, describe, expect, it } from 'vitest';
import { approximateDistricts, parseDistricts } from './districts';
import { polygonsContain, setDistrictPolygons, zoneFor } from '../core/geo';
import { ZONES } from '../data/static';

afterEach(() => setDistrictPolygons(null));

describe('distritos', () => {
  it('los polígonos aproximados contienen su propio centroide', () => {
    const d = approximateDistricts();
    expect(d).toHaveLength(ZONES.length);
    for (const z of ZONES) expect(polygonsContain(d.find((x) => x.zoneId === z.id)!.polygons, z.center)).toBe(true);
  });

  it('con polígonos cargados, zoneFor usa punto-en-polígono (y respeta huecos)', () => {
    const square = (x: number, y: number, s: number) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]] as [number, number][];
    setDistrictPolygons([
      { zoneId: 'jesus', polygons: [[square(-0.40, 39.46, 0.02), square(-0.395, 39.465, 0.005)]] },
    ]);
    // dentro del cuadrado: aunque el centroide más cercano sea otro, manda el polígono
    expect(zoneFor([-0.398, 39.478])).toBe('jesus');
    // en el hueco: cae al centroide más cercano
    expect(zoneFor([-0.393, 39.467])).not.toBe('jesus');
  });

  it('reconoce los distritos oficiales por código o por nombre', () => {
    const poly = { type: 'Polygon', coordinates: [[[-0.38, 39.47], [-0.37, 39.47], [-0.37, 39.48], [-0.38, 39.47]]] };
    const features = ZONES.map((z, i) => ({
      geometry: poly,
      properties: i % 2 ? { coddistrit: z.code } : { nombre: z.name.toUpperCase() },
    }));
    expect(parseDistricts({ features }).map((d) => d.zoneId).sort()).toEqual(ZONES.map((z) => z.id).sort());
  });
});
