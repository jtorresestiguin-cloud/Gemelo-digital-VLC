/**
 * Guiones de recorridos aéreos. Un guion es un JSON sencillo (paradas con cámara y rótulo),
 * así que se puede escribir a mano, pedírselo a Claude o generarlo a partir de los datos.
 */
import type { LngLat, PublicService } from '../core/types';
import { distanceKm } from '../core/geo';

export interface TourStop {
  name: string;
  subtitle?: string;
  center: LngLat;
  zoom: number;
  pitch: number;
  bearing: number;
  /** segundos que la cámara se queda girando alrededor de la parada */
  hold?: number;
}

export interface Tour {
  id: string;
  title: string;
  description?: string;
  stops: TourStop[];
}

export const LANDMARK_TOUR: Tour = {
  id: 'vuelo-valencia',
  title: 'Vuelo por València',
  description: 'Del casco histórico al mar, siguiendo el antiguo cauce del Túria.',
  stops: [
    { name: 'València', subtitle: 'Gemelo digital de la ciudad', center: [-0.3740, 39.4720], zoom: 12.4, pitch: 45, bearing: -20, hold: 2 },
    { name: 'Torres de Serrans', subtitle: 'Puerta de la muralla medieval · 1392', center: [-0.3758, 39.4792], zoom: 16.6, pitch: 65, bearing: 150, hold: 3 },
    { name: 'Catedral i Micalet', subtitle: 'El campanario gótico de la ciudad', center: [-0.3753, 39.4755], zoom: 17, pitch: 68, bearing: 200, hold: 3.5 },
    { name: 'Llotja i Mercat Central', subtitle: 'Patrimonio de la Humanidad y modernismo valenciano', center: [-0.3786, 39.4740], zoom: 16.8, pitch: 66, bearing: 250, hold: 3.5 },
    { name: "Plaça de l'Ajuntament", subtitle: 'El corazón de la ciudad', center: [-0.3765, 39.4697], zoom: 16.5, pitch: 62, bearing: 300, hold: 3 },
    { name: 'Estació del Nord', subtitle: 'Modernismo de principios del siglo XX', center: [-0.3773, 39.4664], zoom: 16.8, pitch: 64, bearing: 340, hold: 3 },
    { name: 'Jardí del Túria', subtitle: 'Nueve kilómetros de jardín en el antiguo cauce', center: [-0.3640, 39.4690], zoom: 15, pitch: 60, bearing: 60, hold: 3 },
    { name: 'Ciutat de les Arts i les Ciències', subtitle: "L'Hemisfèric, el Museu i el Palau de les Arts", center: [-0.3510, 39.4555], zoom: 16, pitch: 66, bearing: 110, hold: 4.5 },
    { name: 'Port de València', subtitle: 'Uno de los mayores puertos del Mediterráneo', center: [-0.3220, 39.4480], zoom: 14.6, pitch: 60, bearing: 160, hold: 3.5 },
    { name: 'La Marina i la Malva-rosa', subtitle: 'El frente marítimo', center: [-0.3255, 39.4640], zoom: 15, pitch: 62, bearing: 240, hold: 3 },
    { name: 'València', subtitle: 'Gemelo Digital València', center: [-0.3640, 39.4700], zoom: 12.8, pitch: 50, bearing: 290, hold: 3 },
  ],
};

/** Valida un guion cargado desde un archivo JSON y lo normaliza. */
export function parseTour(json: unknown): Tour {
  const t = json as Partial<Tour>;
  if (!t || typeof t !== 'object' || !Array.isArray(t.stops) || t.stops.length < 2) {
    throw new Error('El guion necesita al menos dos paradas («stops»)');
  }
  const num = (v: unknown, def: number, lo: number, hi: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
  };
  const stops = t.stops.map((s, i): TourStop => {
    const c = (s as TourStop).center;
    if (!Array.isArray(c) || c.length !== 2 || !c.every((v) => Number.isFinite(Number(v)))) {
      throw new Error(`La parada ${i + 1} no tiene unas coordenadas «center» válidas [lng, lat]`);
    }
    const [lng, lat] = [Number(c[0]), Number(c[1])];
    if (Math.abs(lng) > 180 || Math.abs(lat) > 85) throw new Error(`La parada ${i + 1} tiene coordenadas fuera de rango`);
    return {
      name: String((s as TourStop).name ?? `Parada ${i + 1}`),
      subtitle: (s as TourStop).subtitle ? String((s as TourStop).subtitle) : undefined,
      center: [lng, lat],
      zoom: num((s as TourStop).zoom, 15.5, 3, 20),
      pitch: num((s as TourStop).pitch, 60, 0, 75),
      bearing: num((s as TourStop).bearing, 0, -360, 360),
      hold: num((s as TourStop).hold, 3, 0, 30),
    };
  });
  return { id: String(t.id ?? 'guion-propio'), title: String(t.title ?? 'Recorrido'), description: t.description ? String(t.description) : undefined, stops };
}

/** Ordena paradas para un recorrido corto (vecino más próximo desde la más al oeste). */
function orderByProximity<T extends { lngLat: LngLat }>(items: T[]): T[] {
  if (items.length < 3) return items;
  const rest = [...items];
  rest.sort((a, b) => a.lngLat[0] - b.lngLat[0]);
  const out = [rest.shift()!];
  while (rest.length) {
    const last = out[out.length - 1].lngLat;
    let bi = 0;
    rest.forEach((x, i) => { if (distanceKm(last, x.lngLat) < distanceKm(last, rest[bi].lngLat)) bi = i; });
    out.push(rest.splice(bi, 1)[0]);
  }
  return out;
}

/**
 * Recorrido generado con los datos del gemelo (p. ej. hospitales públicos o mercados).
 * Las cámaras van rotando para que cada parada se vea desde otro ángulo.
 */
export function tourFromServices(services: PublicService[], opts: { title: string; filter: (s: PublicService) => boolean; max?: number }): Tour | undefined {
  const picked = orderByProximity(services.filter(opts.filter)).slice(0, opts.max ?? 8);
  if (picked.length < 2) return undefined;
  const mid: LngLat = [picked.reduce((a, s) => a + s.lngLat[0], 0) / picked.length, picked.reduce((a, s) => a + s.lngLat[1], 0) / picked.length];
  return {
    id: `datos-${opts.title.toLowerCase().replace(/\s+/g, '-')}`,
    title: opts.title,
    description: 'Recorrido generado automáticamente a partir de los datos abiertos del Ajuntament.',
    stops: [
      { name: opts.title, subtitle: `${picked.length} paradas · datos abiertos del Ajuntament`, center: mid, zoom: 12.6, pitch: 45, bearing: -15, hold: 2 },
      ...picked.map((s, i): TourStop => ({
        name: s.name, subtitle: [s.kind, s.address].filter(Boolean).join(' · '),
        center: s.lngLat, zoom: 16.8, pitch: 65, bearing: (i * 67) % 360, hold: 3,
      })),
      { name: 'València', subtitle: 'Gemelo Digital València', center: mid, zoom: 12.8, pitch: 50, bearing: 40, hold: 2.5 },
    ],
  };
}
