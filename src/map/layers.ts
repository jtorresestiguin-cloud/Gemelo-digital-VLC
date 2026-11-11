/** Conversión del estado de la ciudad a GeoJSON para MapLibre. */
import type { FeatureCollection } from 'geojson';
import type { Alert, CityState } from '../core/types';
import { LANDMARKS, METRO_LINES, METRO_STATIONS, PORT_ASSETS } from '../data/static';

const fc = (features: FeatureCollection['features']): FeatureCollection => ({ type: 'FeatureCollection', features });

export const TRAFFIC_COLORS: Record<string, string> = {
  fluid: '#22c55e', dense: '#f59e0b', congested: '#ef4444', closed: '#111827', unknown: '#94a3b8',
};
export const TRAFFIC_LABELS: Record<string, string> = {
  fluid: 'Fluido', dense: 'Denso', congested: 'Congestionado', closed: 'Cortado', unknown: 'Sin datos',
};

export const trafficGeo = (s: CityState) =>
  fc(s.traffic.map((t) => ({
    type: 'Feature', geometry: { type: 'LineString', coordinates: t.coords },
    properties: { kind: 'traffic', name: t.name, state: t.state, label: TRAFFIC_LABELS[t.state] },
  })));

export const bikesGeo = (s: CityState) =>
  fc(s.bikes.map((b) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: b.lngLat },
    properties: { kind: 'bike', name: b.name, available: b.available, free: b.free, total: b.total, ratio: b.total ? b.available / b.total : 0 },
  })));

export const airGeo = (s: CityState) =>
  fc(s.air.map((a) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: a.lngLat },
    properties: { kind: 'air', name: a.name, no2: a.no2 ?? -1, pm10: a.pm10 ?? -1, pm25: a.pm25 ?? -1, o3: a.o3 ?? -1, quality: a.quality ?? '' },
  })));

export const noiseGeo = (s: CityState) =>
  fc(s.noise.map((n) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: n.lngLat },
    properties: { kind: 'noise', name: `Sensor ${n.id}`, laeq: n.laeq },
  })));

export const incidentsGeo = (s: CityState) =>
  fc(s.incidents.map((i) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: i.lngLat },
    properties: { kind: 'incident', name: i.id, type: i.type, severity: i.severity },
  })));

export function metroGeo(s: CityState) {
  const byLine = new Map(s.metro.map((l) => [l.id, l]));
  return fc(METRO_STATIONS.map((st) => {
    const worst = st.lines.map((id) => byLine.get(id)).reduce((acc, l) => {
      const rank = { ok: 0, delayed: 1, interrupted: 2 };
      return l && rank[l.status] > rank[acc] ? l.status : acc;
    }, 'ok' as 'ok' | 'delayed' | 'interrupted');
    const color = METRO_LINES.find((l) => l.id === st.lines[0])?.color ?? '#64748b';
    return {
      type: 'Feature', geometry: { type: 'Point', coordinates: st.lngLat },
      properties: { kind: 'metro', name: st.name, lines: st.lines.join(' · '), status: worst, color },
    };
  }));
}

export const portGeo = (s: CityState) =>
  fc(PORT_ASSETS.map((p) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: p.lngLat },
    properties: {
      kind: 'port', name: p.name, assetKind: p.kind,
      queue: p.kind === 'gate' ? s.port?.gateQueue ?? 0 : 0,
    },
  })));

export const landmarksGeo = () =>
  fc(LANDMARKS.map((l) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: l.lngLat }, properties: { kind: 'landmark', name: l.name } })));

export function alertsGeo(alerts: Alert[]) {
  const features: FeatureCollection['features'] = [];
  for (const a of alerts) {
    if (!a.lngLat) continue;
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: a.lngLat }, properties: { kind: 'alert', id: a.id, name: a.title, severity: a.severity } });
    if (a.recommendation?.target) {
      features.push({
        type: 'Feature', geometry: { type: 'LineString', coordinates: [a.lngLat, a.recommendation.target] },
        properties: { kind: 'route', id: a.id, severity: a.severity },
      });
      features.push({
        type: 'Feature', geometry: { type: 'Point', coordinates: a.recommendation.target },
        properties: { kind: 'route-target', name: a.recommendation.targetName ?? '', severity: a.severity },
      });
    }
  }
  return fc(features);
}
