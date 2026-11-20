/**
 * Trayectoria de cámara de un recorrido: vuelos suaves entre paradas (suben al alejarse y
 * bajan al llegar) y un giro lento alrededor de cada parada. Función pura del tiempo,
 * así que el vídeo es reproducible fotograma a fotograma.
 */
import { distanceKm } from '../core/geo';
import type { LngLat } from '../core/types';
import type { Tour, TourStop } from './tours';

export interface CameraState {
  center: LngLat;
  zoom: number;
  pitch: number;
  bearing: number;
}

interface Segment {
  kind: 'hold' | 'fly';
  start: number;
  duration: number;
  from: TourStop;
  to: TourStop;
  index: number;
}

/** Grados que gira la cámara por segundo mientras «se queda» en una parada. */
const ORBIT_DEG_PER_S = 6;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const shortestAngle = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180;

/** Duración del vuelo entre dos paradas según la distancia y el cambio de zoom (segundos). */
export function flightSeconds(a: TourStop, b: TourStop): number {
  const km = distanceKm(a.center, b.center);
  return Math.min(9, Math.max(3.2, 2.4 + km * 0.9 + Math.abs(a.zoom - b.zoom) * 0.35));
}

export function buildTimeline(tour: Tour): { segments: Segment[]; duration: number } {
  const segments: Segment[] = [];
  let t = 0;
  tour.stops.forEach((stop, i) => {
    const hold = stop.hold ?? 3;
    if (hold > 0) {
      segments.push({ kind: 'hold', start: t, duration: hold, from: stop, to: stop, index: i });
      t += hold;
    }
    const next = tour.stops[i + 1];
    if (next) {
      const d = flightSeconds(stop, next);
      segments.push({ kind: 'fly', start: t, duration: d, from: stop, to: next, index: i });
      t += d;
    }
  });
  return { segments, duration: t };
}

/** Rumbo con el que termina el giro sobre una parada. */
const endBearing = (s: TourStop) => s.bearing + (s.hold ?? 3) * ORBIT_DEG_PER_S;

export interface TourFrame {
  camera: CameraState;
  /** parada cuyo rótulo se muestra (la actual o la de destino en la segunda mitad del vuelo) */
  stopIndex: number;
  /** 0..1 dentro del tramo de parada (para fundir los rótulos) */
  holdProgress: number;
  done: boolean;
}

export function cameraAt(_tour: Tour, timeline: ReturnType<typeof buildTimeline>, seconds: number): TourFrame {
  const t = Math.max(0, seconds);
  const seg = timeline.segments.find((s) => t < s.start + s.duration) ?? timeline.segments[timeline.segments.length - 1];
  const k = seg.duration > 0 ? Math.min(1, (t - seg.start) / seg.duration) : 1;
  const done = t >= timeline.duration;
  if (seg.kind === 'hold') {
    const s = seg.from;
    return {
      camera: { center: s.center, zoom: s.zoom, pitch: s.pitch, bearing: s.bearing + (t - seg.start) * ORBIT_DEG_PER_S },
      stopIndex: seg.index,
      holdProgress: k,
      done,
    };
  }
  const e = easeInOut(k);
  const a = seg.from, b = seg.to;
  const km = distanceKm(a.center, b.center);
  // «salto» de zoom a mitad del vuelo, mayor cuanto más lejos están las paradas
  const bump = Math.min(2.2, km * 0.45) * Math.sin(Math.PI * e);
  const fromBearing = endBearing(a);
  return {
    camera: {
      center: [lerp(a.center[0], b.center[0], e), lerp(a.center[1], b.center[1], e)],
      zoom: lerp(a.zoom, b.zoom, e) - bump,
      pitch: lerp(a.pitch, b.pitch, e) - 10 * Math.sin(Math.PI * e),
      bearing: fromBearing + shortestAngle(fromBearing, b.bearing) * e,
    },
    stopIndex: k < 0.5 ? seg.index : seg.index + 1,
    holdProgress: k < 0.5 ? 1 : 0,
    done,
  };
}
