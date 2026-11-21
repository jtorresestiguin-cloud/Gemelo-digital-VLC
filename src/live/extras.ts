/**
 * Más datos en vivo de la ciudad, cada uno se descarga solo cuando se activa:
 *  - Aparcamientos públicos con plazas libres (Geoportal, Trafico/194)
 *  - Previsión de ocupación del aparcamiento regulado en calle a 1, 6, 12 y 24 h (Trafico/254, 253, 252, 4)
 *  - Obras y ocupaciones de la vía pública vigentes (Trafico/235)
 *  - Estaciones de Metrovalencia con enlace a sus próximos trenes (Trafico/221)
 *  - Calidad de las aguas de baño de cada playa (Agencia Europea de Medio Ambiente, última temporada)
 *  - Ruido: sonómetros de Russafa, nivel del día anterior (plataforma VLCi)
 *  - Estado del mar (temperatura del agua y oleaje) y polen + índice UV (Open-Meteo)
 */
import type { FeatureCollection } from 'geojson';
import { fetchLayer, type GeoCollection } from '../adapters/geoportal';
import type { LngLat } from '../core/types';

export type ExtraLayer = 'parking' | 'forecast' | 'works' | 'metro' | 'beaches' | 'noise';
export type ForecastHorizon = 1 | 6 | 12 | 24;

export interface Sea { water: number; wave: number; period?: number; at: number }
export interface Sky { uv: number; pollen: { name: string; value: number }[]; at: number }

export interface ExtrasState {
  geo: Partial<Record<ExtraLayer, FeatureCollection>>;
  /** resumen corto por capa para el panel */
  info: Partial<Record<ExtraLayer, string>>;
  updated: Partial<Record<ExtraLayer | 'sea' | 'sky', number>>;
  errors: Partial<Record<ExtraLayer | 'sea' | 'sky', string>>;
  horizon: ForecastHorizon;
  sea?: Sea;
  sky?: Sky;
}

