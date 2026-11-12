/**
 * Fuentes públicas reales:
 *  - Geoportal del Ajuntament de València (capas OPENDATA, las mismas que publica
 *    opendata.vlci.valencia.es)
 *  - Open-Meteo (meteorología actual, sin clave)
 */
import { midpoint, zoneFor } from '../core/geo';
import type { AirStation, BikeStation, LngLat, TrafficSegment, TrafficState, Weather } from '../core/types';
import { VALENCIA_CENTER } from '../data/static';
import { LAYERS, fetchLayer } from './geoportal';

type Props = Record<string, unknown>;
interface Feature { geometry: { type: string; coordinates: unknown } | null; properties: Props }
interface FeatureCollection { features: Feature[] }

async function fetchJson<T>(url: string, timeoutMs = 12_000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(t);
  }
}


const num = (...vals: unknown[]): number | undefined => {
  for (const v of vals) {
    if (v === null || v === undefined || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
};
const str = (...vals: unknown[]) => vals.find((v) => typeof v === 'string' && v.trim()) as string | undefined;

/** Códigos del Ajuntament: 0 fluido, 1 denso, 2 congestionado, 3 cortado, 4 sin datos; 5–9 lo mismo en pasos inferiores. */
const TRAFFIC_STATES: TrafficState[] = ['fluid', 'dense', 'congested', 'closed', 'unknown'];

export function parseTraffic(fc: FeatureCollection): TrafficSegment[] {
  const out: TrafficSegment[] = [];
  fc.features.forEach((f, idx) => {
    if (!f.geometry) return;
    const p = f.properties ?? {};
    const code = num(p.estado);
    const state = code === undefined ? 'unknown' : TRAFFIC_STATES[code % 5] ?? 'unknown';
    const parts: LngLat[][] =
      f.geometry.type === 'LineString' ? [f.geometry.coordinates as LngLat[]]
      : f.geometry.type === 'MultiLineString' ? (f.geometry.coordinates as LngLat[][])
      : [];
    parts.forEach((coords, k) => {
      if (coords.length < 2) return;
      out.push({
        id: `${p.gid ?? p.idtramo ?? idx}-${k}`,
        name: str(p.denominacion, p.nombre) ?? 'Tramo',
        state,
        coords,
        zoneId: zoneFor(midpoint(coords)),
      });
    });
  });
  return out;
}

const pointOf = (f: Feature, p: Props): LngLat | undefined => {
  if (f.geometry?.type === 'Point') return f.geometry.coordinates as LngLat;
  const g = p.geo_point_2d as { lon?: number; lat?: number } | undefined;
  return g?.lon !== undefined && g?.lat !== undefined ? [g.lon, g.lat] : undefined;
};

export function parseBikes(fc: FeatureCollection): BikeStation[] {
  const out: BikeStation[] = [];
  fc.features.forEach((f, idx) => {
    const p = f.properties ?? {};
    const lngLat = pointOf(f, p);
    if (!lngLat) return;
    const available = num(p.available, p.bicis_disponibles) ?? 0;
    const free = num(p.free, p.espacios_libres) ?? 0;
    out.push({
      id: String(p.number ?? p.numero ?? idx),
      name: str(p.address, p.direccion) ?? `Estación ${p.number ?? idx}`,
      lngLat,
      available,
      free,
      total: num(p.total, p.espacios_totales) ?? available + free,
      zoneId: zoneFor(lngLat),
    });
  });
  return out;
}

export function parseAir(fc: FeatureCollection): AirStation[] {
  const out: AirStation[] = [];
  fc.features.forEach((f, idx) => {
    const p = f.properties ?? {};
    const lngLat = pointOf(f, p);
    if (!lngLat) return;
    out.push({
      id: String(p.objectid ?? p.id ?? idx),
      name: str(p.nombre, p.name) ?? `Estación ${idx}`,
      lngLat,
      zoneId: zoneFor(lngLat),
      no2: num(p.no2),
      pm10: num(p.pm10),
      pm25: num(p.pm25, p['pm2_5']),
      o3: num(p.o3),
      quality: str(p.calidad_ambiental, p.calidad_am),
    });
  });
  return out;
}

export const fetchTraffic = async () => parseTraffic(await fetchLayer(LAYERS.traffic));
export const fetchBikes = async () => parseBikes(await fetchLayer(LAYERS.bikes));
export const fetchAir = async () => parseAir(await fetchLayer(LAYERS.air));

export async function fetchWeather(): Promise<Weather> {
  const [lng, lat] = VALENCIA_CENTER;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,precipitation,wind_speed_10m,weather_code&timezone=Europe%2FMadrid`;
  const j = await fetchJson<{ current: Record<string, number> }>(url);
  return {
    temperature: j.current.temperature_2m,
    precipitation: j.current.precipitation ?? 0,
    windSpeed: j.current.wind_speed_10m ?? 0,
    weatherCode: j.current.weather_code ?? 0,
  };
}
