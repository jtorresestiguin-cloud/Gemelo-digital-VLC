/**
 * Autobuses de la EMT de València en tiempo real (Geoportal, servicio EMT/Seguimiento_EMT).
 *
 * La capa de posiciones solo publica línea, trayecto, hora y punto: no hay identificador
 * de vehículo, velocidad ni rumbo. BusTracker reconstruye el movimiento emparejando cada
 * lectura con el autobús más cercano de la misma línea y trayecto en la lectura anterior.
 */
import { distanceKm, zoneFor } from '../core/geo';
import type { BusRoute, BusStop, BusTrack, LngLat } from '../core/types';
import { GEOPORTAL, fetchLayer, type GeoCollection } from '../adapters/geoportal';

const EMT_SERVICE = 'https://geoportal.valencia.es/server/rest/services/EMT/Seguimiento_EMT/MapServer';
export const EMT_BUSES_LAYER = `${EMT_SERVICE}/384`;
export const EMT_STOPS_LAYER = 'Trafico/MapServer/226';

export interface BusReading {
  line: string;
  trip: string;
  lngLat: LngLat;
  ts: number;
}

export function parseBuses(fc: GeoCollection): BusReading[] {
  const out: BusReading[] = [];
  for (const f of fc.features) {
    if (f.geometry?.type !== 'Point') continue;
    const p = f.properties ?? {};
    const lngLat = f.geometry.coordinates as LngLat;
    if (!Number.isFinite(lngLat[0]) || !Number.isFinite(lngLat[1])) continue;
    out.push({
      line: String(p.linea ?? '?').trim(),
      trip: String(p.trayecto ?? '').trim(),
      lngLat,
      ts: Number(p.fecha) || 0,
    });
  }
  return out;
}

