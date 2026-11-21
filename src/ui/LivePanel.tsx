import type { ReactNode } from 'react';
import type { CityState, SourceStatus } from '../core/types';
import { AIR_LEVELS, BIKE_COLORS, TRAFFIC_COLORS, TRAFFIC_LABELS } from '../map/layers';

export type LiveLayer = 'traffic' | 'air' | 'bikes';

interface Props {
  state: CityState;
  sources: SourceStatus[];
  layers: Record<LiveLayer, boolean>;
  onToggle: (k: LiveLayer) => void;
}

const ago = (t?: number) => {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 1 ? 'ahora' : `hace ${m} min`;
};

/** Código WMO → icono y texto breves. */
export function weatherLabel(code: number): [string, string] {
  if (code === 0) return ['☀️', 'Despejado'];
  if (code <= 2) return ['🌤️', 'Poco nuboso'];
  if (code === 3) return ['☁️', 'Nublado'];
  if (code <= 48) return ['🌫️', 'Niebla'];
  if (code <= 67 || (code >= 80 && code <= 82)) return ['🌧️', 'Lluvia'];
  if (code <= 77) return ['🌨️', 'Nieve'];
  return ['⛈️', 'Tormenta'];
}

/** «Ciudad en vivo»: tres capas en tiempo real, apagadas por defecto, con su leyenda solo al encenderlas. */
export function LivePanel({ state, sources, layers, onToggle }: Props) {
  const src = (id: string) => sources.find((s) => s.id === id);
  const status = (id: LiveLayer, count: number, unit: string) => {
    const s = src(id);
    if (!layers[id]) return '';
    if (s?.mode === 'error' && !count) return 'Sin conexión con la fuente; reintentando…';
    if (!count) return 'Cargando…';
    return `${count.toLocaleString('es-ES')} ${unit} · ${ago(s?.lastUpdate)}`;
  };
  const w = state.weather;
  const weatherLive = src('weather')?.mode === 'live';
  const [icon, sky] = w ? weatherLabel(w.weatherCode) : ['', ''];
  const jams = state.traffic.filter((t) => t.state === 'congested' || t.state === 'dense').length;
  const worstAir = [...state.air].sort((a, b) => (b.no2 ?? -1) - (a.no2 ?? -1))[0];

  const row = (id: LiveLayer, emoji: string, label: string, info: string, legend: ReactNode) => (
    <div className={`live-row ${layers[id] ? 'on' : ''}`}>
      <label className="switch">
        <span><span className="live-ico" aria-hidden>{emoji}</span>{label}</span>
        <input type="checkbox" checked={layers[id]} onChange={() => onToggle(id)} />
        <i aria-hidden />
      </label>
      {layers[id] && (
        <div className="live-detail">
          {info && <div className="muted small">{info}</div>}
          {legend}
        </div>
      )}
    </div>
  );

  return (
    <section className="live">
      <h4>
        Ciudad en vivo
        {w && weatherLive && <span className="live-weather" title={sky}>{icon} {Math.round(w.temperature)}° · {Math.round(w.windSpeed)} km/h</span>}
      </h4>
      {row('traffic', '🚗', 'Tráfico', status('traffic', state.traffic.length, 'tramos') + (layers.traffic && jams ? ` · ${jams} con retención` : ''), (
        <div className="legend">
          {(['fluid', 'dense', 'congested', 'closed'] as const).map((k) => (
            <span key={k}><i className={`bar ${k === 'closed' ? 'dashed' : ''}`} style={{ background: TRAFFIC_COLORS[k] }} />{TRAFFIC_LABELS[k]}</span>
          ))}
        </div>
      ))}
      {row('air', '🌿', 'Calidad del aire', status('air', state.air.length, 'estaciones'), (
        <>
          <div className="legend scale">
            {AIR_LEVELS.slice(0, 5).map((l) => <i key={l.label} title={l.label} style={{ background: l.color }} />)}
          </div>
          <div className="legend-ends muted small"><span>Buena</span><span>Muy desfavorable</span></div>
          {worstAir?.no2 !== undefined && (
            <div className="muted small">Más NO₂ ahora: {worstAir.name} ({worstAir.no2} µg/m³)</div>
          )}
          <div className="muted small live-note">La red municipal mide NO₂, partículas y ozono; no mide CO₂.</div>
        </>
      ))}
      {row('bikes', '🚲', 'Valenbisi', status('bikes', state.bikes.length, 'estaciones'), (
        <div className="legend">
          <span><i className="dot" style={{ background: BIKE_COLORS.many }} />Con bicis</span>
          <span><i className="dot" style={{ background: BIKE_COLORS.few }} />Pocas</span>
          <span><i className="dot" style={{ background: BIKE_COLORS.empty }} />Vacía</span>
        </div>
      ))}
    </section>
  );
}
