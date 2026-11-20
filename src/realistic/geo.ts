/**
 * Utilidades puras del modo realista: metros locales, teselas web, ortofoto del IGN,
 * posición del sol y tamaño de los árboles del inventario municipal.
 */
import type { LngLat } from '../core/types';

const M_PER_DEG = 111_320;

/**
 * Metros locales respecto a un origen, en el espacio de modelo de MapLibre
 * (x = este, y = arriba, z = sur), para usar con getMatrixForModel(origen).
 */
export function toLocal(origin: LngLat, p: LngLat): [number, number] {
  const k = Math.cos((origin[1] * Math.PI) / 180);
  return [(p[0] - origin[0]) * M_PER_DEG * k, -(p[1] - origin[1]) * M_PER_DEG];
}

export function fromLocal(origin: LngLat, x: number, z: number): LngLat {
  const k = Math.cos((origin[1] * Math.PI) / 180);
  return [origin[0] + x / (M_PER_DEG * k), origin[1] - z / M_PER_DEG];
}

/** Tesela (con decimales) que contiene un punto, en el esquema web Mercator. */
export function lngLatToTile(p: LngLat, z: number): [number, number] {
  const n = 2 ** z;
  const lat = (p[1] * Math.PI) / 180;
  return [((p[0] + 180) / 360) * n, ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n];
}

export function tileToLngLat(x: number, y: number, z: number): LngLat {
  const n = 2 ** z;
  const lng = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return [lng, lat];
}

/** Ortofoto PNOA de máxima actualidad (IGN): sin clave, con CORS, hasta z20 (~15 cm). */
export const pnoaTileUrl = (z: number, x: number, y: number) =>
  `https://www.ign.es/wmts/pnoa-ma?layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/jpeg&TileMatrix=${z}&TileCol=${x}&TileRow=${y}`;

/**
 * Posición del sol (algoritmo simplificado de la NOAA, error < 1°).
 * altitude: grados sobre el horizonte · azimuth: grados desde el norte en sentido horario.
 */
export function sunPosition(date: Date, lat: number, lng: number): { altitude: number; azimuth: number } {
  const rad = Math.PI / 180;
  const jd = date.getTime() / 86_400_000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 0.0000004 * n) * rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const lst = (gmst * 15 + lng) * rad;
  const ha = lst - ra;
  const phi = lat * rad;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha));
  return { altitude: alt / rad, azimuth: ((az / rad) + 360) % 360 };
}

export type TreeKind = 'broadleaf' | 'conifer' | 'palm';

export interface TreeSpec {
  lngLat: LngLat;
  kind: TreeKind;
  height: number;
  crown: number;
}

/** Punto medio de una clase «a/b» del inventario (p. ej. altura «4/8» → 6 m). */
export function classMid(v: unknown, fallback: number): number {
  const m = String(v ?? '').match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/);
  if (m) return (parseFloat(m[1].replace(',', '.')) + parseFloat(m[2].replace(',', '.'))) / 2;
  const one = String(v ?? '').match(/(\d+(?:[.,]\d+)?)/);
  return one ? parseFloat(one[1].replace(',', '.')) : fallback;
}

const PALMS = /phoenix|washingtonia|chamaerops|trachycarpus|syagrus|butia|livistona|palm/i;
const CONIFERS = /pinus|cupressus|cedrus|araucaria|abies|juniperus|taxus|thuja|conif/i;

export function treeFromRecord(props: Record<string, unknown>, lngLat: LngLat): TreeSpec {
  const name = `${props.nom_botanico ?? ''} ${props.grupo ?? ''}`;
  const kind: TreeKind = PALMS.test(name) || /palmera/i.test(String(props.grupo)) ? 'palm' : CONIFERS.test(name) ? 'conifer' : 'broadleaf';
  const height = Math.min(30, Math.max(3, classMid(props.altura, kind === 'palm' ? 9 : 7)));
  const crown = Math.min(16, Math.max(1.6, classMid(props.copa, kind === 'palm' ? 4 : 4.5)));
  return { lngLat, kind, height, crown };
}

/** Desfase (ms) de la hora de València (Europe/Madrid) respecto a UTC en un instante dado. */
export function madridOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Instante (UTC) de una hora local de València en el mismo día que `day`. */
export function madridLocalToDate(day: Date, hour: number): Date {
  const offset = madridOffsetMs(day);
  const local = new Date(day.getTime() + offset);
  const midnightLocalAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(midnightLocalAsUtc + hour * 3_600_000 - offset);
}

/** Amanecer, mediodía solar y puesta de sol en hora local de València (horas decimales). */
export function sunTimes(day: Date, lat: number, lng: number): { sunrise: number; noon: number; sunset: number } {
  let sunrise = 7, sunset = 19, noon = 13, best = -90, prev = -90;
  for (let m = 0; m <= 24 * 60; m += 2) {
    const h = m / 60;
    const alt = sunPosition(madridLocalToDate(day, h), lat, lng).altitude;
    if (m > 0 && prev < -0.83 && alt >= -0.83) sunrise = h;
    if (m > 0 && prev >= -0.83 && alt < -0.83) sunset = h;
    if (alt > best) { best = alt; noon = h; }
    prev = alt;
  }
  return { sunrise, noon, sunset };
}
