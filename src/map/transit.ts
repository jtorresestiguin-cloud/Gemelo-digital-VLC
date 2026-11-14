/** Capas de la EMT: rutas con brillo, paradas, autobuses animados, estelas, etiquetas y 3D. */
import type { FeatureCollection } from 'geojson';
import type { Map as MlMap } from 'maplibre-gl';
import type { BusRoute, BusStop, BusTrack, LngLat } from '../core/types';
import type { MapTheme } from './theme';

export type BusColorMode = 'movement' | 'speed';

/** Tiempo (ms) que tarda un autobús en recorrer el tramo entre dos lecturas: igual al intervalo de consulta. */
export const ANIMATION_MS = 15_000;

const fc = (features: FeatureCollection['features']): FeatureCollection => ({ type: 'FeatureCollection', features });

const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
export const arrowFor = (heading: number) => ARROWS[Math.round(heading / 45) % 8];

/** Etiqueta como la del vídeo: «L12 18 km/h ↗» (sin velocidad hasta tener dos lecturas). */
export function busLabel(b: BusTrack): string {
  const known = b.trail.length > 1;
  return known ? `${b.line}  ${Math.round(b.speedKmh)} km/h ${arrowFor(b.heading)}` : b.line;
}

/** Posición animada: avanza de la lectura anterior a la actual durante ANIMATION_MS. */
export function interpolate(b: BusTrack, now: number): LngLat {
  const k = Math.min(1, Math.max(0, (now - b.receivedAt) / ANIMATION_MS));
  return [b.from[0] + (b.to[0] - b.from[0]) * k, b.from[1] + (b.to[1] - b.from[1]) * k];
}

/**
 * Rectángulo orientado según el rumbo para el autobús en 3D. Es esquemático: algo mayor que
 * un autobús real (12 × 2,5 m) para que se distinga entre los edificios.
 */
export function busFootprint(c: LngLat, heading: number, length = 15, width = 3.4): LngLat[] {
  const r = (heading * Math.PI) / 180;
  const mLat = 1 / 111_320;
  const mLng = 1 / (111_320 * Math.cos((c[1] * Math.PI) / 180));
  const corner = (along: number, across: number): LngLat => {
    const east = along * Math.sin(r) + across * Math.cos(r);
    const north = along * Math.cos(r) - across * Math.sin(r);
    return [c[0] + east * mLng, c[1] + north * mLat];
  };
  const h = length / 2, w = width / 2;
  const ring = [corner(h, -w), corner(h, w), corner(-h, w), corner(-h, -w)];
  return [...ring, ring[0]];
}

export function busesFrame(buses: BusTrack[], now: number) {
  const points: FeatureCollection['features'] = [];
  const bodies: FeatureCollection['features'] = [];
  const trails: FeatureCollection['features'] = [];
  for (const b of buses) {
    const p = interpolate(b, now);
    const props = { kind: 'bus', id: b.id, line: b.line, trip: b.trip, speed: Math.round(b.speedKmh), heading: Math.round(b.heading), label: busLabel(b), ts: b.ts, known: b.trail.length > 1 };
    points.push({ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: props });
    bodies.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [busFootprint(p, b.heading)] }, properties: props });
    if (b.trail.length > 1) {
      // la estela termina en la posición animada para que no se separe del autobús
      const coords = [...b.trail.slice(0, -1), p];
      trails.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { line: b.line, speed: props.speed } });
    }
  }
  return { points: fc(points), bodies: fc(bodies), trails: fc(trails) };
}

export const routesGeo = (routes: BusRoute[]) =>
  fc(routes.map((r) => ({ type: 'Feature', geometry: { type: 'MultiLineString', coordinates: r.coords }, properties: { line: r.line } })));

export const stopsGeo = (stops: BusStop[]) =>
  fc(stops.map((s) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: s.lngLat },
    properties: { kind: 'bus-stop', name: s.name, lines: s.lines.join(', '), url: s.arrivalsUrl ?? '' },
  })));

const ROUTE_COLOR: Record<MapTheme, string> = { night: '#22d3ee', day: '#0e7490' };
/** Blanco con borde naranja: no se confunde con Valenbisi, servicios ni rutas. */
const BUS_COLOR = '#f8fafc';
const BUS_STROKE = '#fb923c';
/** Rampa secuencial de un solo tono (naranja): más claro = más rápido. */
const SPEED_RAMP = ['interpolate', ['linear'], ['get', 'speed'], 0, '#7c2d12', 10, '#c2410c', 20, '#f97316', 35, '#fed7aa'];

export function busColor(mode: BusColorMode): unknown {
  return mode === 'speed' ? ['case', ['get', 'known'], SPEED_RAMP, '#64748b'] : BUS_COLOR;
}

function addLabelBackground(map: MlMap) {
  if (map.hasImage('vlc-label-bg')) return;
  const s = 32, rad = 6;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(10,16,28,0.86)';
  g.strokeStyle = 'rgba(148,163,184,0.35)';
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(1, 1, s - 2, s - 2, rad);
  g.fill();
  g.stroke();
  map.addImage('vlc-label-bg', g.getImageData(0, 0, s, s), {
    pixelRatio: 2, stretchX: [[8, 24]], stretchY: [[8, 24]], content: [6, 6, 26, 26],
  });
}

