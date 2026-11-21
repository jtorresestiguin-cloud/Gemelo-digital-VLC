import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import type { CityState, SourceStatus } from '../core/types';
import { AIR_LEVELS, BIKE_COLORS, TRAFFIC_COLORS, TRAFFIC_LABELS } from '../map/layers';

import { extras, pollenLevel, uvLevel, type ExtraLayer, type ForecastHorizon } from '../live/extras';

export type LiveLayer = 'traffic' | 'air' | 'bikes' | 'parking' | 'forecast' | 'works' | 'metroLive' | 'beaches' | 'noiseLive';

/** Interruptor del panel → fuente de datos adicional. */
export const EXTRA_SOURCE: Partial<Record<LiveLayer, ExtraLayer>> = {
  parking: 'parking', forecast: 'forecast', works: 'works', metroLive: 'metro', beaches: 'beaches', noiseLive: 'noise',
};

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
  const x = useSyncExternalStore(extras.subscribe, extras.get);
  // tiempo, mar, polen y UV: dos consultas ligeras que se muestran siempre en la cabecera
  useEffect(() => {
    extras.enable('sea', true);
    extras.enable('sky', true);
  }, []);
  const extraStatus = (id: LiveLayer) => {
    const k = EXTRA_SOURCE[id]!;
    if (!layers[id]) return '';
    if (x.errors[k] && !x.info[k]) return 'Sin conexión con la fuente; reintentando…';
    return x.info[k] ? `${x.info[k]} · ${ago(x.updated[k])}` : 'Cargando…';
  };
  const topPollen = x.sky?.pollen[0];
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
      {(x.sea || x.sky) && (
        <div className="live-now">
          {x.sea && <span title="Temperatura del agua y altura de las olas frente a la Malva-rosa">🌊 Mar {Math.round(x.sea.water)}° · olas {x.sea.wave.toLocaleString('es-ES', { maximumFractionDigits: 1 })} m</span>}
          {x.sky && <span title="Índice ultravioleta">☀ UV {Math.round(x.sky.uv)} {uvLevel(x.sky.uv)}</span>}
          {topPollen && <span title={x.sky!.pollen.map((p) => `${p.name}: ${Math.round(p.value)} granos/m³`).join('\n')}>🌼 Polen {pollenLevel(topPollen.value)}{topPollen.value >= 1 ? ` (${topPollen.name})` : ''}</span>}
        </div>
      )}
      <div className="live-group">Movilidad</div>
      {row('traffic', '🚗', 'Tráfico', status('traffic', state.traffic.length, 'tramos') + (layers.traffic && jams ? ` · ${jams} con retención` : ''), (
        <div className="legend">
          {(['fluid', 'dense', 'congested', 'closed'] as const).map((k) => (
            <span key={k}><i className={`bar ${k === 'closed' ? 'dashed' : ''}`} style={{ background: TRAFFIC_COLORS[k] }} />{TRAFFIC_LABELS[k]}</span>
          ))}
        </div>
      ))}
      {row('parking', '🅿️', 'Aparcamientos públicos', extraStatus('parking'), (
        <div className="legend">
          <span><i className="dot" style={{ background: '#34d399' }} />Libres</span>
          <span><i className="dot" style={{ background: '#fbbf24' }} />Pocas</span>
          <span><i className="dot" style={{ background: '#f43f5e' }} />Casi lleno</span>
          <span><i className="dot" style={{ background: '#94a3b8' }} />Sin dato en vivo</span>
        </div>
      ))}
      {row('forecast', '🕒', 'Aparcamiento en calle (previsión)', extraStatus('forecast'), (
        <>
          <div className="seg live-seg" role="group" aria-label="Horizonte de la previsión">
            {([1, 6, 12, 24] as ForecastHorizon[]).map((h) => (
              <button key={h} className={x.horizon === h ? 'active' : ''} onClick={() => extras.setHorizon(h)}>{h} h</button>
            ))}
          </div>
          <div className="legend scale"><i style={{ background: '#34d399' }} /><i style={{ background: '#fbbf24' }} /><i style={{ background: '#f43f5e' }} /></div>
          <div className="legend-ends muted small"><span>Mucho sitio</span><span>Lleno</span></div>
        </>
      ))}
      {row('works', '🚧', 'Obras en la vía pública', extraStatus('works'), (
        <div className="legend">
          <span><i className="bar dashed-o" />Ocupan calzada</span>
          <span><i className="bar dashed-y" />Acera o aparcamiento</span>
        </div>
      ))}
      {row('metroLive', 'Ⓜ️', 'Metro: estaciones', extraStatus('metroLive'), (
        <div className="muted small">Toca una estación para ver sus próximos trenes.</div>
      ))}
      {row('bikes', '🚲', 'Valenbisi', status('bikes', state.bikes.length, 'estaciones'), (
        <div className="legend">
          <span><i className="dot" style={{ background: BIKE_COLORS.many }} />Con bicis</span>
          <span><i className="dot" style={{ background: BIKE_COLORS.few }} />Pocas</span>
          <span><i className="dot" style={{ background: BIKE_COLORS.empty }} />Vacía</span>
        </div>
      ))}
      <div className="live-group">Medio ambiente</div>
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
      {row('noiseLive', '🔊', 'Ruido (Russafa)', extraStatus('noiseLive'), (
        <>
          <div className="legend scale"><i style={{ background: '#c4b5fd' }} /><i style={{ background: '#8b5cf6' }} /><i style={{ background: '#be185d' }} /></div>
          <div className="legend-ends muted small"><span>55 dB</span><span>75 dB</span></div>
          <div className="muted small live-note">Nivel medio día-tarde-noche de ayer; la OMS recomienda menos de 53 dB.</div>
        </>
      ))}
      {row('beaches', '🏖️', 'Playas: calidad del agua', extraStatus('beaches'), (
        <>
          <div className="legend">
            <span><i className="dot" style={{ background: '#38bdf8' }} />Excelente</span>
            <span><i className="dot" style={{ background: '#34d399' }} />Buena</span>
            <span><i className="dot" style={{ background: '#fbbf24' }} />Suficiente</span>
            <span><i className="dot" style={{ background: '#f43f5e' }} />Insuficiente</span>
          </div>
          <div className="muted small live-note">Clasificación oficial de la última temporada de baño (junio–septiembre).</div>
        </>
      ))}
    </section>
  );
}
