/**
 * Geometría de edificios a partir de polígonos (GeoJSON en lng/lat) con altura:
 * muros con coordenadas de fachada (para dibujar ventanas por planta) y tejados planos
 * (que se texturizan con la ortofoto). Función pura: se prueba sin WebGL.
 */
import type { LngLat } from '../core/types';
import { toLocal } from './geo';

export interface BuildingInput {
  rings: LngLat[][]; // [exterior, ...huecos]
  height: number;
  minHeight: number;
  /** semilla para variar el color de la fachada */
  seed: number;
}

export interface BuildingArrays {
  wallPositions: Float32Array;
  wallNormals: Float32Array;
  /** (metros a lo largo del muro, metros de altura) */
  wallUvs: Float32Array;
  wallColors: Float32Array;
  roofPositions: Float32Array;
  roofIndices: Uint32Array;
}

/** Colores de fachada habituales en València: crema, ocre, blanco roto, teja, gris piedra. */
export const FACADE_PALETTE: [number, number, number][] = [
  [0.92, 0.86, 0.74], [0.86, 0.72, 0.54], [0.95, 0.93, 0.88], [0.80, 0.60, 0.46],
  [0.80, 0.79, 0.76], [0.90, 0.80, 0.66], [0.72, 0.68, 0.62], [0.96, 0.93, 0.84],
];

/** Área con signo en el plano (este, norte): positiva si el anillo va en sentido antihorario. */
export function signedArea(ring: [number, number][]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return a / 2;
}

type Triangulate = (contour: [number, number][], holes: [number, number][][]) => number[][];

/** Devuelve true si el tramo (en metros este/norte) es un corte artificial del borde de tesela. */
export type ClipEdgeTest = (e0: number, n0: number, e1: number, n1: number) => boolean;

export function buildBuildingArrays(origin: LngLat, buildings: BuildingInput[], triangulate: Triangulate, isClipEdge?: ClipEdgeTest): BuildingArrays {
  const wp: number[] = [], wn: number[] = [], wu: number[] = [], wc: number[] = [];
  const rp: number[] = [], ri: number[] = [];

  for (const b of buildings) {
    if (b.height - b.minHeight < 1.5 || !b.rings.length) continue;
    const color = FACADE_PALETTE[Math.abs(b.seed) % FACADE_PALETTE.length];
    // anillos en (este, norte) y sin el punto repetido de cierre
    const rings = b.rings.map((r) => {
      const pts = r.map((p) => { const [x, z] = toLocal(origin, p); return [x, -z] as [number, number]; });
      if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
      return pts;
    }).filter((r) => r.length >= 3);
    if (!rings.length) continue;
    // exterior antihorario y huecos horarios: así la normal (dn, -de) apunta siempre hacia fuera del material
    rings.forEach((r, i) => {
      const ccw = signedArea(r) > 0;
      if ((i === 0 && !ccw) || (i > 0 && ccw)) r.reverse();
    });

    for (const ring of rings) {
      let along = 0;
      for (let i = 0; i < ring.length; i++) {
        const [e0, n0] = ring[i];
        const [e1, n1] = ring[(i + 1) % ring.length];
        const de = e1 - e0, dn = n1 - n0;
        const len = Math.hypot(de, dn);
        if (len < 0.05 || isClipEdge?.(e0, n0, e1, n1)) continue;
        // normal exterior en coordenadas de three (x = este, z = sur)
        const nx = dn / len, nz = de / len;
        const quad: [number, number, number, number, number][] = [
          [e0, b.minHeight, n0, along, b.minHeight], [e1, b.minHeight, n1, along + len, b.minHeight],
          [e1, b.height, n1, along + len, b.height], [e0, b.height, n0, along, b.height],
        ];
        for (const k of [0, 1, 2, 0, 2, 3]) {
          const [e, y, n, u, v] = quad[k];
          wp.push(e, y, -n);
          wn.push(nx, 0, nz);
          wu.push(u, v);
          wc.push(...color);
        }
        along += len;
      }
    }

    const base = rp.length / 3;
    const [outer, ...holes] = rings;
    const tris = triangulate(outer, holes);
    for (const p of [outer, ...holes].flat()) rp.push(p[0], b.height, -p[1]);
    // (este, norte) → (x, z = -norte) es un espejo: el orden antihorario de la triangulación ya mira hacia arriba
    for (const t of tris) ri.push(base + t[0], base + t[1], base + t[2]);
  }

  return {
    wallPositions: new Float32Array(wp), wallNormals: new Float32Array(wn), wallUvs: new Float32Array(wu), wallColors: new Float32Array(wc),
    roofPositions: new Float32Array(rp), roofIndices: new Uint32Array(ri),
  };
}
