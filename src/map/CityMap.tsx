import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MlMap, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Snapshot } from '../core/store';
import type { PerfSettings } from '../core/device';
import type { LngLat, ServiceCategory } from '../core/types';
import { SERVICE_CATEGORIES } from '../adapters/services';
import { VALENCIA_BOUNDS, VALENCIA_CENTER, type CameraPreset } from '../data/static';
import { BUILDING_COLORS, applyTheme, type MapTheme } from './theme';
import {
  addTransitLayers, busesFrame, highlightLine, routesGeo, setBusColorMode, stopsGeo, themeTransit, type BusColorMode,
} from './transit';
import type { BusTrack } from '../core/types';
import { enablePhotoreal, setBaseMapVisible, type PhotorealCredential, type PhotorealState } from './google3d';
import type { RealisticOptions, RealisticStatus } from '../realistic/RealisticLayer';
import type { IfcGeometry } from '../bim/ifc';
import type { BimPlacement } from '../bim/BimLayer';
import { fichaHtml, loadFichas, matchFicha } from '../adapters/fichas';
import { extras, fetchDepartures } from '../live/extras';
import { cercanias, noticesFor } from '../live/cercanias';
import { fifteen } from '../analysis/fifteenData';
import { ESSENTIALS, LIMIT_MIN, walkMinutes } from '../analysis/fifteen';
import { VISIT_CHECKED, monumentById, monumentsGeo, type Monument } from '../tour/monuments';
import {
  AIR_LEVELS, BIKE_COLORS, TRAFFIC_COLORS, airGeo, alertsGeo, districtsGeo, servicesGeo, bikesGeo, incidentsGeo, landmarksGeo, metroGeo, noiseGeo, portGeo, trafficGeo,
} from './layers';

export type LayerKey = 'emtBuses' | 'emtBuses3d' | 'emtLabels' | 'emtTrails' | 'emtRoutes' | 'emtStops' | 'services' | 'districts' | 'ortho' | 'terrain' | 'bim' | 'buildings' | 'traffic' | 'bikes' | 'air' | 'noise' | 'metro' | 'port' | 'incidents' | 'alerts' | 'landmarks' | 'monuments' | 'parking' | 'forecast' | 'works' | 'metroLive' | 'beaches' | 'noiseLive' | 'cercanias' | 'fifteen';

/** Cartografía base: OpenFreeMap (OpenStreetMap, vectorial, sin clave). Incluye alturas de edificios. */
const BASE_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#dfe5ec' } }],
};

async function loadBaseStyle(): Promise<{ style: StyleSpecification; online: boolean }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(BASE_STYLE_URL, { signal: ctrl.signal });
    if (!r.ok) throw new Error(String(r.status));
    return { style: (await r.json()) as StyleSpecification, online: true };
  } catch {
    return { style: FALLBACK_STYLE, online: false };
  } finally {
    clearTimeout(t);
  }
}

/** Qué capas de MapLibre controla cada interruptor. */
const LAYER_GROUPS: Record<LayerKey, string[]> = {
  emtBuses: ['vlc-emt-buses'],
  emtBuses3d: ['vlc-emt-bodies'],
  emtLabels: ['vlc-emt-labels'],
  emtTrails: ['vlc-emt-trails'],
  emtRoutes: ['vlc-emt-routes-glow', 'vlc-emt-routes'],
  emtStops: ['vlc-emt-stops'],
  services: ['vlc-services'],
  districts: ['vlc-districts-fill', 'vlc-districts-line'],
  ortho: ['vlc-ortho'],
  terrain: [],
  bim: ['vlc-bim'],
  buildings: ['vlc-buildings'],
  traffic: ['vlc-traffic-casing', 'vlc-traffic', 'vlc-traffic-closed'],
  bikes: ['vlc-bikes'],
  air: ['vlc-air-halo', 'vlc-air', 'vlc-air-label'],
  noise: ['vlc-noise'],
  metro: ['vlc-metro'],
  port: ['vlc-port'],
  incidents: ['vlc-incidents'],
  alerts: ['vlc-alert-pulse', 'vlc-alerts', 'vlc-routes', 'vlc-route-target'],
  landmarks: ['vlc-landmarks'],
  monuments: ['vlc-monuments', 'vlc-monuments-label'],
  fifteen: ['vlc-15-sections', 'vlc-15-barrios', 'vlc-15-lines', 'vlc-15-dest'],
  parking: ['vlc-x-parking', 'vlc-x-parking-label'],
  forecast: ['vlc-x-forecast'],
  works: ['vlc-x-works'],
  metroLive: ['vlc-x-metro', 'vlc-x-metro-label'],
  cercanias: ['vlc-cer-lines', 'vlc-cer-stations', 'vlc-cer-trains', 'vlc-cer-stations-label', 'vlc-cer-trains-label'],
  beaches: ['vlc-x-beaches'],
  noiseLive: ['vlc-x-noise', 'vlc-x-noise-label'],
};

const SEVERITY_COLOR = ['match', ['get', 'severity'], 'critical', '#dc2626', 'warning', '#f59e0b', '#3b82f6'] as unknown as string;
/** Colores oficiales del Índice de Calidad del Aire (MITECO); si falta la categoría, se estima por el NO₂. */
const AIR_COLOR = ['match', ['get', 'quality'],
  'Buena', AIR_LEVELS[0].color, 'Razonablemente Buena', AIR_LEVELS[1].color, 'Regular', AIR_LEVELS[2].color,
  'Desfavorable', AIR_LEVELS[3].color, 'Muy Desfavorable', AIR_LEVELS[4].color, 'Extremadamente Desfavorable', AIR_LEVELS[5].color,
  ['step', ['get', 'no2'], '#94a3b8', 0, AIR_LEVELS[0].color, 41, AIR_LEVELS[1].color, 91, AIR_LEVELS[2].color, 121, AIR_LEVELS[3].color, 231, AIR_LEVELS[4].color, 341, AIR_LEVELS[5].color],
] as unknown as string;

/** Ortofoto PNOA de máxima actualidad (© Instituto Geográfico Nacional), servicio WMTS. */
const PNOA_TILES = 'https://www.ign.es/wmts/pnoa-ma?layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/jpeg&TileMatrix={z}&TileCol={x}&TileRow={y}';
/** Modelo digital de elevaciones global (Terrarium, AWS Open Data). */
const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

