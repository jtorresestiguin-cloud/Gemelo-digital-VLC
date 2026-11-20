/** Descarga de edificios (teselas vectoriales de OpenStreetMap) y arbolado municipal. */
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import type { LngLat } from '../core/types';
import { GEOPORTAL } from '../adapters/geoportal';
import type { BuildingInput } from './buildings';
import { treeFromRecord, type TreeSpec } from './geo';

export interface TileBuildings {
  buildings: BuildingInput[];
}

/** Edificios de una tesela vectorial (esquema OpenMapTiles: capa «building» con render_height). */
export async function fetchBuildingTile(template: string, z: number, x: number, y: number, signal?: AbortSignal): Promise<TileBuildings> {
  const url = template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const tile = new VectorTile(new Pbf(new Uint8Array(await r.arrayBuffer())));
  const layer = tile.layers.building;
  const buildings: BuildingInput[] = [];
  if (!layer) return { buildings };
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    const p = f.properties;
    if (p.hide_3d) continue;
    const height = Number(p.render_height ?? 0) || 0;
    if (!height) continue;
    const g = f.toGeoJSON(x, y, z).geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const rings of polys) {
      buildings.push({ rings: rings as LngLat[][], height, minHeight: Number(p.render_min_height ?? 0) || 0, seed: Number(f.id ?? i) });
    }
  }
  return { buildings };
}

/** Árboles del inventario municipal dentro de un rectángulo (lng/lat), paginando. */
export async function fetchTrees(west: number, south: number, east: number, north: number, max = 40_000, signal?: AbortSignal): Promise<TreeSpec[]> {
  const out: TreeSpec[] = [];
  for (let offset = 0; offset < max; offset += 2000) {
    const q = new URLSearchParams({
      where: '1=1', outFields: 'altura,copa,grupo,nom_botanico', outSR: '4326', f: 'geojson',
      geometry: `${west},${south},${east},${north}`, geometryType: 'esriGeometryEnvelope', inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects', resultOffset: String(offset), resultRecordCount: '2000',
    });
    const r = await fetch(`${GEOPORTAL}/MedioAmbiente/MapServer/151/query?${q}`, { signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as { features?: { geometry: { coordinates: LngLat } | null; properties: Record<string, unknown> }[]; exceededTransferLimit?: boolean; properties?: { exceededTransferLimit?: boolean } };
    for (const f of j.features ?? []) if (f.geometry) out.push(treeFromRecord(f.properties ?? {}, f.geometry.coordinates));
    if (!(j.exceededTransferLimit || j.properties?.exceededTransferLimit) || !j.features?.length) break;
  }
  return out;
}
