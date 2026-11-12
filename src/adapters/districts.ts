/**
 * Límites de distrito. Oficiales desde el portal de datos abiertos del Ajuntament;
 * si no responde, polígonos aproximados de Voronoi a partir de los centroides
 * (coinciden exactamente con la asignación por centroide más cercano).
 */
import { Delaunay } from 'd3-delaunay';
import type { LngLat } from '../core/types';
import type { Polygons } from '../core/geo';
import { VALENCIA_BOUNDS, ZONES } from '../data/static';
import { LAYERS, fetchLayer } from './geoportal';

export interface District {
  zoneId: string;
  name: string;
  polygons: Polygons;
}


const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

interface Feature { geometry: { type: string; coordinates: unknown } | null; properties: Record<string, unknown> }

export function parseDistricts(fc: { features: Feature[] }): District[] {
  const byCode = new Map(ZONES.map((z) => [z.code, z]));
  const byName = new Map(ZONES.map((z) => [norm(z.name), z]));
  const byZone = new Map<string, District>();
  for (const f of fc.features) {
    if (!f.geometry) continue;
    const p = f.properties ?? {};
    const code = Number(p.coddistrit ?? p.coddistrito ?? p.codigo ?? p.cod_dist);
    const name = String(p.nombre ?? p.name ?? p.nom ?? '');
    const zone = byCode.get(code) ?? byName.get(norm(name));
    if (!zone) continue;
    const polygons: Polygons =
      f.geometry.type === 'Polygon' ? [f.geometry.coordinates as LngLat[][]]
      : f.geometry.type === 'MultiPolygon' ? (f.geometry.coordinates as LngLat[][][])
      : [];
    if (!polygons.length) continue;
    // un distrito puede venir en varias entidades: se unen sus polígonos
    const prev = byZone.get(zone.id);
    byZone.set(zone.id, { zoneId: zone.id, name: zone.name, polygons: [...(prev?.polygons ?? []), ...polygons] });
  }
  const out = [...byZone.values()];
  if (out.length < ZONES.length / 2) throw new Error(`solo se reconocieron ${out.length} distritos`);
  return out;
}

export function approximateDistricts(): District[] {
  const [[x0, y0], [x1, y1]] = VALENCIA_BOUNDS;
  const voronoi = Delaunay.from(ZONES.map((z) => z.center)).voronoi([x0, y0, x1, y1]);
  return ZONES.map((z, i) => ({
    zoneId: z.id,
    name: z.name,
    polygons: [[(voronoi.cellPolygon(i) ?? []) as LngLat[]]],
  }));
}

export async function fetchDistricts(): Promise<District[]> {
  return parseDistricts(await fetchLayer(LAYERS.districts));
}