/** Rumbo inicial de a → b en grados (0 = norte, 90 = este). */
export function bearing(a: LngLat, b: LngLat): number {
  const r = Math.PI / 180;
  const y = Math.sin((b[0] - a[0]) * r) * Math.cos(b[1] * r);
  const x = Math.cos(a[1] * r) * Math.sin(b[1] * r) - Math.sin(a[1] * r) * Math.cos(b[1] * r) * Math.cos((b[0] - a[0]) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
}

interface Internal extends BusTrack {
  lastSeen: number;
}

export class BusTracker {
  private tracks = new Map<string, Internal>();
  private seq = 0;

  constructor(
    private opts = { trailLength: 8, maxSpeedKmh: 90, minGapKm: 0.4, dropAfterMs: 3 * 60_000 },
  ) {}

  /** Incorpora una lectura completa y devuelve los autobuses activos. */
  update(readings: BusReading[], now: number): BusTrack[] {
    const used = new Set<string>();
    const pairs: { track: Internal; reading: BusReading; d: number }[] = [];
    // candidatos: misma línea y trayecto, a una distancia plausible para el tiempo transcurrido
    readings.forEach((reading) => {
      for (const track of this.tracks.values()) {
        if (track.line !== reading.line || track.trip !== reading.trip) continue;
        const d = distanceKm(track.to, reading.lngLat);
        const dtH = Math.max(0, (reading.ts - track.ts) / 3_600_000);
        if (d <= Math.max(this.opts.minGapKm, this.opts.maxSpeedKmh * dtH)) pairs.push({ track, reading, d });
      }
    });
    // emparejamiento voraz por cercanía
    pairs.sort((a, b) => a.d - b.d);
    const matched = new Map<BusReading, Internal>();
    for (const p of pairs) {
      if (used.has(p.track.id) || matched.has(p.reading)) continue;
      used.add(p.track.id);
      matched.set(p.reading, p.track);
    }

    for (const reading of readings) {
      const t = matched.get(reading);
      if (!t) {
        const id = `bus-${++this.seq}`;
        this.tracks.set(id, {
          id, line: reading.line, trip: reading.trip, from: reading.lngLat, to: reading.lngLat,
          receivedAt: now, ts: reading.ts, speedKmh: 0, heading: 0, trail: [reading.lngLat],
          zoneId: zoneFor(reading.lngLat), lastSeen: now,
        });
        continue;
      }
      const moved = distanceKm(t.to, reading.lngLat);
      const dtH = (reading.ts - t.ts) / 3_600_000;
      if (dtH > 0) {
        t.speedKmh = Math.min(this.opts.maxSpeedKmh, moved / dtH);
        if (moved > 0.005) t.heading = bearing(t.to, reading.lngLat);
      }
      t.from = t.to;
      t.to = reading.lngLat;
      if (moved > 0.002) t.trail = [...t.trail, reading.lngLat].slice(-this.opts.trailLength);
      t.ts = Math.max(t.ts, reading.ts);
      t.receivedAt = now;
      t.lastSeen = now;
      t.zoneId = zoneFor(reading.lngLat);
    }

    for (const [id, t] of this.tracks) if (now - t.lastSeen > this.opts.dropAfterMs) this.tracks.delete(id);
    return [...this.tracks.values()].filter((t) => t.lastSeen === now).map(({ lastSeen: _ignored, ...t }) => t);
  }
}

async function fetchJson<T>(url: string, timeoutMs = 20_000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as T & { error?: { message?: string } };
    if (j.error) throw new Error(j.error.message ?? 'error del servidor');
    return j;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchBusPositions(): Promise<BusReading[]> {
  const q = new URLSearchParams({ where: '1=1', outFields: 'linea,trayecto,fecha', outSR: '4326', f: 'geojson' });
  return parseBuses(await fetchJson<GeoCollection>(`${EMT_BUSES_LAYER}/query?${q}`, 15_000));
}

export function parseStops(fc: GeoCollection): BusStop[] {
  const out: BusStop[] = [];
  for (const f of fc.features) {
    const p = f.properties ?? {};
    if (f.geometry?.type !== 'Point' || Number(p.suprimida) === 1) continue;
    out.push({
      id: String(p.id_parada ?? p.gid),
      name: String(p.denominacion ?? 'Parada'),
      lines: String(p.lineas ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      lngLat: f.geometry.coordinates as LngLat,
      arrivalsUrl: typeof p.proximas_llegadas === 'string' ? p.proximas_llegadas.replace(/^http:/, 'https:') : undefined,
    });
  }
  return out;
}

export const fetchStops = async () => parseStops(await fetchLayer(EMT_STOPS_LAYER));

interface ServiceLayer { id: number; name: string; parentLayerId: number; subLayerIds: number[] | null }

/** Encuentra, para cada línea, la subcapa «Ruta» dentro del servicio de seguimiento. */
export function routeLayersByLine(layers: ServiceLayer[]): { line: string; layerId: number }[] {
  const byId = new Map(layers.map((l) => [l.id, l]));
  const out: { line: string; layerId: number }[] = [];
  for (const g of layers) {
    if (!g.subLayerIds?.length) continue;
    const m = g.name.match(/^l[ií]nea\s+(.+)$/i);
    if (!m) continue;
    const ruta = g.subLayerIds.map((id) => byId.get(id)).find((l) => l && /^ruta$/i.test(l.name.trim()));
    if (ruta) out.push({ line: m[1].trim(), layerId: ruta.id });
  }
  return out;
}

/** Trazado de todas las líneas (geometría simplificada en el servidor, ~5 m). */
export async function fetchRoutes(concurrency = 6): Promise<BusRoute[]> {
  const svc = await fetchJson<{ layers: ServiceLayer[] }>(`${EMT_SERVICE}?f=json`);
  const todo = routeLayersByLine(svc.layers ?? []);
  const out: BusRoute[] = [];
  const q = new URLSearchParams({ where: '1=1', outFields: 'id_linea', outSR: '4326', f: 'geojson', maxAllowableOffset: '0.00005', geometryPrecision: '5' });
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const { line, layerId } = todo[i++];
      try {
        const fc = await fetchJson<GeoCollection>(`${EMT_SERVICE}/${layerId}/query?${q}`);
        const coords: LngLat[][] = [];
        for (const f of fc.features) {
          if (f.geometry?.type === 'LineString') coords.push(f.geometry.coordinates as LngLat[]);
          else if (f.geometry?.type === 'MultiLineString') coords.push(...(f.geometry.coordinates as LngLat[][]));
        }
        if (coords.length) out.push({ line, coords });
      } catch {
        /* una línea que falla no impide dibujar las demás */
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out.sort((a, b) => a.line.localeCompare(b.line, 'es', { numeric: true }));
}

export { GEOPORTAL };
