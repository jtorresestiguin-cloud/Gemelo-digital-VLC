import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MlMap, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Snapshot } from '../core/store';
import type { PerfSettings } from '../core/device';
import type { LngLat } from '../core/types';
import { VALENCIA_BOUNDS, VALENCIA_CENTER } from '../data/static';
import {
  TRAFFIC_COLORS, airGeo, alertsGeo, bikesGeo, incidentsGeo, landmarksGeo, metroGeo, noiseGeo, portGeo, trafficGeo,
} from './layers';

export type LayerKey = 'buildings' | 'traffic' | 'bikes' | 'air' | 'noise' | 'metro' | 'port' | 'incidents' | 'alerts' | 'landmarks';

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
  buildings: ['vlc-buildings'],
  traffic: ['vlc-traffic-casing', 'vlc-traffic'],
  bikes: ['vlc-bikes'],
  air: ['vlc-air-halo', 'vlc-air'],
  noise: ['vlc-noise'],
  metro: ['vlc-metro'],
  port: ['vlc-port'],
  incidents: ['vlc-incidents'],
  alerts: ['vlc-alert-pulse', 'vlc-alerts', 'vlc-routes', 'vlc-route-target'],
  landmarks: ['vlc-landmarks'],
};

const SEVERITY_COLOR = ['match', ['get', 'severity'], 'critical', '#dc2626', 'warning', '#f59e0b', '#3b82f6'] as unknown as string;
const NO2_COLOR = ['step', ['get', 'no2'], '#94a3b8', 0, '#22c55e', 40, '#84cc16', 90, '#f59e0b', 150, '#ef4444', 200, '#7f1d1d'] as unknown as string;

function addOverlays(map: MlMap, perf: PerfSettings, hasOsm: boolean) {
  const empty = { type: 'FeatureCollection' as const, features: [] };
  for (const id of ['traffic', 'bikes', 'air', 'noise', 'metro', 'port', 'incidents', 'alerts', 'landmarks']) {
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
        'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 10], 0, '#e7e9ee', 25, '#c7d0dd', 60, '#9fb0c9', 120, '#6f86a8'],
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], perf.buildingsMinZoom, 0, perf.buildingsMinZoom + 0.6, ['coalesce', ['get', 'render_height'], 10]],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.88,
      },
    }, firstSymbol);
  }

  map.addLayer({ id: 'vlc-traffic-casing', type: 'line', source: 'vlc-traffic', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#0f172a', 'line-opacity': 0.35, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 3, 16, 9] } });
  map.addLayer({ id: 'vlc-traffic', type: 'line', source: 'vlc-traffic', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['match', ['get', 'state'], 'fluid', TRAFFIC_COLORS.fluid, 'dense', TRAFFIC_COLORS.dense, 'congested', TRAFFIC_COLORS.congested, 'closed', TRAFFIC_COLORS.closed, TRAFFIC_COLORS.unknown],
      'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.8, 16, 6],
    } });
  map.addLayer({ id: 'vlc-routes', type: 'line', source: 'vlc-alerts', filter: ['==', ['get', 'kind'], 'route'],
    paint: { 'line-color': '#7c3aed', 'line-width': 3, 'line-dasharray': [2, 1.5] } });
  map.addLayer({ id: 'vlc-air-halo', type: 'circle', source: 'vlc-air',
    paint: { 'circle-color': NO2_COLOR, 'circle-opacity': 0.18, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 18, 16, 60] } });
  map.addLayer({ id: 'vlc-air', type: 'circle', source: 'vlc-air',
    paint: { 'circle-color': NO2_COLOR, 'circle-radius': 7, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
  map.addLayer({ id: 'vlc-noise', type: 'circle', source: 'vlc-noise',
    paint: {
      'circle-color': ['interpolate', ['linear'], ['get', 'laeq'], 45, '#a5b4fc', 60, '#8b5cf6', 70, '#be185d'],
      'circle-radius': ['interpolate', ['linear'], ['get', 'laeq'], 45, 4, 75, 9], 'circle-opacity': 0.85,
    } });
  map.addLayer({ id: 'vlc-bikes', type: 'circle', source: 'vlc-bikes',
    paint: {
      'circle-color': ['case', ['==', ['get', 'available'], 0], '#ef4444', ['interpolate', ['linear'], ['get', 'ratio'], 0, '#f97316', 0.5, '#facc15', 1, '#16a34a']],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 16, 6], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1,
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
  map.addLayer({ id: 'vlc-alert-pulse', type: 'circle', source: 'vlc-alerts', filter: ['==', ['get', 'kind'], 'alert'],
    paint: { 'circle-color': SEVERITY_COLOR, 'circle-opacity': 0.25, 'circle-radius': 24, 'circle-stroke-color': SEVERITY_COLOR, 'circle-stroke-width': 2 } });
  map.addLayer({ id: 'vlc-alerts', type: 'circle', source: 'vlc-alerts', filter: ['==', ['get', 'kind'], 'alert'],
    paint: { 'circle-color': SEVERITY_COLOR, 'circle-radius': 8, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
  map.addLayer({ id: 'vlc-route-target', type: 'circle', source: 'vlc-alerts', filter: ['==', ['get', 'kind'], 'route-target'],
    paint: { 'circle-color': '#7c3aed', 'circle-radius': 9, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
}

const fmt = (v: unknown) => (typeof v === 'number' ? (v < 0 ? '—' : Number.isInteger(v) ? String(v) : v.toFixed(1)) : String(v ?? ''));

function popupHtml(p: Record<string, unknown>): string {
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const rows = (pairs: [string, unknown][]) => pairs.map(([k, v]) => `<tr><th>${k}</th><td>${esc(fmt(v))}</td></tr>`).join('');
  const title = `<strong>${esc(p.name)}</strong>`;
  switch (p.kind) {
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
  focus?: { lngLat: LngLat; seq: number };
  onBaseMap?: (online: boolean) => void;
}

export function CityMap({ snapshot, layers, perf, focus, onBaseMap }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);

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
        addOverlays(map!, perf, online && !!map!.getSource('openmaptiles'));
        mapRef.current = map!;
        setReady(true);
      });
      const clickable = ['vlc-traffic', 'vlc-bikes', 'vlc-air', 'vlc-noise', 'vlc-metro', 'vlc-port', 'vlc-incidents', 'vlc-alerts', 'vlc-landmarks', 'vlc-route-target'];
      for (const id of clickable) {
        map.on('click', id, (e) => {
          const f = e.features?.[0];
          if (!f) return;
          new maplibregl.Popup({ closeButton: true, maxWidth: '260px' }).setLngLat(e.lngLat).setHTML(popupHtml(f.properties as Record<string, unknown>)).addTo(map!);
        });
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
  }, [snapshot, ready]);

  // Interruptores de capas
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const [key, ids] of Object.entries(LAYER_GROUPS) as [LayerKey, string[]][]) {
      for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', layers[key] ? 'visible' : 'none');
    }
  }, [layers, ready]);

  useEffect(() => {
    if (focus && mapRef.current) mapRef.current.flyTo({ center: focus.lngLat, zoom: 15.5, pitch: 60, speed: 1.2 });
  }, [focus]);

  return <div ref={container} className="map" />;
}
