import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MlMap, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Snapshot } from '../core/store';
import type { PerfSettings } from '../core/device';
import type { LngLat } from '../core/types';
import { VALENCIA_BOUNDS, VALENCIA_CENTER } from '../data/static';
import type { IfcGeometry } from '../bim/ifc';
import type { BimPlacement } from '../bim/BimLayer';
import {
  TRAFFIC_COLORS, airGeo, alertsGeo, districtsGeo, bikesGeo, incidentsGeo, landmarksGeo, metroGeo, noiseGeo, portGeo, trafficGeo,
} from './layers';

export type LayerKey = 'districts' | 'ortho' | 'terrain' | 'bim' | 'buildings' | 'traffic' | 'bikes' | 'air' | 'noise' | 'metro' | 'port' | 'incidents' | 'alerts' | 'landmarks';

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
  districts: ['vlc-districts-fill', 'vlc-districts-line'],
  ortho: ['vlc-ortho'],
  terrain: [],
  bim: ['vlc-bim'],
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

/** Ortofoto PNOA de máxima actualidad (© Instituto Geográfico Nacional), servicio WMTS. */
const PNOA_TILES = 'https://www.ign.es/wmts/pnoa-ma?layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/jpeg&TileMatrix={z}&TileCol={x}&TileRow={y}';
/** Modelo digital de elevaciones global (Terrarium, AWS Open Data). */
const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

function addOverlays(map: MlMap, perf: PerfSettings, hasOsm: boolean) {
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
}

export function CityMap({ snapshot, layers, perf, focus, onBaseMap, onMapReady, bim }: Props) {
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
        onMapReady?.(map!);
      });
      const clickable = ['vlc-districts-fill', 'vlc-traffic', 'vlc-bikes', 'vlc-air', 'vlc-noise', 'vlc-metro', 'vlc-port', 'vlc-incidents', 'vlc-alerts', 'vlc-landmarks', 'vlc-route-target'];
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
    set('districts', districtsGeo(snapshot.districts, snapshot.alerts));
  }, [snapshot, ready]);

  // Interruptores de capas
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const [key, ids] of Object.entries(LAYER_GROUPS) as [LayerKey, string[]][]) {
      for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', layers[key] ? 'visible' : 'none');
    }
    map.setTerrain(layers.terrain ? { source: 'vlc-terrain', exaggeration: 1.5 } : null);
  }, [layers, ready]);

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
    if (focus && mapRef.current) mapRef.current.flyTo({ center: focus.lngLat, zoom: focus.zoom ?? 15.5, pitch: 60, speed: 1.2 });
  }, [focus]);

  return <div ref={container} className="map" />;
}
