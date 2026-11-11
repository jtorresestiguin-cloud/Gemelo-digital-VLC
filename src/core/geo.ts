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

/** Asigna un punto al distrito con el centroide más cercano. */
export function zoneFor(p: LngLat): string {
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
