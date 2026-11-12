/**
 * Servicios públicos de la ciudad desde fuentes oficiales del Ajuntament de València:
 *  - Equipamientos municipales (Geoportal, capa OPENDATA/SociedadBienestar/1): ~3.000 registros
 *  - Hospitales (portal de datos abiertos opendata.vlci.valencia.es)
 * Se guardan 24 h en el navegador para no repetir la descarga en cada visita.
 */
import { zoneFor } from '../core/geo';
import type { LngLat, PublicService, ServiceCategory } from '../core/types';
import { LAYERS, fetchLayer, type GeoCollection } from './geoportal';

export const SERVICE_CATEGORIES: { id: ServiceCategory; label: string; color: string }[] = [
  { id: 'health', label: 'Sanidad', color: '#2a78d6' },
  { id: 'education', label: 'Educación', color: '#eb6834' },
  { id: 'culture', label: 'Cultura', color: '#1baf7a' },
  { id: 'sport', label: 'Deporte', color: '#eda100' },
  { id: 'social', label: 'Servicios sociales', color: '#e87ba4' },
  { id: 'market', label: 'Mercados', color: '#008300' },
  { id: 'administration', label: 'Administración', color: '#6250d6' },
  { id: 'emergency', label: 'Emergencias y seguridad', color: '#e34948' },
];

export const HOSPITALS_URL =
  'https://opendata.vlci.valencia.es/dataset/c389b148-0fad-46b2-8c7b-f5c5aa866a65/resource/82588e44-2ba8-4038-9bc9-5fb1ce2428d2/download/hospitales.geojson';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Clases del Geoportal que no son servicios a la ciudadanía. */
const IGNORED = /venta emt|sin clase|invisible/;

/** "clase" del Geoportal → categoría de la app. */
const CLASS_RULES: [RegExp, ServiceCategory][] = [
  [/sanitar|salud|hospital|ambulatori/, 'health'],
  [/educa|escuel|colegio|guarder|infantil/, 'education'],
  [/museo|bibliotec|teatro|archivo|cultur|auditor/, 'culture'],
  [/deport|polidep|piscina/, 'sport'],
  [/bienestar|social|juvenil|mayores|alojamiento|albergue|igualdad|mujer/, 'social'],
  [/mercad/, 'market'],
  [/polic|bomber|proteccion civil|emergenc|seguridad/, 'emergency'],
  [/oficina|municipal|junta|ayuntamiento|registro|administra/, 'administration'],
];

export function classifyClass(clase: string): ServiceCategory | undefined {
  const c = norm(clase);
  if (!c || IGNORED.test(c)) return undefined;
  return CLASS_RULES.find(([re]) => re.test(c))?.[1];
}

const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());

const pointOf = (g: GeoCollection['features'][number]['geometry']): LngLat | undefined => {
  if (!g) return undefined;
  if (g.type === 'Point') return g.coordinates as LngLat;
  if (g.type === 'MultiPoint') return (g.coordinates as LngLat[])[0];
  return undefined;
};

export function parseFacilities(fc: GeoCollection): PublicService[] {
  const out: PublicService[] = [];
  for (const f of fc.features) {
    const p = f.properties ?? {};
    const lngLat = pointOf(f.geometry);
    const clase = String(p.clase ?? '');
    const category = classifyClass(clase);
    if (!lngLat || !category) continue;
    const phone = p.telefono ? String(p.telefono) : undefined;
    out.push({
      id: `eq-${p.objectid ?? p.identifica ?? out.length}`,
      name: titleCase(String(p.equipamien ?? clase)),
      category,
      kind: clase,
      lngLat,
      zoneId: zoneFor(lngLat),
      phone: phone && phone.length >= 9 ? phone : undefined,
    });
  }
  return out;
}

export function parseHospitals(fc: GeoCollection): PublicService[] {
  const out: PublicService[] = [];
  fc.features.forEach((f, i) => {
    const p = f.properties ?? {};
    const g = p.geo_point_2d as { lon?: number; lat?: number } | undefined;
    const lngLat = pointOf(f.geometry) ?? (g?.lon !== undefined && g?.lat !== undefined ? [g.lon, g.lat] as LngLat : undefined);
    if (!lngLat) return;
    const financing = String(p.financiaci ?? '');
    out.push({
      id: `h-${i}`,
      name: String(p.nombre ?? 'Hospital'),
      category: 'health',
      kind: 'Hospital',
      lngLat,
      zoneId: zoneFor(lngLat),
      address: p.direccion ? String(p.direccion) : undefined,
      publicFunded: /p[uú]blic/i.test(financing) || undefined,
      detail: [financing && `Financiación: ${financing.toLowerCase()}`, p.camas && `${p.camas} camas`].filter(Boolean).join(' · ') || undefined,
    });
  });
  return out;
}

const CACHE_KEY = 'vlc-twin-services-v2';
export const SERVICES_TTL = 24 * 3600_000;

export function readServicesCache(): { t: number; data: PublicService[] } | undefined {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function writeServicesCache(data: PublicService[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data }));
  } catch {
    /* sin espacio o almacenamiento bloqueado: se vuelve a pedir la próxima vez */
  }
}

async function fetchHospitals(): Promise<PublicService[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const r = await fetch(HOSPITALS_URL, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return parseHospitals(await r.json());
  } finally {
    clearTimeout(t);
  }
}

/** Descarga equipamientos y hospitales. Basta con que responda una de las dos fuentes. */
export async function fetchServices(): Promise<PublicService[]> {
  const [facilities, hospitals] = await Promise.allSettled([
    fetchLayer(LAYERS.facilities, { timeoutMs: 30_000 }).then(parseFacilities),
    fetchHospitals(),
  ]);
  const data = [
    ...(facilities.status === 'fulfilled' ? facilities.value : []),
    ...(hospitals.status === 'fulfilled' ? hospitals.value : []),
  ];
  if (!data.length) {
    const reason = [facilities, hospitals].map((r) => (r.status === 'rejected' ? String((r.reason as Error)?.message ?? r.reason) : 'vacío')).join(' / ');
    throw new Error(reason);
  }
  writeServicesCache(data);
  return data;
}