export function addTransitLayers(map: MlMap, theme: MapTheme, mode: BusColorMode) {
  const empty = fc([]);
  map.addSource('vlc-emt-routes', { type: 'geojson', data: empty });
  map.addSource('vlc-emt-stops', { type: 'geojson', data: empty });
  map.addSource('vlc-emt-trails', { type: 'geojson', data: empty, lineMetrics: true });
  map.addSource('vlc-emt-buses', { type: 'geojson', data: empty });
  map.addSource('vlc-emt-bodies', { type: 'geojson', data: empty });
  const routeColor = ROUTE_COLOR[theme];
  map.addLayer({ id: 'vlc-emt-routes-glow', type: 'line', source: 'vlc-emt-routes', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': routeColor, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 4, 16, 10], 'line-blur': 6, 'line-opacity': 0.12 } });
  map.addLayer({ id: 'vlc-emt-routes', type: 'line', source: 'vlc-emt-routes', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': routeColor, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 16, 2.2], 'line-opacity': 0.5 } });
  map.addLayer({ id: 'vlc-emt-stops', type: 'circle', source: 'vlc-emt-stops', minzoom: 14.5,
    paint: { 'circle-color': '#0b1220', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 14.5, 2, 17, 5], 'circle-stroke-color': routeColor, 'circle-stroke-width': 1.5 } });
  map.addLayer({ id: 'vlc-emt-trails', type: 'line', source: 'vlc-emt-trails', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.5, 16, 4],
      'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(251,146,60,0)', 1, 'rgba(251,146,60,0.9)'],
    } });
  map.addLayer({ id: 'vlc-emt-buses', type: 'circle', source: 'vlc-emt-buses', maxzoom: 15.5,
    paint: {
      'circle-color': busColor(mode) as string,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 15, 5],
      'circle-stroke-color': BUS_STROKE, 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 1, 15, 2],
    } });
  map.addLayer({ id: 'vlc-emt-bodies', type: 'fill-extrusion', source: 'vlc-emt-bodies', minzoom: 15,
    paint: {
      'fill-extrusion-color': busColor(mode) as string,
      'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.5, 3.6],
      'fill-extrusion-base': 0.3,
      'fill-extrusion-opacity': 0.95,
    } });
  // etiquetas: solo si el estilo base trae tipografías
  if (map.getStyle().glyphs) {
    addLabelBackground(map);
    map.addLayer({ id: 'vlc-emt-labels', type: 'symbol', source: 'vlc-emt-buses', minzoom: 13.8,
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 11,
        'text-offset': [0, -1.6],
        'text-anchor': 'bottom',
        'icon-image': 'vlc-label-bg',
        'icon-text-fit': 'both',
        'icon-text-fit-padding': [3, 6, 3, 6],
        'icon-offset': [0, -1.6],
        'icon-anchor': 'bottom',
        'text-allow-overlap': false,
        'symbol-sort-key': ['-', ['get', 'speed']],
      },
      paint: { 'text-color': '#e2e8f0' } });
  }
}

export function setBusColorMode(map: MlMap, mode: BusColorMode) {
  if (map.getLayer('vlc-emt-buses')) map.setPaintProperty('vlc-emt-buses', 'circle-color', busColor(mode));
  if (map.getLayer('vlc-emt-bodies')) map.setPaintProperty('vlc-emt-bodies', 'fill-extrusion-color', busColor(mode));
}

export function themeTransit(map: MlMap, theme: MapTheme) {
  const c = ROUTE_COLOR[theme];
  for (const id of ['vlc-emt-routes-glow', 'vlc-emt-routes']) if (map.getLayer(id)) map.setPaintProperty(id, 'line-color', c);
  if (map.getLayer('vlc-emt-stops')) {
    map.setPaintProperty('vlc-emt-stops', 'circle-stroke-color', c);
    map.setPaintProperty('vlc-emt-stops', 'circle-color', theme === 'night' ? '#0b1220' : '#ffffff');
  }
}

/** Resalta una línea (al tocar un autobús) y atenúa las demás. */
export function highlightLine(map: MlMap, line: string | null) {
  if (!map.getLayer('vlc-emt-routes')) return;
  map.setPaintProperty('vlc-emt-routes', 'line-opacity', line ? ['case', ['==', ['get', 'line'], line], 1, 0.12] : 0.5);
  // el zoom debe ir en la expresión exterior; la condición, dentro de cada parada
  const sel = ['==', ['get', 'line'], line ?? ''];
  map.setPaintProperty('vlc-emt-routes', 'line-width', line
    ? ['interpolate', ['linear'], ['zoom'], 11, ['case', sel, 2.5, 0.8], 16, ['case', sel, 5, 2.2]]
    : ['interpolate', ['linear'], ['zoom'], 11, 0.8, 16, 2.2]);
  map.setPaintProperty('vlc-emt-routes-glow', 'line-opacity', line ? ['case', ['==', ['get', 'line'], line], 0.35, 0.04] : 0.12);
}