function addOverlays(map: MlMap, perf: PerfSettings, hasOsm: boolean, theme: MapTheme, busMode: BusColorMode) {
  const empty = { type: 'FeatureCollection' as const, features: [] };
  map.addSource('vlc-ortho', {
    type: 'raster', tiles: [PNOA_TILES], tileSize: 256, maxzoom: 19,
    attribution: 'Ortofoto PNOA © <a href="https://www.ign.es" target="_blank">Instituto Geográfico Nacional</a>',
  });
  map.addSource('vlc-terrain', {
    type: 'raster-dem', tiles: [TERRAIN_TILES], tileSize: 256, maxzoom: 15, encoding: 'terrarium',
    attribution: 'Relieve: Mapzen Terrain Tiles (AWS Open Data)',
  });
  map.addSource('vlc-districts', { type: 'geojson', data: empty });
  // La ortofoto y los distritos van por debajo de calles y etiquetas del mapa base
  const firstLine = map.getStyle().layers?.find((l) => l.type === 'line' || l.type === 'symbol')?.id;
  map.addLayer({ id: 'vlc-ortho', type: 'raster', source: 'vlc-ortho', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.95 } }, firstLine);
  map.addLayer({ id: 'vlc-districts-fill', type: 'fill', source: 'vlc-districts',
    paint: {
      'fill-color': ['match', ['get', 'severity'], 'critical', '#d03b3b', 'warning', '#fab219', 'info', '#3987e5', '#64748b'],
      'fill-opacity': ['match', ['get', 'severity'], 'none', 0.04, 0.22],
    } }, firstLine);
  map.addLayer({ id: 'vlc-districts-line', type: 'line', source: 'vlc-districts',
    paint: { 'line-color': '#334155', 'line-width': 1.2, 'line-dasharray': [3, 2], 'line-opacity': 0.7 } }, firstLine);
  // Análisis «ciudad de los 15 minutos»: secciones censales coloreadas, barrios y líneas al servicio más cercano
  for (const id of ['15-sections', '15-barrios', '15-lines', '15-dest']) map.addSource(`vlc-${id}`, { type: 'geojson', data: empty });
  map.addLayer({ id: 'vlc-15-sections', type: 'fill', source: 'vlc-15-sections', layout: { visibility: 'none' },
    paint: { 'fill-color': '#94a3b8', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.5, 15, 0.32, 17, 0.2], 'fill-outline-color': 'rgba(255,255,255,0.15)' } }, firstLine);
  map.addLayer({ id: 'vlc-15-barrios', type: 'line', source: 'vlc-15-barrios', layout: { visibility: 'none' },
    paint: { 'line-color': '#f8fafc', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 15, 1.6], 'line-opacity': 0.55 } }, firstLine);
  map.addLayer({ id: 'vlc-15-lines', type: 'line', source: 'vlc-15-lines', layout: { visibility: 'none', 'line-cap': 'round' },
    paint: { 'line-color': ['case', ['get', 'ok'], '#34d399', '#f43f5e'], 'line-width': 2, 'line-dasharray': [1.5, 1.5], 'line-opacity': 0.9 } });
  map.addLayer({ id: 'vlc-15-dest', type: 'circle', source: 'vlc-15-dest', layout: { visibility: 'none' },
    paint: { 'circle-radius': 5, 'circle-color': ['case', ['get', 'ok'], '#34d399', '#f43f5e'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });

  for (const id of ['services', 'traffic', 'bikes', 'air', 'noise', 'metro', 'port', 'incidents', 'alerts', 'landmarks']) {
    map.addSource(`vlc-${id}`, { type: 'geojson', data: empty });
  }

  // Edificios 3D de OpenStreetMap con su altura real (render_height)
  if (hasOsm) {
    for (const l of map.getStyle().layers ?? []) {
      if ((l as { 'source-layer'?: string })['source-layer'] === 'building') map.setLayoutProperty(l.id, 'visibility', 'none');
    }
    const firstSymbol = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
    map.addLayer({
      id: 'vlc-buildings',
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: perf.buildingsMinZoom,
      paint: {
        'fill-extrusion-color': BUILDING_COLORS[theme] as string,
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], perf.buildingsMinZoom, 0, perf.buildingsMinZoom + 0.6, ['coalesce', ['get', 'render_height'], 10]],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.88,
      },
    }, firstSymbol);
  }

  // Tráfico: línea fina con un halo suave del mismo color (lo fluido, discreto; los atascos destacan)
  const TRAFFIC_COLOR = ['match', ['get', 'state'], 'fluid', TRAFFIC_COLORS.fluid, 'dense', TRAFFIC_COLORS.dense, 'congested', TRAFFIC_COLORS.congested, 'closed', TRAFFIC_COLORS.closed, TRAFFIC_COLORS.unknown] as unknown as string;
  const notUnknown = ['!=', ['get', 'state'], 'unknown'] as maplibregl.FilterSpecification;
  map.addLayer({ id: 'vlc-traffic-casing', type: 'line', source: 'vlc-traffic', filter: notUnknown, layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': TRAFFIC_COLOR,
      'line-blur': ['interpolate', ['linear'], ['zoom'], 11, 2, 16, 6],
      'line-opacity': ['match', ['get', 'state'], 'fluid', 0.12, 0.35],
      'line-width': ['interpolate', ['linear'], ['zoom'], 11, 4, 16, 14],
    } });
  map.addLayer({ id: 'vlc-traffic', type: 'line', source: 'vlc-traffic', filter: notUnknown, layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': TRAFFIC_COLOR,
      'line-opacity': ['match', ['get', 'state'], 'fluid', 0.7, 0.95],
      'line-width': ['interpolate', ['linear'], ['zoom'], 11, ['match', ['get', 'state'], 'fluid', 0.8, 1.4], 16, ['match', ['get', 'state'], 'fluid', 2.2, 3.6]],
    } });
  map.addLayer({ id: 'vlc-traffic-closed', type: 'line', source: 'vlc-traffic', filter: ['==', ['get', 'state'], 'closed'],
    paint: { 'line-color': '#f8fafc', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.2, 16, 3], 'line-dasharray': [1.5, 1.5] } });
  addTransitLayers(map, theme, busMode);
  map.addLayer({ id: 'vlc-routes', type: 'line', source: 'vlc-alerts', filter: ['==', ['get', 'kind'], 'route'],
    paint: { 'line-color': '#7c3aed', 'line-width': 3, 'line-dasharray': [2, 1.5] } });
  map.addLayer({ id: 'vlc-services', type: 'circle', source: 'vlc-services',
    paint: {
      'circle-color': ['match', ['get', 'category'], ...SERVICE_CATEGORIES.flatMap((c) => [c.id, c.color]), '#64748b'] as unknown as string,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, ['case', ['get', 'hospital'], 5, 2.5], 16, ['case', ['get', 'hospital'], 11, 6.5]],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 16, 1.8],
    } });
  // Calidad del aire: punto con aura difusa en los colores oficiales del índice (ICA)
  map.addLayer({ id: 'vlc-air-halo', type: 'circle', source: 'vlc-air',
    paint: { 'circle-color': AIR_COLOR, 'circle-opacity': 0.22, 'circle-blur': 1, 'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 11, 22, 17, 260] } });
  map.addLayer({ id: 'vlc-air', type: 'circle', source: 'vlc-air',
    paint: {
      'circle-color': AIR_COLOR, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4.5, 16, 8],
      'circle-stroke-color': 'rgba(255,255,255,0.9)', 'circle-stroke-width': 1.5,
    } });
  map.addLayer({ id: 'vlc-noise', type: 'circle', source: 'vlc-noise',
    paint: {
      'circle-color': ['interpolate', ['linear'], ['get', 'laeq'], 45, '#a5b4fc', 60, '#8b5cf6', 70, '#be185d'],
      'circle-radius': ['interpolate', ['linear'], ['get', 'laeq'], 45, 4, 75, 9], 'circle-opacity': 0.85,
    } });
  // Valenbisi: puntos pequeños, solo de cerca
  map.addLayer({ id: 'vlc-bikes', type: 'circle', source: 'vlc-bikes', minzoom: 12.5,
    paint: {
      'circle-color': ['case', ['==', ['get', 'available'], 0], BIKE_COLORS.empty, ['<', ['get', 'ratio'], 0.25], BIKE_COLORS.few, BIKE_COLORS.many],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12.5, 2, 16, 5],
      'circle-stroke-color': 'rgba(255,255,255,0.85)', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 12.5, 0.5, 16, 1.2],
    } });
  map.addLayer({ id: 'vlc-metro', type: 'circle', source: 'vlc-metro',
    paint: {
      'circle-color': '#fff', 'circle-radius': 6,
      'circle-stroke-width': 4,
      'circle-stroke-color': ['match', ['get', 'status'], 'interrupted', '#111827', 'delayed', '#f59e0b', ['get', 'color']],
    } });
  map.addLayer({ id: 'vlc-port', type: 'circle', source: 'vlc-port',
    paint: {
      'circle-color': ['match', ['get', 'assetKind'], 'gate', '#0ea5e9', 'berth', '#0369a1', '#075985'],
      'circle-radius': ['case', ['==', ['get', 'assetKind'], 'gate'], ['interpolate', ['linear'], ['get', 'queue'], 0, 6, 60, 16], 8],
      'circle-stroke-color': '#fff', 'circle-stroke-width': 2,
    } });
  map.addLayer({ id: 'vlc-incidents', type: 'circle', source: 'vlc-incidents',
    paint: { 'circle-color': '#111827', 'circle-radius': ['+', 5, ['*', 2, ['get', 'severity']]], 'circle-stroke-color': '#fbbf24', 'circle-stroke-width': 3 } });
  map.addLayer({ id: 'vlc-landmarks', type: 'circle', source: 'vlc-landmarks',
    paint: { 'circle-color': '#f97316', 'circle-radius': 5, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
  // Más datos en vivo (se rellenan al activarlos)
  for (const id of ['parking', 'forecast', 'works', 'metro', 'beaches', 'noise']) map.addSource(`vlc-x-${id}`, { type: 'geojson', data: empty });
  const hidden = { visibility: 'none' as const };
  map.addLayer({ id: 'vlc-x-forecast', type: 'line', source: 'vlc-x-forecast', layout: { ...hidden, 'line-cap': 'round' },
    paint: {
      'line-color': ['interpolate', ['linear'], ['get', 'occ'], 0, '#34d399', 60, '#fbbf24', 85, '#f43f5e'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 17, 5], 'line-opacity': 0.85,
    } });
  map.addLayer({ id: 'vlc-x-works', type: 'line', source: 'vlc-x-works', layout: { ...hidden, 'line-cap': 'butt' },
    paint: {
      'line-color': ['case', ['get', 'road'], '#fb923c', '#fcd34d'], 'line-dasharray': [1.2, 1],
      'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 17, 6],
    } });
  map.addLayer({ id: 'vlc-x-beaches', type: 'circle', source: 'vlc-x-beaches', layout: hidden,
    paint: {
      'circle-color': ['match', ['get', 'quality'], 'Excellent', '#38bdf8', 'Good', '#34d399', 'Sufficient', '#fbbf24', 'Poor', '#f43f5e', '#94a3b8'],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 5, 16, 10], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2,
    } });
  map.addLayer({ id: 'vlc-x-noise', type: 'circle', source: 'vlc-x-noise', layout: hidden,
    paint: {
      'circle-color': ['interpolate', ['linear'], ['get', 'den'], 55, '#c4b5fd', 65, '#8b5cf6', 75, '#be185d'],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 4, 17, 9], 'circle-stroke-color': 'rgba(255,255,255,0.9)', 'circle-stroke-width': 1.5,
    } });
  map.addLayer({ id: 'vlc-x-parking', type: 'circle', source: 'vlc-x-parking', layout: hidden,
    paint: {
      'circle-color': ['case', ['!', ['get', 'live']], '#94a3b8', ['<', ['get', 'ratio'], 0.1], '#f43f5e', ['<', ['get', 'ratio'], 0.3], '#fbbf24', '#34d399'],
      'circle-opacity': ['case', ['get', 'live'], 1, 0.6],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 5, 16, 11], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2,
    } });
  map.addLayer({ id: 'vlc-x-metro', type: 'circle', source: 'vlc-x-metro', layout: hidden,
    paint: {
      'circle-color': '#ffffff', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3, 16, 7],
      'circle-stroke-color': '#e11d48', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 2, 16, 3.5],
    } });
  // Cercanías: trazado con el color oficial de cada línea, estaciones y trenes en vivo
  for (const id of ['lines', 'stations', 'trains']) map.addSource(`vlc-cer-${id}`, { type: 'geojson', data: empty });
  map.addLayer({ id: 'vlc-cer-lines', type: 'line', source: 'vlc-cer-lines', layout: { ...hidden, 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.5, 13, 3, 17, 5], 'line-opacity': 0.9 } });
  map.addLayer({ id: 'vlc-cer-stations', type: 'circle', source: 'vlc-cer-stations', layout: hidden,
    paint: {
      'circle-color': '#ffffff', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 2.5, 13, 4, 16, 7],
      'circle-stroke-color': '#1e293b', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 16, 2.5],
    } });
  map.addLayer({ id: 'vlc-cer-trains', type: 'circle', source: 'vlc-cer-trains', layout: hidden,
    paint: {
      'circle-color': ['get', 'color'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 5, 14, 8, 17, 11],
      'circle-stroke-color': ['case', ['>=', ['get', 'delay'], 5], '#f43f5e', '#ffffff'], 'circle-stroke-width': 2.5,
    } });
  // Monumentos de las visitas guiadas: punto discreto y nombre solo de cerca
  map.addSource('vlc-monuments', { type: 'geojson', data: monumentsGeo() });
  map.addLayer({ id: 'vlc-monuments', type: 'circle', source: 'vlc-monuments', minzoom: 12.5,
    paint: {
      'circle-color': '#b45309',
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12.5, 3, 16, 6.5],
      'circle-stroke-color': '#fff7ed',
      'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 12.5, 1, 16, 2],
    } });
  if (map.getStyle().glyphs) {
    const label = { 'text-size': 11, 'text-offset': [0, 1.2] as [number, number], 'text-anchor': 'top' as const, visibility: 'none' as const };
    const halo = { 'text-color': '#fff', 'text-halo-color': 'rgba(15,23,42,0.85)', 'text-halo-width': 1.4 };
    map.addLayer({ id: 'vlc-x-parking-label', type: 'symbol', source: 'vlc-x-parking', minzoom: 13.5,
      layout: { ...label, 'text-field': ['case', ['get', 'live'], ['concat', ['to-string', ['get', 'free']], ' libres'], ''] }, paint: halo });
    map.addLayer({ id: 'vlc-x-metro-label', type: 'symbol', source: 'vlc-x-metro', minzoom: 14.5,
      layout: { ...label, 'text-field': ['get', 'name'] }, paint: halo });
    map.addLayer({ id: 'vlc-cer-stations-label', type: 'symbol', source: 'vlc-cer-stations', minzoom: 12.5,
      layout: { ...label, 'text-field': ['get', 'name'], 'text-max-width': 9, 'text-optional': true }, paint: halo });
    map.addLayer({ id: 'vlc-cer-trains-label', type: 'symbol', source: 'vlc-cer-trains',
      layout: { visibility: 'none', 'text-field': ['get', 'tag'], 'text-size': 10, 'text-offset': [0, -1.5], 'text-anchor': 'bottom', 'text-allow-overlap': true, 'text-font': ['Noto Sans Bold'] },
      paint: halo });
    map.addLayer({ id: 'vlc-x-noise-label', type: 'symbol', source: 'vlc-x-noise', minzoom: 15,
      layout: { ...label, 'text-field': ['concat', ['to-string', ['round', ['get', 'den']]], ' dB'] }, paint: halo });
    map.addLayer({ id: 'vlc-air-label', type: 'symbol', source: 'vlc-air', minzoom: 13, filter: ['>=', ['get', 'no2'], 0],
      layout: { 'text-field': ['concat', 'NO₂ ', ['to-string', ['get', 'no2']]], 'text-size': 11, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-allow-overlap': false },
      paint: { 'text-color': '#fff', 'text-halo-color': 'rgba(15,23,42,0.85)', 'text-halo-width': 1.4 } });
    map.addLayer({ id: 'vlc-monuments-label', type: 'symbol', source: 'vlc-monuments', minzoom: 15.6,
      layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-max-width': 9, 'text-optional': true },
      paint: { 'text-color': '#fff', 'text-halo-color': 'rgba(15,23,42,0.85)', 'text-halo-width': 1.4 } });
  }
  map.addLayer({ id: 'vlc-alert-pulse', type: 'circle', source: 'vlc-alerts', filter: ['==', ['get', 'kind'], 'alert'],
    paint: { 'circle-color': SEVERITY_COLOR, 'circle-opacity': 0.25, 'circle-radius': 24, 'circle-stroke-color': SEVERITY_COLOR, 'circle-stroke-width': 2 } });
  map.addLayer({ id: 'vlc-alerts', type: 'circle', source: 'vlc-alerts', filter: ['==', ['get', 'kind'], 'alert'],
    paint: { 'circle-color': SEVERITY_COLOR, 'circle-radius': 8, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
  map.addLayer({ id: 'vlc-route-target', type: 'circle', source: 'vlc-alerts', filter: ['==', ['get', 'kind'], 'route-target'],
    paint: { 'circle-color': '#7c3aed', 'circle-radius': 9, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
}

const escHtml = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function visitHtml(m: Monument): string {
  const v = m.info.visit;
  if (!v) return '';
  const safeUrl = /^https:\/\//.test(v.url) ? escHtml(v.url) : '#';
  return `<div class="mon-visit">${v.hours ? `<div>🕒 ${escHtml(v.hours)}</div>` : ''}<div>🎟 ${escHtml(v.price)}</div>`
    + `<div class="mon-check">Orientativo (${VISIT_CHECKED}) · <a href="${safeUrl}" target="_blank" rel="noopener">confirmar en la web oficial</a></div></div>`;
}

/** Ficha breve de un monumento: qué es, cuándo y quién, y en qué visitas aparece. */
export function monumentHtml(m: Monument): string {
  const meta = [m.info.when, m.info.who].filter(Boolean).map(escHtml).join(' · ');
  const tours = m.tours
    .map((t) => `<button class="mon-tour" data-tour="${escHtml(t.id)}" data-stop="${t.stop}">▶ ${escHtml(t.title)}</button>`)
    .join('');
  const [lng, lat] = m.lngLat;
  const route = `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(5)},${lng.toFixed(5)}`;
  return `<div class="monument-card"><strong>${escHtml(m.name)}</strong>${meta ? `<div class="mon-meta">${meta}</div>` : ''}`
    + `<p>${escHtml(m.info.text)}</p>`
    + visitHtml(m)
    + `<div class="mon-label">Aparece en la visita</div><div class="mon-tours">${tours}</div>`
    + `<div class="mon-actions"><button data-act="zoom">🔍 Acercar</button><a href="${route}" target="_blank" rel="noopener">📍 Cómo llegar</a></div></div>`;
}

const fmt = (v: unknown) => (typeof v === 'number' ? (v < 0 ? '—' : Number.isInteger(v) ? String(v) : v.toFixed(1)) : String(v ?? ''));

function popupHtml(p: Record<string, unknown>): string {
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const rows = (pairs: [string, unknown][]) => pairs.map(([k, v]) => `<tr><th>${k}</th><td>${esc(fmt(v))}</td></tr>`).join('');
  const title = `<strong>${esc(p.name)}</strong>`;
  switch (p.kind) {
    case 'parking':
      return `${title}<table>${rows(p.live ? [['Plazas libres', p.free], ['Total', p.total], ['Actualizado', new Date(Number(p.at)).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })]] : [['Plazas', p.total], ['En vivo', 'sin dato ahora']])}</table>${p.address ? `<p class="src">${esc(p.address)}</p>` : ''}<p class="src">Fuente: Ajuntament de València</p>`;
    case 'forecast':
      return `${title}<table>${rows([['Ocupación prevista', `${p.occ} %`]])}</table><p class="src">Previsión del aparcamiento regulado · Ajuntament de València</p>`;
    case 'works':
      return `${title}<table>${rows([['Ocupa', p.what], ['Desde', p.from], ['Hasta', p.to]])}</table><p class="src">Fuente: Ajuntament de València</p>`;
    case 'beach':
      return `${title}<table>${rows([[`Calidad del agua ${p.year}`, p.label], ...(p.history ? [['Años anteriores', p.history] as [string, unknown]] : [])])}</table><p class="src">Clasificación oficial · Agencia Europea de Medio Ambiente</p>`;
    case 'noise-live':
      return `${title}<table>${rows([['Día (7–19 h)', `${fmt(p.day)} dB`], ['Tarde (19–23 h)', `${fmt(p.evening)} dB`], ['Noche (23–7 h)', `${fmt(p.night)} dB`], ['Fecha', p.date]])}</table><p class="src">Sonómetros de Russafa · plataforma VLCi</p>`;
    case 'cer-station': {
      const c = cercanias.get();
      const lines = String(p.lines).split(', ');
      const color = new Map(c.data?.lines.map((l) => [l.line, l.color]));
      const chips = lines.map((l) => `<span class="cer-chip" style="background:${esc(color.get(l) ?? '#64748b')}">${esc(l)}</span>`).join('');
      const coming = (c.live?.trains ?? []).filter((t) => t.stop === p.id);
      const notes = noticesFor(c.live?.notices ?? [], lines);
      const st = (s: string) => (s === 'STOPPED_AT' ? 'en la estación' : s === 'INCOMING_AT' ? 'llegando' : 'en camino');
      return `${title}<div class="cer-chips">${chips}</div>`
        + (coming.length ? `<ul class="metro-list">${coming.map((t) => `<li><span class="cer-chip" style="background:${esc(color.get(t.line) ?? '#64748b')}">${esc(t.line)}</span><span>Tren ${esc(t.id)} · ${st(t.status)}</span><b>${t.delay ? `+${t.delay} min` : t.delay === 0 ? 'puntual' : ''}</b></li>`).join('')}</ul>` : '')
        + notes.map((n) => `<div class="cer-notice">⚠ ${esc(n.text)}</div>`).join('')
        + `<a class="cer-link" href="https://www.renfe.com/es/es/cercanias/cercanias-valencia/horarios" target="_blank" rel="noopener">Horarios en Renfe ↗</a>`
        + `<p class="src">Fuente: Renfe (datos abiertos, CC BY 4.0)</p>`;
    }
    case 'cer-train': {
      const where = p.stop ? (p.status === 'STOPPED_AT' ? ['Parado en', p.stop] : p.status === 'INCOMING_AT' ? ['Llegando a', p.stop] : ['Próxima estación', p.stop]) : undefined;
      const delay = Number(p.delay);
      return `${title}<table>${rows([
        ...(where ? [where as [string, unknown]] : []),
        ['Retraso', delay < 0 ? 'sin dato' : delay === 0 ? 'Puntual' : `${delay} min`],
        ...(p.platform ? [['Vía', p.platform] as [string, unknown]] : []),
      ])}</table><p class="src">Posición en tiempo real · Renfe (CC BY 4.0)</p>`;
    }
    case 'metro-station':
      return `${title}<div class="f-hint">Línea${String(p.lines).includes(',') ? 's' : ''} ${esc(p.lines)}</div><div class="metro-next">Consultando próximos trenes…</div><p class="src">Fuente: Metrovalencia · Geoportal de València</p>`;
    case 'service': {
      const cat = SERVICE_CATEGORIES.find((c) => c.id === p.category);
      const pairs: [string, unknown][] = [['Tipo', p.type], ['Categoría', cat?.label]];
      if (p.emergency) pairs.push(['Urgencias', 'Sí']);
      if (p.address) pairs.push(['Dirección', p.address]);
      if (p.detail) pairs.push(['Detalle', p.detail]);
      if (p.hours) pairs.push(['Horario', p.hours]);
      if (p.phone) pairs.push(['Teléfono', p.phone]);
      const web = typeof p.website === 'string' && /^https?:\/\//.test(p.website) ? `<p><a href="${esc(p.website)}" target="_blank" rel="noopener">Web</a></p>` : '';
      return `${title}<table>${rows(pairs)}</table>${web}<p class="src">Fuente: Ajuntament de València</p>`;
    }
    case 'bus': {
      const ago = Math.max(0, Math.round((Date.now() - Number(p.ts)) / 1000));
      const pairs: [string, unknown][] = [['Trayecto', p.trip]];
      if (p.known) pairs.push(['Velocidad', `${p.speed} km/h (reconstruida)`], ['Rumbo', `${p.heading}°`]);
      pairs.push(['Posición', `hace ${ago} s`]);
      return `<strong>Línea ${esc(p.line)}</strong><table>${rows(pairs)}</table><p class="src">Fuente: EMT València (Geoportal)</p>`;
    }
    case 'bus-stop': {
      const link = typeof p.url === 'string' && p.url.startsWith('https://') ? `<p><a href="${esc(p.url)}" target="_blank" rel="noopener">Próximas llegadas</a></p>` : '';
      return `${title}<table>${rows([['Líneas', p.lines]])}</table>${link}`;
    }
    case 'district': return `${title}<table>${rows([['Alertas activas', p.alerts]])}</table>`;
    case 'traffic': return `${title}<table>${rows([['Estado', p.label]])}</table>`;
    case 'bike': return `${title}<table>${rows([['Bicis', p.available], ['Anclajes libres', p.free], ['Total', p.total]])}</table>`;
    case 'air': return `${title}<table>${rows([['NO₂ µg/m³', p.no2], ['PM10 µg/m³', p.pm10], ['PM2.5 µg/m³', p.pm25], ['O₃ µg/m³', p.o3], ...(p.quality ? [['Calidad', p.quality] as [string, unknown]] : [])])}</table>`;
    case 'noise': return `${title}<table>${rows([['LAeq dB(A)', p.laeq]])}</table>`;
    case 'metro': return `${title}<table>${rows([['Líneas', p.lines], ['Estado', p.status === 'ok' ? 'Normal' : p.status === 'delayed' ? 'Con retraso' : 'Interrumpida']])}</table>`;
    case 'port': return `${title}${p.assetKind === 'gate' ? `<table>${rows([['Camiones en cola (total)', p.queue]])}</table>` : ''}`;
    case 'incident': return `${title}<table>${rows([['Tipo', { accident: 'Accidente', breakdown: 'Avería', roadworks: 'Obras' }[p.type as string] ?? p.type], ['Gravedad', p.severity]])}</table>`;
    default: return title;
  }
}

interface Props {
  snapshot: Snapshot;
  layers: Record<LayerKey, boolean>;
  perf: PerfSettings;
  focus?: { lngLat: LngLat; seq: number; zoom?: number };
  onBaseMap?: (online: boolean) => void;
  onMapReady?: (map: MlMap) => void;
  bim?: { geometry: IfcGeometry; placement: BimPlacement; seq: number };
  serviceCategories: ServiceCategory[];
  theme: MapTheme;
  busColorMode: BusColorMode;
  /** credencial para la vista fotorrealista; null = desactivada */
  photorealCred: PhotorealCredential | null;
  onPhotoreal: (s: PhotorealState) => void;
  /** modo realista sin cuentas (ortofoto + edificios + árboles); null = desactivado */
  realistic: RealisticOptions | null;
  onRealistic: (s: RealisticStatus | null) => void;
  /** la cámara gira lentamente alrededor del centro */
  orbit: boolean;
  camera?: { preset: CameraPreset; seq: number };
  /** «▶ visita» desde la ficha de un monumento */
  onMonumentTour?: (tourId: string, stop: number) => void;
}

export function CityMap({ snapshot, layers, perf, focus, onBaseMap, onMapReady, bim, serviceCategories, theme, orbit, camera, busColorMode, photorealCred, onPhotoreal, realistic, onRealistic, onMonumentTour }: Props) {
  const fifteenOnRef = useRef(layers.fifteen);
  fifteenOnRef.current = layers.fifteen;
  const onMonumentTourRef = useRef(onMonumentTour);
  onMonumentTourRef.current = onMonumentTour;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const busModeRef = useRef(busColorMode);
  busModeRef.current = busColorMode;
  const photorealOn = useRef(false);
  const busesRef = useRef<BusTrack[]>([]);
  busesRef.current = snapshot.state.buses;

  useEffect(() => {
    let cancelled = false;
    let map: MlMap | undefined;
    loadBaseStyle().then(({ style, online }) => {
      if (cancelled || !container.current) return;
      onBaseMap?.(online);
      map = new maplibregl.Map({
        container: container.current,
        style,
        center: VALENCIA_CENTER,
        zoom: 14.2,
        pitch: 58,
        bearing: -28,
        maxPitch: perf.maxPitch,
        maxBounds: [[VALENCIA_BOUNDS[0][0] - 0.08, VALENCIA_BOUNDS[0][1] - 0.06], [VALENCIA_BOUNDS[1][0] + 0.08, VALENCIA_BOUNDS[1][1] + 0.06]],
        pixelRatio: perf.pixelRatio,
        canvasContextAttributes: { antialias: perf.antialias },
        attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');
      map.on('load', () => {
        addOverlays(map!, perf, online && !!map!.getSource('openmaptiles'), themeRef.current, busModeRef.current);
        applyTheme(map!, themeRef.current);
        mapRef.current = map!;
        setReady(true);
        onMapReady?.(map!);
      });
      const clickable = ['vlc-emt-buses', 'vlc-emt-bodies', 'vlc-emt-labels', 'vlc-emt-stops', 'vlc-services', 'vlc-districts-fill', 'vlc-traffic', 'vlc-bikes', 'vlc-air', 'vlc-noise', 'vlc-metro', 'vlc-port', 'vlc-incidents', 'vlc-alerts', 'vlc-landmarks', 'vlc-route-target', 'vlc-monuments', 'vlc-monuments-label', 'vlc-x-parking', 'vlc-x-metro', 'vlc-x-beaches', 'vlc-x-noise', 'vlc-x-works', 'vlc-x-forecast', 'vlc-cer-trains', 'vlc-cer-stations'];
      // Un único manejador: ficha solo del elemento más alto bajo el puntero (los distritos quedan debajo)
      let popup: maplibregl.Popup | undefined;
      map.on('click', (e) => {
        const layers = clickable.filter((id) => map!.getLayer(id));
        const pad = 4;
        const f = map!.queryRenderedFeatures([[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]], { layers })[0];
        popup?.remove();
        const props = (f?.properties ?? {}) as Record<string, unknown>;
        highlightLine(map!, props.kind === 'bus' ? String(props.line) : null);
        const fs = fifteen.get();
        if (!f && fifteenOnRef.current && fs.index) {
          // «¿qué tengo a 15 minutos desde aquí?»
          const at: LngLat = [e.lngLat.lng, e.lngLat.lat];
          const rows = ESSENTIALS.map((es) => {
            const n = fs.index![es.id].nearest(at);
            const min = n ? walkMinutes(n.m) : Infinity;
            return { es, n, min, ok: min <= LIMIT_MIN };
          });
          const okN = rows.filter((r) => r.ok).length;
          const lines: GeoJSON.Feature[] = rows.filter((r) => r.n).map((r) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: [at, r.n!.place.at] }, properties: { ok: r.ok } }));
          const dest: GeoJSON.Feature[] = rows.filter((r) => r.n).map((r) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: r.n!.place.at }, properties: { ok: r.ok } }));
          (map!.getSource('vlc-15-lines') as GeoJSONSource).setData({ type: 'FeatureCollection', features: lines });
          (map!.getSource('vlc-15-dest') as GeoJSONSource).setData({ type: 'FeatureCollection', features: dest });
          const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
          const fmtMin = (m: number) => (Number.isFinite(m) ? `${Math.max(1, Math.round(m))} min` : '—');
          popup = new maplibregl.Popup({ closeButton: true, maxWidth: '300px', focusAfterOpen: false, className: 'f15-popup', anchor: 'bottom', offset: 8 })
            .setLngLat(e.lngLat)
            .setHTML(`<strong>A pie desde aquí</strong><div class="f15-score ${okN === 7 ? 'good' : okN >= 5 ? 'mid' : 'bad'}">${okN} de 7 servicios esenciales a menos de ${LIMIT_MIN} min</div>`
              + `<ul class="f15-list">${rows.map((r) => `<li class="${r.ok ? 'ok' : 'ko'}"><span>${r.es.icon}</span><span><b>${r.es.label}</b><i>${esc(r.n?.place.name ?? 'sin datos')}</i></span><em>${fmtMin(r.min)}</em></li>`).join('')}</ul>`
              + `<p class="src">Estimación: línea recta × 1,3 a 4,8 km/h</p>`)
            .addTo(map!);
          // el punto baja para que la ficha quepa entera por encima
          map!.easeTo({ center: e.lngLat, offset: [0, Math.round(map!.getContainer().clientHeight * 0.28)], duration: 500 });
          popup.on('close', () => {
            (map!.getSource('vlc-15-lines') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] });
            (map!.getSource('vlc-15-dest') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] });
          });
          return;
        }
        if (!f) return;
        const mon = props.kind === 'monument' ? monumentById(String(props.id)) : undefined;
        if (mon) {
          // la ficha se abre encima del punto y el mapa baja el punto para que quepa entera
          popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px', className: 'monument-popup', anchor: 'bottom', offset: 10, focusAfterOpen: false })
            .setLngLat(mon.lngLat).setHTML(monumentHtml(mon)).addTo(map!);
          const h = map!.getContainer().clientHeight;
          map!.easeTo({ center: mon.lngLat, offset: [0, Math.round(h * 0.3)], duration: 600 });
          const el = popup.getElement();
          el.querySelector('[data-act="zoom"]')?.addEventListener('click', () =>
            map!.flyTo({ center: mon.lngLat, zoom: mon.view.zoom, pitch: mon.view.pitch, bearing: mon.view.bearing, speed: 0.8 }));
          el.querySelectorAll<HTMLButtonElement>('[data-tour]').forEach((b) => b.addEventListener('click', () => {
            popup?.remove();
            onMonumentTourRef.current?.(b.dataset.tour!, Number(b.dataset.stop));
          }));
          return;
        }
        if (props.kind === 'metro-station' && typeof props.url === 'string' && props.url) {
          popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px', focusAfterOpen: false })
            .setLngLat(f.geometry.type === 'Point' ? (f.geometry.coordinates as LngLat) : e.lngLat)
            .setHTML(popupHtml(props)).addTo(map!);
          const shown = popup;
          fetchDepartures(props.url)
            .then((deps) => {
              const box = shown.getElement()?.querySelector('.metro-next');
              if (!box) return;
              const now = new Date();
              const mins = (t: string) => {
                const [h, m] = t.split(':').map(Number);
                let d = h * 60 + m - (now.getHours() * 60 + now.getMinutes());
                if (d < -120) d += 24 * 60;
                return d <= 0 ? 'ahora' : `${d} min`;
              };
              box.innerHTML = deps.length
                ? `<ul class="metro-list">${deps.slice(0, 6).map((d) => `<li><span class="metro-line l${d.line.replace(/\W/g, '')}">${d.line}</span><span>${d.to.replace(/[<>&]/g, '')}</span><b>${mins(d.time)}</b></li>`).join('')}</ul>`
                : 'Sin trenes previstos ahora mismo.';
            })
            .catch(() => {
              const box = shown.getElement()?.querySelector('.metro-next');
              if (box) box.innerHTML = `<a href="${String(props.url).replace(/"/g, '')}" target="_blank" rel="noopener">Ver próximos trenes ↗</a>`;
            });
          return;
        }
        const isService = props.kind === 'service';
        popup = new maplibregl.Popup({ closeButton: true, maxWidth: '260px', focusAfterOpen: false, ...(isService ? { anchor: 'bottom' as const, offset: 8 } : {}) })
          .setLngLat(isService && f.geometry.type === 'Point' ? (f.geometry.coordinates as LngLat) : e.lngLat).setHTML(popupHtml(f.properties as Record<string, unknown>)).addTo(map!);
        if (isService && f.geometry.type === 'Point') {
          // ficha completa del servicio (se descarga la primera vez; mientras, la básica)
          const shown = popup;
          const at = f.geometry.coordinates as LngLat;
          loadFichas()
            .then((doc) => {
              const ficha = matchFicha(doc, String(props.name ?? ''), at, String(props.category ?? ''));
              if (!ficha || !shown.isOpen()) return;
              shown.setMaxWidth('300px').setHTML(fichaHtml(ficha, doc)).addClassName('ficha-popup');
              shown.setLngLat(at);
              const h = map!.getContainer().clientHeight;
              if (h < 900) map!.easeTo({ center: at, offset: [0, Math.round(h * 0.25)], duration: 500 });
            })
            .catch(() => { /* sin ficha ampliada: queda la básica */ });
        }
      });
      for (const id of clickable) {
        map.on('mouseenter', id, () => (map!.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', id, () => (map!.getCanvas().style.cursor = ''));
      }
    });
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Análisis 15 minutos → fuentes y colores
  const f15 = useSyncExternalStore(fifteen.subscribe, fifteen.get);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !f15.data) return;
    (map.getSource('vlc-15-sections') as GeoJSONSource | undefined)?.setData(f15.data.sections);
    (map.getSource('vlc-15-barrios') as GeoJSONSource | undefined)?.setData(f15.data.barriosGeo);
  }, [f15.data, ready]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getLayer('vlc-15-sections')) return;
    const color = f15.mode === 'score'
      ? ['interpolate', ['linear'], ['get', 'score'], 3, '#f43f5e', 5, '#fbbf24', 6.3, '#a3e635', 7, '#34d399']
      : ['interpolate', ['linear'], ['get', `m_${f15.mode}`], 8, '#34d399', 15, '#fbbf24', 25, '#f43f5e'];
    map.setPaintProperty('vlc-15-sections', 'fill-color', color as unknown as string);
  }, [f15.mode, ready]);

  // Más datos en vivo → fuentes
  const extra = useSyncExternalStore(extras.subscribe, extras.get);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const [id, data] of Object.entries(extra.geo)) if (data) (map.getSource(`vlc-x-${id}`) as GeoJSONSource | undefined)?.setData(data);
  }, [extra.geo, ready]);

  // Cercanías → fuentes
  const cer = useSyncExternalStore(cercanias.subscribe, cercanias.get);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const [id, data] of Object.entries(cer.geo)) (map.getSource(`vlc-cer-${id}`) as GeoJSONSource | undefined)?.setData(data);
  }, [cer.geo, ready]);

  // Datos → fuentes GeoJSON
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const s = snapshot.state;
    const set = (id: string, data: GeoJSON.FeatureCollection) => (map.getSource(`vlc-${id}`) as GeoJSONSource | undefined)?.setData(data);
    set('traffic', trafficGeo(s));
    set('bikes', bikesGeo(s));
    set('air', airGeo(s));
    set('noise', noiseGeo(s));
    set('metro', metroGeo(s));
    set('port', portGeo(s));
    set('incidents', incidentsGeo(s));
    set('alerts', alertsGeo(snapshot.alerts));
    set('landmarks', landmarksGeo());
    set('districts', districtsGeo(snapshot.districts, snapshot.alerts));
  }, [snapshot, ready]);

  // Rutas y paradas de la EMT (cambian poco)
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource('vlc-emt-routes') as GeoJSONSource | undefined)?.setData(routesGeo(snapshot.state.busRoutes));
  }, [snapshot.state.busRoutes, ready]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource('vlc-emt-stops') as GeoJSONSource | undefined)?.setData(stopsGeo(snapshot.state.busStops));
  }, [snapshot.state.busStops, ready]);

  // Animación de los autobuses entre lecturas (~12 imágenes/s; en pausa si la pestaña no se ve)
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    let raf = 0;
    let last = 0;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (t - last < 80 || document.hidden) return;
      last = t;
      const { points, bodies, trails } = busesFrame(busesRef.current, Date.now());
      (map.getSource('vlc-emt-buses') as GeoJSONSource | undefined)?.setData(points);
      (map.getSource('vlc-emt-bodies') as GeoJSONSource | undefined)?.setData(bodies);
      (map.getSource('vlc-emt-trails') as GeoJSONSource | undefined)?.setData(trails);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  useEffect(() => {
    if (ready && mapRef.current) setBusColorMode(mapRef.current, busColorMode);
  }, [busColorMode, ready]);

  // Los servicios cambian poco: solo se recalculan cuando llega una nueva descarga
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource('vlc-services') as GeoJSONSource | undefined)?.setData(servicesGeo(snapshot.state));
  }, [snapshot.state.services, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getLayer('vlc-services')) return;
    map.setFilter('vlc-services', ['in', ['get', 'category'], ['literal', serviceCategories]]);
  }, [serviceCategories, ready]);

  // Interruptores de capas
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const [key, ids] of Object.entries(LAYER_GROUPS) as [LayerKey, string[]][]) {
      // con la vista fotorrealista, Google ya aporta edificios e imagen: no se muestran los propios
      const hiddenByPhotoreal = (photorealOn.current || realisticLayer.current !== null) && (key === 'buildings' || key === 'ortho');
      for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', layers[key] && !hiddenByPhotoreal ? 'visible' : 'none');
    }
    if (!photorealOn.current && !realisticLayer.current) map.setTerrain(layers.terrain ? { source: 'vlc-terrain', exaggeration: 1.5 } : null);
  }, [layers, ready]);

  // Modo realista sin cuentas (three.js se descarga solo al activarlo)
  const realisticLayer = useRef<import('../realistic/RealisticLayer').RealisticLayer | null>(null);
  const realisticOn = realistic !== null;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !realisticOn) return;
    let cancelled = false;
    const restore = new Map<string, string>();
    const hadTerrain = !!map.getTerrain();
    const bg = map.getLayer('background') ? map.getPaintProperty('background', 'background-color') : undefined;
    import('../realistic/RealisticLayer').then(({ RealisticLayer }) => {
      if (cancelled) return;
      map.setTerrain(null);
      setBaseMapVisible(map, false, restore, (id) => id === 'background');
      const layer = new RealisticLayer(realistic!, onRealistic);
      realisticLayer.current = layer;
      map.addLayer(layer, map.getLayer('vlc-districts-fill') ? 'vlc-districts-fill' : undefined);
    }).catch((e: unknown) => onRealistic({ buildings: 0, trees: 0, loading: false, error: String(e) }));
    return () => {
      cancelled = true;
      if (map.getLayer('vlc-realistic')) map.removeLayer('vlc-realistic');
      realisticLayer.current = null;
      setBaseMapVisible(map, true, restore);
      if (bg !== undefined && map.getLayer('background')) map.setPaintProperty('background', 'background-color', bg);
      if (hadTerrain) map.setTerrain({ source: 'vlc-terrain', exaggeration: 1.5 });
      applyTheme(map, themeRef.current);
      onRealistic(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realisticOn, ready]);
  useEffect(() => {
    if (realistic) realisticLayer.current?.setOptions(realistic);
  }, [realistic?.hour, realistic?.shadows]);

  // Vista fotorrealista de Google (deck.gl se descarga solo al activarla)
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !photorealCred) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    photorealOn.current = true;
    enablePhotoreal(map, photorealCred, onPhotoreal)
      .then((d) => {
        if (cancelled) d();
        else dispose = d;
      })
      .catch((e: unknown) => {
        photorealOn.current = false;
        onPhotoreal({ state: 'error', message: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
      photorealOn.current = false;
      dispose?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photorealCred, ready]);

  // Modelo BIM (three.js se carga solo si hay modelo)
  const bimLayer = useRef<import('../bim/BimLayer').BimLayer | null>(null);
  const bimGeometry = useRef<IfcGeometry | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (!bim) {
      if (map.getLayer('vlc-bim')) map.removeLayer('vlc-bim');
      bimLayer.current = null;
      bimGeometry.current = null;
      return;
    }
    let cancelled = false;
    import('../bim/BimLayer').then(({ BimLayer, buildBimMesh }) => {
      if (cancelled) return;
      const altitude = layers.terrain ? map.queryTerrainElevation(bim.placement.anchor) ?? 0 : 0;
      const placement = { ...bim.placement, altitude };
      if (bimLayer.current && bimGeometry.current === bim.geometry) {
        bimLayer.current.setPlacement(placement);
        return;
      }
      if (map.getLayer('vlc-bim')) map.removeLayer('vlc-bim');
      bimLayer.current = new BimLayer('vlc-bim', buildBimMesh(bim.geometry), placement);
      bimGeometry.current = bim.geometry;
      map.addLayer(bimLayer.current, map.getLayer('vlc-traffic-casing') ? 'vlc-traffic-casing' : undefined);
      map.setLayoutProperty('vlc-bim', 'visibility', layers.bim ? 'visible' : 'none');
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bim, ready]);

  useEffect(() => {
    if (ready && mapRef.current) {
      applyTheme(mapRef.current, theme);
      themeTransit(mapRef.current, theme);
      // el modo realista controla su propio cielo según la hora del sol
      if (realistic) realisticLayer.current?.setOptions(realistic);
    }
  }, [theme, ready]);

  useEffect(() => {
    const p = camera?.preset;
    if (p && mapRef.current) mapRef.current.flyTo({ center: p.center, zoom: p.zoom, pitch: p.pitch, bearing: p.bearing, speed: 0.9, curve: 1.4 });
  }, [camera]);

  // Girar alrededor: rotación lenta de la cámara; se pausa mientras el usuario interactúa
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !orbit) return;
    let raf = 0;
    let last = performance.now();
    let paused = false;
    const pause = () => (paused = true);
    const resume = () => { paused = false; last = performance.now(); };
    const step = (t: number) => {
      if (!paused && !map.isMoving()) map.setBearing(map.getBearing() + ((t - last) / 1000) * 4);
      last = t;
      raf = requestAnimationFrame(step);
    };
    map.on('mousedown', pause); map.on('touchstart', pause);
    map.on('mouseup', resume); map.on('touchend', resume);
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      map.off('mousedown', pause); map.off('touchstart', pause);
      map.off('mouseup', resume); map.off('touchend', resume);
    };
  }, [orbit, ready]);

  useEffect(() => {
    if (focus && mapRef.current) mapRef.current.flyTo({ center: focus.lngLat, zoom: focus.zoom ?? 15.5, pitch: 60, speed: 1.2 });
  }, [focus]);

  return <div ref={container} className="map" />;
}
