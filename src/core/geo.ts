import type { LngLat } from './types';
import { METRO_STATIONS, ZONES, type MetroStation } from '../data/static';

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceKm(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// --- Polígonos de distrito ------------------------------------------------------------------

/** Lista de polígonos; cada polígono = [anillo exterior, ...huecos]. */
export type Polygons = LngLat[][][];

interface IndexedDistrict {
  zoneId: string;
  polygons: Polygons;
  bbox: [number, number, number, number];
}

let districtIndex: IndexedDistrict[] | null = null;

function ringContains(ring: LngLat[], [x, y]: LngLat): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonsContain(polys: Polygons, p: LngLat): boolean {
  return polys.some(([outer, ...holes]) => ringContains(outer, p) && !holes.some((h) => ringContains(h, p)));
}

/** Registra los límites de distrito; a partir de aquí `zoneFor` usa punto-en-polígono. */
export function setDistrictPolygons(districts: { zoneId: string; polygons: Polygons }[] | null): void {
  districtIndex = districts?.map((d) => {
    const pts = d.polygons.flatMap((p) => p[0]);
    return {
      ...d,
      bbox: [
        Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])),
        Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1])),
      ],
    };
  }) ?? null;
}

function nearestZone(p: LngLat): string {
  let best = ZONES[0].id;
  let bestD = Infinity;
  for (const z of ZONES) {
    const d = distanceKm(p, z.center);
    if (d < bestD) {
      bestD = d;
      best = z.id;
    }
  }
  return best;
}

/** Distrito de un punto: polígono oficial si está cargado; si no (o si cae fuera), el centroide más cercano. */
export function zoneFor(p: LngLat): string {
  if (districtIndex) {
    for (const d of districtIndex) {
      const [x0, y0, x1, y1] = d.bbox;
      if (p[0] < x0 || p[0] > x1 || p[1] < y0 || p[1] > y1) continue;
      if (polygonsContain(d.polygons, p)) return d.zoneId;
    }
  }
  return nearestZone(p);
}

export function midpoint(coords: LngLat[]): LngLat {
  return coords[Math.floor(coords.length / 2)] ?? coords[0];
}

/** Estación de metro más cercana que tenga al menos una línea no interrumpida. */
export function nearestMetroStation(p: LngLat, interruptedLines: Set<string> = new Set()): MetroStation | undefined {
  let best: MetroStation | undefined;
  let bestD = Infinity;
  for (const s of METRO_STATIONS) {
    if (s.lines.every((l) => interruptedLines.has(l))) continue;
    const d = distanceKm(p, s.lngLat);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}
