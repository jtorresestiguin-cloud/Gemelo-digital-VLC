/**
 * Vista fotorrealista 3D con los «Photorealistic 3D Tiles» de Google (Map Tiles API),
 * dibujados con deck.gl dentro del mismo contexto WebGL de MapLibre.
 *
 * Condiciones de Google que se respetan aquí:
 *  - Se muestran el logotipo/nombre de Google y las atribuciones de las teselas visibles,
 *    ordenadas por frecuencia.
 *  - No se mezclan con otro mapa base: mientras está activa se oculta la cartografía de
 *    OpenStreetMap y solo quedan encima los datos propios del gemelo.
 * La clave es de navegador: restríngela en Google Cloud a tu dominio (referer HTTP).
 */
import type { Map as MlMap } from 'maplibre-gl';

export const GOOGLE_3D_ROOT = 'https://tile.googleapis.com/v1/3dtiles/root.json';

export type PhotorealState =
  | { state: 'off' }
  | { state: 'loading' }
  | { state: 'on'; credits: string }
  | { state: 'error'; message: string };

/** Traduce la respuesta de Google al comprobar la clave. */
export function keyErrorMessage(status: number, body = ''): string | undefined {
  if (status === 200) return undefined;
  if (status === 400 && /api key/i.test(body)) return 'La clave no es válida.';
  if (status === 403) {
    if (/referer|referrer/i.test(body)) return 'La clave no permite este dominio: añade la dirección de la web a las restricciones de la clave.';
    if (/billing/i.test(body)) return 'El proyecto de Google Cloud no tiene la facturación activada.';
    return 'La clave no tiene acceso a la Map Tiles API (actívala en Google Cloud) o no permite este dominio.';
  }
  if (status === 429) return 'Se ha superado la cuota de la Map Tiles API. Prueba más tarde.';
  return `Google respondió HTTP ${status}.`;
}

/** Atribuciones de las teselas visibles, sin repetir y de más a menos frecuente. */
export function collectCredits(copyrights: (string | undefined)[]): string {
  const count = new Map<string, number>();
  for (const c of copyrights) {
    for (const part of (c ?? '').split(';')) {
      const t = part.trim();
      if (t) count.set(t, (count.get(t) ?? 0) + 1);
    }
  }
  return [...count].sort((a, b) => b[1] - a[1]).map(([t]) => t).join('; ');
}

async function checkKey(key: string): Promise<void> {
  const r = await fetch(`${GOOGLE_3D_ROOT}?key=${encodeURIComponent(key)}`);
  if (r.ok) return;
  throw new Error(keyErrorMessage(r.status, await r.text().catch(() => '')));
}

/** Capas propias que se ocultan junto con el mapa base (los modelos de Google ya los incluyen). */
const OWN_BASE_LAYERS = ['vlc-buildings', 'vlc-ortho'];
const isBaseLayer = (id: string) => !id.startsWith('vlc-') || OWN_BASE_LAYERS.includes(id);

export function setBaseMapVisible(map: MlMap, visible: boolean, restore: Map<string, string>) {
  for (const l of map.getStyle().layers ?? []) {
    if (!isBaseLayer(l.id)) continue;
    if (!visible) {
      restore.set(l.id, (map.getLayoutProperty(l.id, 'visibility') as string) ?? 'visible');
      map.setLayoutProperty(l.id, 'visibility', 'none');
    } else if (restore.has(l.id)) {
      map.setLayoutProperty(l.id, 'visibility', restore.get(l.id)!);
    }
  }
  if (visible) restore.clear();
}

/**
 * Activa la vista fotorrealista. Devuelve una función para desactivarla.
 * deck.gl (≈1 MB) solo se descarga al activarla.
 */
export async function enablePhotoreal(map: MlMap, key: string, onState: (s: PhotorealState) => void): Promise<() => void> {
  onState({ state: 'loading' });
  await checkKey(key);
  const [{ MapboxOverlay }, { Tile3DLayer }] = await Promise.all([import('@deck.gl/mapbox'), import('@deck.gl/geo-layers')]);

  const restore = new Map<string, string>();
  const hadTerrain = !!map.getTerrain();
  map.setTerrain(null);
  setBaseMapVisible(map, false, restore);

  let lastCredits = '';
  const overlay = new MapboxOverlay({
    interleaved: true,
    layers: [
      new Tile3DLayer({
        id: 'google-photoreal-3d',
        data: GOOGLE_3D_ROOT,
        loadOptions: { fetch: { headers: { 'X-GoogleMaps-Api-Key': key } } },
        // por debajo de los datos del gemelo (distritos, tráfico, autobuses…)
        beforeId: map.getLayer('vlc-districts-fill') ? 'vlc-districts-fill' : undefined,
        onTilesetLoad: (tileset: { options: { onTraversalComplete?: (t: unknown[]) => unknown[] } }) => {
          tileset.options.onTraversalComplete = (selected: unknown[]) => {
            const credits = collectCredits(
              selected.map((t) => (t as { content?: { gltf?: { asset?: { copyright?: string } } } }).content?.gltf?.asset?.copyright),
            );
            if (credits !== lastCredits) {
              lastCredits = credits;
              onState({ state: 'on', credits });
            }
            return selected;
          };
          onState({ state: 'on', credits: lastCredits });
        },
        onTileError: (_tile: unknown, _url: string, message: string) => {
          console.warn('Tesela 3D de Google no disponible:', message);
        },
      } as never),
    ],
  });
  map.addControl(overlay as never);

  return () => {
    map.removeControl(overlay as never);
    setBaseMapVisible(map, true, restore);
    if (hadTerrain) map.setTerrain({ source: 'vlc-terrain', exaggeration: 1.5 });
    onState({ state: 'off' });
  };
}
