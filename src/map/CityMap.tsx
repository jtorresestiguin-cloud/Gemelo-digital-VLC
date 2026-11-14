import { useEffect, useRef, useState } from 'react';
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
import { enablePhotoreal, type PhotorealState } from './google3d';
import type { IfcGeometry } from '../bim/ifc';
import type { BimPlacement } from '../bim/BimLayer';
import {
  TRAFFIC_COLORS, airGeo, alertsGeo, districtsGeo, servicesGeo, bikesGeo, incidentsGeo, landmarksGeo, metroGeo, noiseGeo, portGeo, trafficGeo,
} from './layers';

export type LayerKey = 'emtBuses' | 'emtBuses3d' | 'emtLabels' | 'emtTrails' | 'emtRoutes' | 'emtStops' | 'services' | 'districts' | 'ortho' | 'terrain' | 'bim' | 'buildings' | 'traffic' | 'bikes' | 'air' | 'noise' | 'metro' | 'port' | 'incidents' | 'alerts' | 'landmarks';

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

  map.addLayer({ id: 'vlc-traffic-casing', type: 'line', source: 'vlc-traffic', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#0f172a', 'line-opacity': 0.35, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 3, 16, 9] } });
  map.addLayer({ id: 'vlc-traffic', type: 'line', source: 'vlc-traffic', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['match', ['get', 'state'], 'fluid', TRAFFIC_COLORS.fluid, 'dense', TRAFFIC_COLORS.dense, 'congested', TRAFFIC_COLORS.congested, 'closed', TRAFFIC_COLORS.closed, TRAFFIC_COLORS.unknown],
      'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.8, 16, 6],
    } });
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
  /** clave de Google para la vista fotorrealista; null = desactivada */
  photorealKey: string | null;
  onPhotoreal: (s: PhotorealState) => void;
  /** la cámara gira lentamente alrededor del centro */
  orbit: boolean;
  camera?: { preset: CameraPreset; seq: number };
}

export function CityMap({ snapshot, layers, perf, focus, onBaseMap, onMapReady, bim, serviceCategories, theme, orbit, camera, busColorMode, photorealKey, onPhotoreal }: Props) {
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
      const clickable = ['vlc-emt-buses', 'vlc-emt-bodies', 'vlc-emt-labels', 'vlc-emt-stops', 'vlc-services', 'vlc-districts-fill', 'vlc-traffic', 'vlc-bikes', 'vlc-air', 'vlc-noise', 'vlc-metro', 'vlc-port', 'vlc-incidents', 'vlc-alerts', 'vlc-landmarks', 'vlc-route-target'];
      // Un único manejador: ficha solo del elemento más alto bajo el puntero (los distritos quedan debajo)
      let popup: maplibregl.Popup | undefined;
      map.on('click', (e) => {
        const layers = clickable.filter((id) => map!.getLayer(id));
        const pad = 4;
        const f = map!.queryRenderedFeatures([[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]], { layers })[0];
        popup?.remove();
        const props = (f?.properties ?? {}) as Record<string, unknown>;
        highlightLine(map!, props.kind === 'bus' ? String(props.line) : null);
        if (!f) return;
        popup = new maplibregl.Popup({ closeButton: true, maxWidth: '260px' }).setLngLat(e.lngLat).setHTML(popupHtml(f.properties as Record<string, unknown>)).addTo(map!);
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
      const hiddenByPhotoreal = photorealOn.current && (key === 'buildings' || key === 'ortho');
      for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', layers[key] && !hiddenByPhotoreal ? 'visible' : 'none');
    }
    if (!photorealOn.current) map.setTerrain(layers.terrain ? { source: 'vlc-terrain', exaggeration: 1.5 } : null);
  }, [layers, ready]);

  // Vista fotorrealista de Google (deck.gl se descarga solo al activarla)
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !photorealKey) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    photorealOn.current = true;
    enablePhotoreal(map, photorealKey, onPhotoreal)
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
  }, [photorealKey, ready]);

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
