/**
 * Cliente del Geoportal del Ajuntament de València (ArcGIS Server, capas OPENDATA).
 * Es la fuente de la que se alimenta el portal de datos abiertos (opendata.vlci.valencia.es)
 * y admite peticiones desde el navegador (CORS).
 */
export const GEOPORTAL = 'https://geoportal.valencia.es/server/rest/services/OPENDATA';

export const LAYERS = {
  traffic: 'Trafico/MapServer/192',
  bikes: 'Trafico/MapServer/228',
  air: 'MedioAmbiente/MapServer/156',
  districts: 'UrbanismoEInfraestructuras/MapServer/225',
  facilities: 'SociedadBienestar/MapServer/1',
} as const;

export interface GeoFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: unknown } | null;
  properties: Record<string, unknown>;
}

export interface GeoCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}

const PAGE = 1000;

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as T & { error?: { message?: string } };
    if (j.error) throw new Error(j.error.message ?? 'error del servidor');
    return j;
  } finally {
    clearTimeout(t);
  }
}

export function layerQueryUrl(layer: string, offset = 0, where = '1=1'): string {
  const p = new URLSearchParams({
    where,
    outFields: '*',
    outSR: '4326',
    f: 'geojson',
    resultOffset: String(offset),
    resultRecordCount: String(PAGE),
  });
  return `${GEOPORTAL}/${layer}/query?${p}`;
}

/** Descarga todas las entidades de una capa, paginando si el servidor limita el número de registros. */
export async function fetchLayer(layer: string, { timeoutMs = 20_000, maxPages = 20 } = {}): Promise<GeoCollection> {
  const features: GeoFeature[] = [];
  for (let page = 0; page < maxPages; page++) {
    const j = await fetchJson<GeoCollection & { exceededTransferLimit?: boolean; properties?: { exceededTransferLimit?: boolean } }>(
      layerQueryUrl(layer, features.length), timeoutMs,
    );
    features.push(...(j.features ?? []));
    const more = j.exceededTransferLimit || j.properties?.exceededTransferLimit;
    if (!more || !j.features?.length) break;
  }
  return { type: 'FeatureCollection', features };
}