const MIN = 60_000;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : undefined);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const titleCase = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s(«"'/-])(\p{L})/gu, (m) => m.toUpperCase()) : s);
const fc = (features: FeatureCollection['features']): FeatureCollection => ({ type: 'FeatureCollection', features });

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

/** Aparcamientos: solo hay dato en vivo si se actualizó hace menos de 6 h y las plazas libres no son negativas. */
export function parseParkings(g: GeoCollection, now = Date.now()): { geo: FeatureCollection; info: string } {
  let live = 0;
  let free = 0;
  const features = g.features.flatMap((f) => {
    if (f.geometry?.type !== 'Point') return [];
    const p = f.properties;
    const total = num(p.plazastota) ?? 0;
    const libres = num(p.plazaslibr);
    const at = num(p.ultima_mod);
    const isLive = libres !== undefined && libres >= 0 && total > 0 && !!at && now - at < 6 * 3600_000;
    if (isLive) { live++; free += libres!; }
    return [{
      type: 'Feature' as const,
      geometry: f.geometry as FeatureCollection['features'][number]['geometry'],
      properties: {
        kind: 'parking', name: titleCase(str(p.nombre) ?? 'Aparcamiento'), address: str(p.direccion) ?? '',
        total, free: isLive ? libres : -1, ratio: isLive ? libres! / total : -1, live: isLive, at: at ?? 0,
      },
    }];
  });
  return { geo: fc(features), info: `${live} de ${features.length} con plazas en vivo · ${free.toLocaleString('es-ES')} libres` };
}

const FORECAST_LAYER: Record<ForecastHorizon, [string, string]> = {
  1: ['Trafico/MapServer/254', 'ocupacion_1'],
  6: ['Trafico/MapServer/253', 'ocupacion_6'],
  12: ['Trafico/MapServer/252', 'ocupacion_12'],
  24: ['Trafico/MapServer/4', 'ocupacion_24'],
};

export function parseForecast(g: GeoCollection, field: string): { geo: FeatureCollection; info: string } {
  const vals: number[] = [];
  const features = g.features.flatMap((f) => {
    const occ = num(f.properties[field]);
    if (!f.geometry || occ === undefined) return [];
    vals.push(occ);
    return [{ type: 'Feature' as const, geometry: f.geometry as FeatureCollection['features'][number]['geometry'], properties: { kind: 'forecast', name: str(f.properties.nombre_via) ?? 'Calle', occ } }];
  });
  const full = vals.filter((v) => v >= 85).length;
  const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  return { geo: fc(features), info: `${features.length} calles · ocupación media ${avg} %${full ? ` · ${full} casi llenas` : ''}` };
}

const fmtDate = (t?: number) => (t ? new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export function parseWorks(g: GeoCollection): { geo: FeatureCollection; info: string } {
  const features = g.features.flatMap((f) => {
    if (!f.geometry) return [];
    const p = f.properties;
    const what = titleCase(str(p.ocupacion) ?? 'Ocupación de la vía pública');
    return [{
      type: 'Feature' as const,
      geometry: f.geometry as FeatureCollection['features'][number]['geometry'],
      properties: { kind: 'works', name: 'Obras en la vía pública', what, from: fmtDate(num(p.fecha_inicio_periodo)), to: fmtDate(num(p.fecha_fin_periodo)), road: /calzada/i.test(what) },
    }];
  });
  const road = features.filter((f) => f.properties.road).length;
  return { geo: fc(features), info: `${features.length} vigentes${road ? ` · ${road} ocupan calzada` : ''}` };
}

export function parseMetro(g: GeoCollection): { geo: FeatureCollection; info: string } {
  const lines = new Set<string>();
  const features = g.features.flatMap((f) => {
    if (f.geometry?.type !== 'Point') return [];
    const p = f.properties;
    const linea = str(p.linea) ?? '';
    linea.split(',').map((l) => l.trim()).filter(Boolean).forEach((l) => lines.add(l));
    const url = str(p.proximas_llegadas);
    return [{
      type: 'Feature' as const,
      geometry: f.geometry as FeatureCollection['features'][number]['geometry'],
      properties: { kind: 'metro-station', name: str(p.nombre) ?? 'Estación', lines: linea, code: str(p.codigo) ?? '', url: url && /^https:\/\//.test(url) ? url : '' },
    }];
  });
  return { geo: fc(features), info: `${features.length} estaciones · líneas ${[...lines].sort((a, b) => Number(a) - Number(b)).join(', ')}` };
}

/** Clasificación oficial de las aguas de baño (Directiva 2006/7/CE), servicio de la AEMA. */
const EEA_YEAR = 2025;
const EEA = `https://water.discomap.eea.europa.eu/arcgis/rest/services/BathingWater/BathingWater_Dyna_WM_${EEA_YEAR}/MapServer/3/query`;
export const BATHING_LABEL: Record<string, string> = { Excellent: 'Excelente', Good: 'Buena', Sufficient: 'Suficiente', Poor: 'Insuficiente' };

export async function fetchBeaches(): Promise<{ geo: FeatureCollection; info: string }> {
  const p = new URLSearchParams({
    geometry: '-0.36,39.28,-0.29,39.50', geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: 'bathingWaterName,qualityStatus,qualityStatus_minus1,qualityStatus_minus2,longitude,latitude', returnGeometry: 'false', f: 'json',
  });
  const j = await getJson<{ features: { attributes: Record<string, unknown> }[] }>(`${EEA}?${p}`);
  return parseBeaches(j.features.map((f) => f.attributes));
}

export function parseBeaches(rows: Record<string, unknown>[]): { geo: FeatureCollection; info: string } {
  const features = rows.flatMap((a) => {
    const lng = num(a.longitude);
    const lat = num(a.latitude);
    // al norte de 39,485 ya es Alboraia (Patacona, Peixets)
    if (lng === undefined || lat === undefined || lat > 39.485) return [];
    const q = str(a.qualityStatus) ?? '';
    const name = titleCase(str(a.bathingWaterName) ?? 'Playa').replace(/\s+Pm\d+$/i, '').replace(/(?<= )(De|Del|La|Dels|Els|Les)(?= )/g, (m) => m.toLowerCase()).replace(/-Rosa/, '-rosa');
    return [{
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [lng, lat] },
      properties: {
        kind: 'beach', name, quality: q, label: BATHING_LABEL[q] ?? (q || 'Sin clasificar'), year: EEA_YEAR,
        history: [str(a.qualityStatus_minus1), str(a.qualityStatus_minus2)].map((x) => (x ? BATHING_LABEL[x] ?? x : '')).join(' · '),
      },
    }];
  });
  const exc = features.filter((f) => f.properties.quality === 'Excellent').length;
  return { geo: fc(features), info: `${exc} de ${features.length} puntos con calidad excelente (temporada ${EEA_YEAR})` };
}

/** Frente a la playa de la Malva-rosa (la rejilla marina más cercana está mar adentro). */
const SEA_AT: LngLat = [-0.31, 39.47];

export async function fetchSea(): Promise<Sea> {
  const j = await getJson<{ current: Record<string, number> }>(
    `https://marine-api.open-meteo.com/v1/marine?latitude=${SEA_AT[1]}&longitude=${SEA_AT[0]}&current=wave_height,wave_period,sea_surface_temperature&timezone=Europe%2FMadrid`,
  );
  return { water: j.current.sea_surface_temperature, wave: j.current.wave_height, period: j.current.wave_period, at: Date.now() };
}

const POLLEN: Record<string, string> = {
  alder_pollen: 'aliso', birch_pollen: 'abedul', grass_pollen: 'gramíneas', mugwort_pollen: 'artemisa', olive_pollen: 'olivo', ragweed_pollen: 'ambrosía',
};

export async function fetchSky(): Promise<Sky> {
  const j = await getJson<{ current: Record<string, number | null> }>(
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=39.47&longitude=-0.376&current=uv_index,${Object.keys(POLLEN).join(',')}&timezone=Europe%2FMadrid`,
  );
  const pollen = Object.entries(POLLEN).map(([k, name]) => ({ name, value: j.current[k] ?? 0 })).sort((a, b) => b.value - a.value);
  return { uv: j.current.uv_index ?? 0, pollen, at: Date.now() };
}

/** Nivel de polen (granos/m³) en palabras, con los umbrales habituales de las redes aerobiológicas. */
export function pollenLevel(v: number): string {
  if (v < 1) return 'muy bajo';
  if (v < 20) return 'bajo';
  if (v < 50) return 'moderado';
  if (v < 200) return 'alto';
  return 'muy alto';
}

export function uvLevel(uv: number): string {
  if (uv < 3) return 'bajo';
  if (uv < 6) return 'moderado';
  if (uv < 8) return 'alto';
  if (uv < 11) return 'muy alto';
  return 'extremo';
}

/** Gestor: refresca solo lo activado y avisa a quien escuche (panel y mapa). */
class Extras {
  private state: ExtrasState = { geo: {}, info: {}, updated: {}, errors: {}, horizon: 1 };
  private listeners = new Set<() => void>();
  private timers = new Map<string, ReturnType<typeof setInterval>>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  get = () => this.state;
  private set(patch: (s: ExtrasState) => Partial<ExtrasState>) {
    this.state = { ...this.state, ...patch(this.state) };
    this.listeners.forEach((l) => l());
  }

  private async load(id: ExtraLayer | 'sea' | 'sky') {
    try {
      if (id === 'sea') {
        const sea = await fetchSea();
        this.set((s) => ({ sea, updated: { ...s.updated, sea: Date.now() }, errors: { ...s.errors, sea: undefined } }));
        return;
      }
      if (id === 'sky') {
        const sky = await fetchSky();
        this.set((s) => ({ sky, updated: { ...s.updated, sky: Date.now() }, errors: { ...s.errors, sky: undefined } }));
        return;
      }
      const r =
        id === 'parking' ? parseParkings(await fetchLayer('Trafico/MapServer/194'))
        : id === 'works' ? parseWorks(await fetchLayer('Trafico/MapServer/235', { where: 'fecha_fin_periodo >= CURRENT_TIMESTAMP AND fecha_inicio_periodo <= CURRENT_TIMESTAMP' }))
        : id === 'metro' ? parseMetro(await fetchLayer('Trafico/MapServer/221'))
        : id === 'beaches' ? await fetchBeaches()
        : id === 'noise' ? await fetchNoise()
        : parseForecast(await fetchLayer(FORECAST_LAYER[this.state.horizon][0]), FORECAST_LAYER[this.state.horizon][1]);
      this.set((s) => ({ geo: { ...s.geo, [id]: r.geo }, info: { ...s.info, [id]: r.info }, updated: { ...s.updated, [id]: Date.now() }, errors: { ...s.errors, [id]: undefined } }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.set((s) => ({ errors: { ...s.errors, [id]: msg } }));
    }
  }

  /** Activa (o desactiva) una fuente; se refresca sola mientras esté activa. */
  enable(id: ExtraLayer | 'sea' | 'sky', on: boolean) {
    const every = { parking: 3 * MIN, forecast: 30 * MIN, works: 60 * MIN, metro: 24 * 60 * MIN, beaches: 24 * 60 * MIN, noise: 60 * MIN, sea: 15 * MIN, sky: 30 * MIN }[id];
    if (!on) {
      clearInterval(this.timers.get(id));
      this.timers.delete(id);
      return;
    }
    if (this.timers.has(id)) return;
    void this.load(id);
    this.timers.set(id, setInterval(() => void this.load(id), every));
  }

  setHorizon(h: ForecastHorizon) {
    this.set(() => ({ horizon: h }));
    if (this.timers.has('forecast')) void this.load('forecast');
  }
}

export const extras = new Extras();

export interface MetroDeparture { line: string; route: string; to: string; time: string }

/** Próximos trenes: página pública del Geoportal (admite peticiones desde el navegador). */
export function parseDepartures(html: string): MetroDeparture[] {
  const out: MetroDeparture[] = [];
  const re = /linea_metro_(\w+)\.png[\s\S]*?<span>([^<]*)<\/span>,\s*<span>[^<]*<\/span>\s*<b>([^<]*)<\/b>\s*-\s*<span>(\d{1,2}:\d{2})(?::\d{2})?<\/span>/g;
  for (const m of html.matchAll(re)) out.push({ line: m[1], route: m[2].trim(), to: m[3].trim(), time: m[4] });
  return out;
}

export async function fetchDepartures(url: string): Promise<MetroDeparture[]> {
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return parseDepartures(await r.text());
}

/** Sonómetros de Russafa (plataforma VLCi): ubicación publicada en el catálogo de datos abiertos. */
export const NOISE_SENSORS: { id: string; street: string; at: LngLat }[] = [
  { id: 'T248680', street: 'Sueca, 32', at: [-0.3751468, 39.4613594] },
  { id: 'T248684', street: 'Sueca, 61', at: [-0.3741152, 39.4605601] },
  { id: 'T248683', street: 'Sueca, 2', at: [-0.3766378, 39.4633107] },
  { id: 'T248682', street: 'Cuba, 3', at: [-0.3775977, 39.4628861] },
  { id: 'T248655', street: 'Cádiz, 3', at: [-0.3750515, 39.4640447] },
  { id: 'T248671', street: 'Cádiz, 16', at: [-0.3746647, 39.4631424] },
  { id: 'T248652', street: 'Sueca esq. Dénia', at: [-0.3758885, 39.4628376] },
  { id: 'T248672', street: 'Puerto Rico, 21', at: [-0.3761412, 39.4609867] },
  { id: 'T248669', street: 'Doctor Serrano, 21', at: [-0.3737807, 39.4626872] },
  { id: 'T248678', street: 'Carles Cervera, 34', at: [-0.3727962, 39.4615883] },
  { id: 'T248677', street: 'Vivons chaflán Cádiz', at: [-0.3721407, 39.4599927] },
  { id: 'T248679', street: 'Matías Perelló esq. Doctor Sumsi', at: [-0.3681443, 39.4614718] },
  { id: 'T248661', street: 'General Prim chaflán Donoso Cortés', at: [-0.3704271, 39.4625622] },
  { id: 'T248676', street: 'Salvador Abril chaflán Maestro José Serrano', at: [-0.3706022, 39.4635655] },
  { id: 'T248670', street: 'Carles Cervera chaflán Reina Doña María', at: [-0.372886, 39.4613005] },
  { id: 'T251234', street: 'Cura Femenía, 14', at: [-0.3732538, 39.46227] },
];

const NOISE_URL = (id: string) =>
  `https://datosbi.vlci.valencia.es/pentaho/plugin/cda/api/doQuery?path=/public/vlci/datosabiertos/calidadambiental_sonometros_ruzafa_diarios.cda&dataAccessId=sqlSonometrosRuzafaDaily&paramid=${id}-daily&outputType=json&_TRUST_USER_=publicoda&paginateQuery=true&pageSize=1&pageStart=0`;

export async function fetchNoise(): Promise<{ geo: FeatureCollection; info: string }> {
  const rows = await Promise.all(NOISE_SENSORS.map(async (s) => {
    try {
      const j = await getJson<{ resultset: unknown[][] }>(NOISE_URL(s.id));
      const r = j.resultset?.[0];
      return r ? { s, den: num(r[5]), day: num(r[4]), evening: num(r[6]), night: num(r[7]), date: str(r[8]) } : undefined;
    } catch {
      return undefined;
    }
  }));
  const ok = rows.filter((r): r is NonNullable<typeof r> => !!r && r.den !== undefined);
  if (!ok.length) throw new Error('sin datos de los sonómetros');
  const features = ok.map((r) => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: r.s.at },
    properties: { kind: 'noise-live', name: `Sonómetro ${r.s.street}`, den: r.den!, day: r.day ?? -1, evening: r.evening ?? -1, night: r.night ?? -1, date: r.date ?? '' },
  }));
  const loud = features.filter((f) => f.properties.night > 55).length;
  return { geo: fc(features), info: `${features.length} sonómetros en Russafa${loud ? ` · ${loud} superan 55 dB de noche` : ''}` };
}
