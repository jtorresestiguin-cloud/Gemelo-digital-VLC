/**
 * Servicios públicos de la ciudad desde OpenStreetMap (API Overpass, sin clave).
 * Se consulta el término municipal de València (relación OSM con wikidata Q8818),
 * con caché local de 24 h para no saturar el servicio.
 */
import { zoneFor } from '../core/geo';
import type { LngLat, PublicService, ServiceCategory } from '../core/types';

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

/** tipo OSM → [categoría, etiqueta en castellano] */
const KINDS: Record<string, [ServiceCategory, string]> = {
  'amenity=hospital': ['health', 'Hospital'],
  'amenity=clinic': ['health', 'Centro de salud / clínica'],
  'healthcare=centre': ['health', 'Centro de salud'],
  'amenity=doctors': ['health', 'Consulta médica'],
  'amenity=pharmacy': ['health', 'Farmacia'],
  'amenity=kindergarten': ['education', 'Escuela infantil'],
  'amenity=school': ['education', 'Colegio / instituto'],
  'amenity=college': ['education', 'Formación profesional'],
  'amenity=university': ['education', 'Universidad'],
  'amenity=library': ['culture', 'Biblioteca'],
  'tourism=museum': ['culture', 'Museo'],
  'amenity=theatre': ['culture', 'Teatro'],
  'amenity=arts_centre': ['culture', 'Centro cultural'],
  'amenity=community_centre': ['culture', 'Centro cívico / casal'],
  'leisure=sports_centre': ['sport', 'Polideportivo'],
  'amenity=social_facility': ['social', 'Servicio social / residencia'],
  'amenity=marketplace': ['market', 'Mercado municipal'],
  'amenity=townhall': ['administration', 'Ayuntamiento / junta de distrito'],
  'office=government': ['administration', 'Oficina de la administración'],
  'amenity=courthouse': ['administration', 'Juzgado'],
  'amenity=post_office': ['administration', 'Oficina de Correos'],
  'amenity=police': ['emergency', 'Policía'],
  'amenity=fire_station': ['emergency', 'Bomberos'],
  'emergency=ambulance_station': ['emergency', 'Base de ambulancias'],
};

/** Prioridad cuando un elemento tiene varias etiquetas (p. ej. hospital con farmacia). */
const PRIORITY = Object.keys(KINDS);

export function buildOverpassQuery(): string {
  const byKey = new Map<string, string[]>();
  for (const k of PRIORITY) {
    const [key, value] = k.split('=');
    byKey.set(key, [...(byKey.get(key) ?? []), value]);
  }
  const clauses = [...byKey].map(([key, values]) => {
    const extra = key === 'leisure' ? '["access"!~"private|customers|members"]' : '';
    return `  nwr["${key}"~"^(${values.join('|')})$"]${extra}(area.vlc);`;
  });
  return [
    '[out:json][timeout:90];',
    'area["wikidata"="Q8818"]["boundary"="administrative"]->.vlc;',
    '(',
    ...clauses,
    ');',
    'out center tags qt;',
  ].join('\n');
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function classify(tags: Record<string, string>): [ServiceCategory, string] | undefined {
  for (const k of PRIORITY) {
    const [key, value] = k.split('=');
    if (tags[key] === value) return KINDS[k];
  }
  return undefined;
}

export function parseOverpass(json: { elements: OverpassElement[] }): PublicService[] {
  const out: PublicService[] = [];
  const seen = new Set<string>();
  for (const e of json.elements ?? []) {
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    const tags = e.tags ?? {};
    const cls = classify(tags);
    if (lat === undefined || lon === undefined || !cls) continue;
    const id = `${e.type[0]}${e.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const lngLat: LngLat = [lon, lat];
    const street = tags['addr:street'];
    out.push({
      id,
      name: tags.name ?? tags['name:es'] ?? tags['name:ca'] ?? cls[1],
      category: cls[0],
      kind: cls[1],
      lngLat,
      zoneId: zoneFor(lngLat),
      address: street ? `${street}${tags['addr:housenumber'] ? ', ' + tags['addr:housenumber'] : ''}` : undefined,
      phone: tags.phone ?? tags['contact:phone'],
      website: tags.website ?? tags['contact:website'],
      openingHours: tags.opening_hours,
      emergency: tags.emergency === 'yes' || undefined,
    });
  }
  return out;
}

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const CACHE_KEY = 'vlc-twin-services-v1';
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

/** Descarga los servicios probando varios servidores Overpass. */
export async function fetchServices(): Promise<PublicService[]> {
  const body = new URLSearchParams({ data: buildOverpassQuery() });
  let lastError: unknown;
  for (const url of ENDPOINTS) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 100_000);
    try {
      const r = await fetch(url, { method: 'POST', body, signal: ctrl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const services = parseOverpass(await r.json());
      if (!services.length) throw new Error('respuesta vacía');
      writeServicesCache(services);
      return services;
    } catch (e) {
      lastError = e;
    } finally {
      clearTimeout(t);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
