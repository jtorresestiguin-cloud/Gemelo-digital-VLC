/**
 * Datos para el análisis de la ciudad de 15 minutos (se descargan solo al activarlo):
 *  - Secciones censales y barrios (Geoportal del Ajuntament)
 *  - Población por sección censal (Padrón Municipal a 1/1/2024, Oficina d'Estadística; copia en public/data)
 *  - Manzanas residenciales (Geoportal): reparten la población de cada sección en el espacio
 *  - Zonas verdes (Geoportal, Espais Verds)
 * Los servicios esenciales salen de la capa de servicios públicos que ya carga el mapa.
 */
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { GEOPORTAL } from '../adapters/geoportal';
import type { LngLat, PublicService } from '../core/types';
import { ESSENTIALS, NearestIndex, analyzeFifteen, inRing, type Essential, type FifteenResult, type Home, type Place } from './fifteen';

const U = `${GEOPORTAL}/UrbanismoEInfraestructuras/MapServer`;
const M = `${GEOPORTAL}/MedioAmbiente/MapServer`;

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = (await r.json()) as T & { error?: { message?: string } };
  if (j.error) throw new Error(j.error.message ?? 'error del servidor');
  return j;
}

/** Consulta paginada que devuelve GeoJSON simplificado (menos peso, misma forma a escala de barrio). */
async function geo(base: string, layer: number, fields: string, offset = 0.00005): Promise<FeatureCollection> {
  const features: Feature[] = [];
  for (let page = 0; page < 10; page++) {
    const p = new URLSearchParams({
      where: '1=1', outFields: fields, outSR: '4326', f: 'geojson', maxAllowableOffset: String(offset), geometryPrecision: '5',
      resultOffset: String(features.length), resultRecordCount: '1000',
    });
    const j = await getJson<FeatureCollection & { exceededTransferLimit?: boolean; properties?: { exceededTransferLimit?: boolean } }>(`${base}/${layer}/query?${p}`);
    features.push(...j.features);
    if (!(j.exceededTransferLimit || j.properties?.exceededTransferLimit) || !j.features.length) break;
  }
  return { type: 'FeatureCollection', features };
}

/** UTM huso 30 N (ETRS89, EPSG:25830) → longitud/latitud. Precisión submétrica. */
export function utm30ToLngLat(x: number, y: number): LngLat {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const m = y / k0;
  const mu = m / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const n1 = a / Math.sqrt(1 - e2 * Math.sin(p1) ** 2);
  const t1 = Math.tan(p1) ** 2, c1 = ep2 * Math.cos(p1) ** 2;
  const r1 = (a * (1 - e2)) / (1 - e2 * Math.sin(p1) ** 2) ** 1.5;
  const d = (x - 500000) / (n1 * k0);
  const lat = p1 - ((n1 * Math.tan(p1)) / r1) * (d ** 2 / 2 - ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4) / 24
    + ((61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ep2 - 3 * c1 ** 2) * d ** 6) / 720);
  const lng = (d - ((1 + 2 * t1 + c1) * d ** 3) / 6 + ((5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * d ** 5) / 120) / Math.cos(p1);
  return [-3 + (lng * 180) / Math.PI, (lat * 180) / Math.PI];
}

const rings = (g: Polygon | MultiPolygon): LngLat[][] =>
  g.type === 'Polygon' ? [g.coordinates[0] as LngLat[]] : g.coordinates.map((p) => p[0] as LngLat[]);

function bbox(rs: LngLat[][]): [number, number, number, number] {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const r of rs) for (const [x, y] of r) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
  return [a, b, c, d];
}

/** Polígonos con su caja para localizar puntos rápido. */
class Areas<T> {
  private items: { rs: LngLat[][]; bb: [number, number, number, number]; v: T }[] = [];
  add(g: Polygon | MultiPolygon, v: T) {
    const rs = rings(g);
    this.items.push({ rs, bb: bbox(rs), v });
  }
  find(p: LngLat): T | undefined {
    for (const it of this.items) {
      const [a, b, c, d] = it.bb;
      if (p[0] < a || p[0] > c || p[1] < b || p[1] > d) continue;
      if (it.rs.some((r) => inRing(p, r))) return it.v;
    }
    return undefined;
  }
}

function centroid(g: Polygon | MultiPolygon): LngLat {
  const r = rings(g).sort((x, y) => y.length - x.length)[0];
  let sx = 0, sy = 0;
  for (const [x, y] of r) { sx += x; sy += y; }
  return [sx / r.length, sy / r.length];
}


