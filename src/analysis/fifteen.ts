/**
 * Ciudad de los 15 minutos: ¿qué servicios esenciales tiene cada vecino a menos de 15 min a pie?
 *
 * Método (deliberadamente sencillo y explicable):
 *  - Origen: cada manzana residencial (su centro), con la población que le corresponde.
 *  - Destino: el servicio más cercano de cada una de las 7 funciones esenciales.
 *  - Tiempo a pie = distancia en línea recta × 1,3 (las calles no son rectas) ÷ 80 m/min (4,8 km/h).
 *    Es una aproximación estándar cuando no se calcula la ruta real por la red de calles.
 *  - Una manzana «cumple» una función si el servicio más cercano está a ≤ 15 min.
 */
import type { LngLat } from '../core/types';

export const WALK_M_PER_MIN = 80;
export const DETOUR = 1.3;
export const LIMIT_MIN = 15;

export type Essential = 'health' | 'education' | 'market' | 'culture' | 'sport' | 'social' | 'green';

export const ESSENTIALS: { id: Essential; label: string; icon: string }[] = [
  { id: 'health', label: 'Centro de salud', icon: '🏥' },
  { id: 'education', label: 'Colegio', icon: '🏫' },
  { id: 'market', label: 'Mercado', icon: '🧺' },
  { id: 'culture', label: 'Cultura y biblioteca', icon: '📚' },
  { id: 'sport', label: 'Deporte', icon: '⚽' },
  { id: 'social', label: 'Servicios sociales', icon: '🤝' },
  { id: 'green', label: 'Zona verde', icon: '🌳' },
];

export interface Place { name: string; at: LngLat }

/** metros por grado a la latitud de València */
const M_LAT = 111_130;
const M_LNG = 85_960;

export const meters = (a: LngLat, b: LngLat) => Math.hypot((a[0] - b[0]) * M_LNG, (a[1] - b[1]) * M_LAT);
export const walkMinutes = (m: number) => (m * DETOUR) / WALK_M_PER_MIN;

/** Índice en rejilla para buscar el más cercano sin recorrer todos los puntos. */
export class NearestIndex {
  private cells = new Map<string, Place[]>();
  private readonly size = 400; // m

  constructor(readonly places: Place[]) {
    for (const p of places) {
      const k = this.key(p.at);
      (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(p);
    }
  }

  private cell(at: LngLat): [number, number] {
    return [Math.floor((at[0] * M_LNG) / this.size), Math.floor((at[1] * M_LAT) / this.size)];
  }
  private key(at: LngLat) {
    const [x, y] = this.cell(at);
    return `${x}:${y}`;
  }

  nearest(at: LngLat, maxRing = 40): { place: Place; m: number } | undefined {
    if (!this.places.length) return undefined;
    const [cx, cy] = this.cell(at);
    let best: Place | undefined;
    let bestM = Infinity;
    for (let r = 0; r <= maxRing; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // solo el anillo nuevo
          for (const p of this.cells.get(`${cx + dx}:${cy + dy}`) ?? []) {
            const m = meters(at, p.at);
            if (m < bestM) { bestM = m; best = p; }
          }
        }
      }
      // ya no puede haber nada más cerca fuera de este anillo
      if (best && bestM <= r * this.size) break;
    }
    return best ? { place: best, m: bestM } : undefined;
  }
}

export interface Home { id: string; at: LngLat; pop: number; barrio: string }

export interface Access {
  /** minutos a pie al más cercano de cada función */
  minutes: Record<Essential, number>;
  nearest: Record<Essential, string>;
  /** funciones a ≤ 15 min (0–7) */
  score: number;
}

export function accessFrom(at: LngLat, idx: Record<Essential, NearestIndex>): Access {
  const minutes = {} as Record<Essential, number>;
  const nearest = {} as Record<Essential, string>;
  let score = 0;
  for (const { id } of ESSENTIALS) {
    const n = idx[id].nearest(at);
    minutes[id] = n ? walkMinutes(n.m) : Infinity;
    nearest[id] = n?.place.name ?? '—';
    if (minutes[id] <= LIMIT_MIN) score++;
  }
  return { minutes, nearest, score };
}

export interface BarrioResult {
  name: string;
  pop: number;
  /** % de la población con las 7 funciones a ≤ 15 min */
  full: number;
  /** media ponderada de funciones a ≤ 15 min (0–7) */
  avgScore: number;
  /** % de población a ≤ 15 min de cada función */
  byEssential: Record<Essential, number>;
  /** función peor cubierta */
  weakest: Essential;
}

export interface FifteenResult {
  homes: (Home & Access)[];
  barrios: Map<string, BarrioResult>;
  city: { pop: number; full: number; avgScore: number; byEssential: Record<Essential, number> };
}

const emptyBy = () => Object.fromEntries(ESSENTIALS.map((e) => [e.id, 0])) as Record<Essential, number>;

export function analyzeFifteen(homes: Home[], places: Record<Essential, Place[]>): FifteenResult {
  const idx = Object.fromEntries(ESSENTIALS.map((e) => [e.id, new NearestIndex(places[e.id])])) as Record<Essential, NearestIndex>;
  const out = homes.map((h) => ({ ...h, ...accessFrom(h.at, idx) }));

  const acc = new Map<string, { pop: number; full: number; score: number; by: Record<Essential, number> }>();
  const city = { pop: 0, full: 0, score: 0, by: emptyBy() };
  for (const h of out) {
    const a = acc.get(h.barrio) ?? acc.set(h.barrio, { pop: 0, full: 0, score: 0, by: emptyBy() }).get(h.barrio)!;
    for (const t of [a, city]) {
      t.pop += h.pop;
      t.score += h.score * h.pop;
      if (h.score === ESSENTIALS.length) t.full += h.pop;
      for (const { id } of ESSENTIALS) if (h.minutes[id] <= LIMIT_MIN) t.by[id] += h.pop;
    }
  }
  const pct = (x: number, total: number) => (total ? (100 * x) / total : 0);
  const barrios = new Map<string, BarrioResult>();
  for (const [name, a] of acc) {
    const byEssential = Object.fromEntries(ESSENTIALS.map((e) => [e.id, pct(a.by[e.id], a.pop)])) as Record<Essential, number>;
    const weakest = ESSENTIALS.reduce((w, e) => (byEssential[e.id] < byEssential[w] ? e.id : w), ESSENTIALS[0].id);
    barrios.set(name, { name, pop: a.pop, full: pct(a.full, a.pop), avgScore: a.pop ? a.score / a.pop : 0, byEssential, weakest });
  }
  return {
    homes: out,
    barrios,
    city: {
      pop: city.pop, full: pct(city.full, city.pop), avgScore: city.pop ? city.score / city.pop : 0,
      byEssential: Object.fromEntries(ESSENTIALS.map((e) => [e.id, pct(city.by[e.id], city.pop)])) as Record<Essential, number>,
    },
  };
}

/** Punto dentro de polígono (anillo exterior; los huecos se ignoran a esta escala). */
export function inRing(p: LngLat, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
