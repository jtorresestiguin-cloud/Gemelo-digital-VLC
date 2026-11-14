/**
 * Tema día / noche del mapa base. Se aplica cambiando la pintura de las capas del estilo
 * en vivo (sin recargar el mapa), y se guardan los valores originales para volver al día.
 */
import type { Map as MlMap } from 'maplibre-gl';

export type MapTheme = 'night' | 'day';

type Paint = [prop: string, value: unknown];

const NIGHT = {
  background: '#0a101c',
  water: '#0c1a2b',
  green: '#0e1a1c',
  land: '#0f1622',
  roadMajor: '#26344a',
  roadMinor: '#1a2433',
  waterLine: '#123049',
  boundary: '#2b3648',
  text: '#7d8ea8',
  halo: '#0a101c',
};

/** Colores de los edificios 3D según la altura (OSM render_height). */
export const BUILDING_COLORS: Record<MapTheme, unknown> = {
  day: ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 10], 0, '#e7e9ee', 25, '#c7d0dd', 60, '#9fb0c9', 120, '#6f86a8'],
  night: ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 10], 0, '#192233', 25, '#22304a', 60, '#2d4064', 120, '#3c5482'],
};

function nightPaint(id: string, type: string): Paint[] {
  const k = id.toLowerCase();
  switch (type) {
    case 'background':
      return [['background-color', NIGHT.background]];
    case 'fill':
      if (/water|ocean|sea|river/.test(k)) return [['fill-color', NIGHT.water]];
      if (/park|grass|wood|forest|landcover|green|cemetery|garden/.test(k)) return [['fill-color', NIGHT.green]];
      return [['fill-color', NIGHT.land], ['fill-outline-color', NIGHT.land]];
    case 'line':
      if (/water|river|canal/.test(k)) return [['line-color', NIGHT.waterLine]];
      if (/boundary|admin/.test(k)) return [['line-color', NIGHT.boundary]];
      if (/motorway|trunk|primary|major/.test(k)) return [['line-color', NIGHT.roadMajor]];
      return [['line-color', NIGHT.roadMinor]];
    case 'symbol':
      return [['text-color', NIGHT.text], ['text-halo-color', NIGHT.halo], ['icon-opacity', 0.5]];
    default:
      return [];
  }
}

const originals = new WeakMap<MlMap, Map<string, unknown>>();

/** Aplica el tema a las capas del mapa base (las de la app, prefijo vlc-, se dejan en paz). */
export function applyTheme(map: MlMap, theme: MapTheme): void {
  let saved = originals.get(map);
  if (!saved) originals.set(map, (saved = new Map()));
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.id.startsWith('vlc-')) continue;
    for (const [prop, value] of nightPaint(layer.id, layer.type)) {
      const key = `${layer.id}|${prop}`;
      try {
        if (!saved.has(key)) saved.set(key, map.getPaintProperty(layer.id, prop) ?? null);
        map.setPaintProperty(layer.id, prop, theme === 'night' ? value : (saved.get(key) ?? undefined));
      } catch {
        /* propiedad no aplicable a esta capa */
      }
    }
  }
  if (map.getLayer('vlc-buildings')) {
    map.setPaintProperty('vlc-buildings', 'fill-extrusion-color', BUILDING_COLORS[theme]);
    map.setPaintProperty('vlc-buildings', 'fill-extrusion-opacity', theme === 'night' ? 0.95 : 0.88);
  }
  map.getContainer().dataset.theme = theme;
}