export interface Padron {
  fuente: string;
  total: number;
  /** [distrito, barrio, nombre distrito, nombre barrio, población] */
  barrios: [number, number, string, string, number][];
  /** [código sección (distrito+sección), distrito, barrio, población] */
  secciones: [string, number, number, number][];
}

/** Qué servicios del mapa cuentan para cada función esencial. */
export function essentialPlaces(services: PublicService[], greens: Place[]): Record<Essential, Place[]> {
  const by = (cat: PublicService['category']) => services.filter((s) => s.category === cat).map((s) => ({ name: s.name, at: s.lngLat }));
  return {
    health: by('health'), education: by('education'), market: by('market'), culture: by('culture'),
    sport: by('sport'), social: by('social'), green: greens,
  };
}

export interface FifteenData {
  result: FifteenResult;
  places: Record<Essential, Place[]>;
  /** secciones censales con su resultado, para pintar en el mapa */
  sections: FeatureCollection;
  barriosGeo: FeatureCollection;
  fuente: string;
  /** cuántas manzanas y vecinos se han asignado (control de calidad) */
  coverage: { homes: number; pop: number; padron: number };
}

export async function loadFifteen(services: PublicService[], opts: { padron?: Padron } = {}): Promise<FifteenData> {
  const [padron, barriosGeo, sectionsGeo, manzanas, greensGeo] = await Promise.all([
    opts.padron ?? getJson<Padron>(`${import.meta.env.BASE_URL}data/padron-2024.json`),
    geo(U, 224, 'nombre,coddistbar', 0.0001),
    geo(U, 210, 'codsecc,coddistsecc,coddistrit', 0.00008),
    (async () => {
      const out: { x: number; y: number }[] = [];
      for (let page = 0; page < 10; page++) {
        const p = new URLSearchParams({ where: '1=1', outFields: 'coorx,coory', returnGeometry: 'false', f: 'json', resultOffset: String(out.length), resultRecordCount: '2000' });
        const j = await getJson<{ features: { attributes: { coorx: number; coory: number } }[]; exceededTransferLimit?: boolean }>(`${U}/215/query?${p}`);
        out.push(...j.features.map((f) => ({ x: f.attributes.coorx, y: f.attributes.coory })));
        if (!j.exceededTransferLimit || !j.features.length) break;
      }
      return out;
    })(),
    geo(M, 8, 'nombre,sup_total', 0.0002),
  ]);

  // población y barrio de cada sección (código «distrito+sección», p. ej. 1518)
  const secPop = new Map<number, { pop: number; barrio: string }[]>();
  const barrioName = new Map(padron.barrios.map(([d, b, , n]) => [`${d}.${b}`, n]));
  for (const [code, d, b, pop] of padron.secciones) {
    const k = Number(code);
    (secPop.get(k) ?? secPop.set(k, []).get(k)!).push({ pop, barrio: barrioName.get(`${d}.${b}`) ?? '' });
  }

  // barrio por nombre del Geoportal (mayúsculas sin artículos) → nombre del padrón
  const padronByCode = new Map(padron.barrios.map(([d, b, , n]) => [`${d}.${b}`, n]));
  const barrioAreas = new Areas<string>();
  for (const f of barriosGeo.features) {
    const p = f.properties ?? {};
    const code = String(p.coddistbar ?? '');
    const name = padronByCode.get(`${Number(code.slice(0, -1))}.${Number(code.slice(-1))}`) ?? String(p.nombre ?? '');
    f.properties = { ...p, name };
    if (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon') barrioAreas.add(f.geometry, name);
  }

  const sectionAreas = new Areas<number>();
  const sectionGeom = new Map<number, Feature>();
  for (const f of sectionsGeo.features) {
    const k = Number(f.properties?.coddistsecc);
    if (!Number.isFinite(k) || !(f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon')) continue;
    sectionAreas.add(f.geometry, k);
    sectionGeom.set(k, f);
  }

  // manzanas → sección; la población de cada sección se reparte entre sus manzanas
  const perSection = new Map<number, LngLat[]>();
  for (const m of manzanas) {
    if (!m.x || !m.y) continue;
    const at = utm30ToLngLat(m.x, m.y);
    const s = sectionAreas.find(at);
    if (s === undefined) continue;
    (perSection.get(s) ?? perSection.set(s, []).get(s)!).push(at);
  }
  const homes: Home[] = [];
  for (const [k, parts] of secPop) {
    const pts = perSection.get(k) ?? (sectionGeom.get(k) ? [centroid(sectionGeom.get(k)!.geometry as Polygon)] : []);
    if (!pts.length) continue;
    for (const part of parts) {
      pts.forEach((at, i) => {
        const barrio = parts.length > 1 ? barrioAreas.find(at) ?? part.barrio : part.barrio;
        // con secciones repartidas entre dos barrios, cada parte se queda las manzanas de su barrio
        if (parts.length > 1 && barrio !== part.barrio) return;
        homes.push({ id: `${k}-${i}`, at, pop: 0, barrio: part.barrio });
      });
      const mine = homes.filter((h) => h.id.startsWith(`${k}-`) && h.barrio === part.barrio && h.pop === 0);
      const share = mine.length ? part.pop / mine.length : 0;
      if (mine.length) mine.forEach((h) => (h.pop = share));
      else {
        const c = sectionGeom.get(k) ? centroid(sectionGeom.get(k)!.geometry as Polygon) : pts[0];
        homes.push({ id: `${k}-c-${part.barrio}`, at: c, pop: part.pop, barrio: part.barrio });
      }
    }
  }

  // zonas verdes de al menos 1.000 m²: cualquier vértice de su contorno sirve de acceso
  const greens: Place[] = [];
  for (const f of greensGeo.features) {
    const sup = Number(f.properties?.sup_total ?? 0);
    if (sup < 1000 || !(f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon')) continue;
    const name = String(f.properties?.nombre ?? 'Zona verde');
    for (const r of rings(f.geometry)) r.forEach((at, i) => { if (i % 2 === 0) greens.push({ name, at }); });
  }

  const places = essentialPlaces(services, greens);
  const result = analyzeFifteen(homes, places);

  // resultado por sección para el mapa
  const agg = new Map<number, { pop: number; score: number; full: number; min: Record<Essential, number> }>();
  for (const h of result.homes) {
    const k = Number(h.id.split('-')[0]);
    const a = agg.get(k) ?? agg.set(k, { pop: 0, score: 0, full: 0, min: Object.fromEntries(ESSENTIALS.map((e) => [e.id, 0])) as Record<Essential, number> }).get(k)!;
    a.pop += h.pop;
    a.score += h.score * h.pop;
    if (h.score === ESSENTIALS.length) a.full += h.pop;
    for (const { id } of ESSENTIALS) a.min[id] += Math.min(h.minutes[id], 60) * h.pop;
  }
  const sections: FeatureCollection = {
    type: 'FeatureCollection',
    features: [...agg].flatMap(([k, a]) => {
      const f = sectionGeom.get(k);
      if (!f || !a.pop) return [];
      const props: Record<string, number | string> = { kind: 'fifteen-section', code: k, pop: Math.round(a.pop), score: a.score / a.pop, full: (100 * a.full) / a.pop };
      for (const { id } of ESSENTIALS) props[`m_${id}`] = a.min[id] / a.pop;
      return [{ type: 'Feature' as const, geometry: f.geometry, properties: props }];
    }),
  };

  return {
    result, places, sections, barriosGeo, fuente: padron.fuente,
    coverage: { homes: result.homes.length, pop: Math.round(result.city.pop), padron: padron.total },
  };
}



/** Estado compartido del análisis (panel y mapa). */
export type FifteenMode = 'score' | Essential;
export interface FifteenState {
  status: 'off' | 'loading' | 'ready' | 'error';
  data?: FifteenData;
  index?: Record<Essential, NearestIndex>;
  mode: FifteenMode;
  error?: string;
}

class FifteenStore {
  private state: FifteenState = { status: 'off', mode: 'score' };
  private listeners = new Set<() => void>();
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  get = () => this.state;
  private set(p: Partial<FifteenState>) {
    this.state = { ...this.state, ...p };
    this.listeners.forEach((l) => l());
  }
  setMode(mode: FifteenMode) { this.set({ mode }); }
  async start(services: PublicService[]) {
    if (this.state.status === 'loading' || this.state.status === 'ready') return;
    this.set({ status: 'loading', error: undefined });
    try {
      const data = await loadFifteen(services);
      const index = Object.fromEntries(ESSENTIALS.map((e) => [e.id, new NearestIndex(data.places[e.id])])) as Record<Essential, NearestIndex>;
      this.set({ status: 'ready', data, index });
    } catch (e) {
      this.set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  }
}

export const fifteen = new FifteenStore();
