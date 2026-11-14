import { useEffect, useState } from 'react';
import type { BusTrack, SourceStatus } from '../core/types';
import type { LayerKey } from '../map/CityMap';
import type { BusColorMode } from '../map/transit';

interface Props {
  buses: BusTrack[];
  routes: number;
  stops: number;
  asOf?: number;
  status?: SourceStatus;
  mode: BusColorMode;
  onMode: (m: BusColorMode) => void;
  layers: Record<LayerKey, boolean>;
  onToggle: (k: LayerKey) => void;
}

const TOGGLES: [LayerKey, string][] = [
  ['emtBuses', 'Autobuses'],
  ['emtRoutes', 'Rutas de la EMT'],
  ['emtStops', 'Paradas (al acercarse)'],
  ['emtTrails', 'Estelas'],
  ['emtBuses3d', 'Autobuses en 3D (al acercarse)'],
  ['emtLabels', 'Etiquetas de línea y velocidad'],
];

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function freshness(asOf: number | undefined, now: number): string {
  if (!asOf) return 'esperando datos';
  const s = Math.max(0, Math.round((now - asOf) / 1000));
  return s < 90 ? `toma de hace ${s} s` : `toma de hace ${Math.round(s / 60)} min`;
}

export function TransitPanel({ buses, routes, stops, asOf, status, mode, onMode, layers, onToggle }: Props) {
  const now = useNow();
  const moving = buses.filter((b) => b.trail.length > 1 && b.speedKmh >= 3).length;
  const lines = new Set(buses.map((b) => b.line)).size;
  return (
    <div className="transit">
      <div className="live-head">
        <div>
          <strong>València en vivo</strong>
          <span className="muted small">Autobuses de la EMT, unos segundos detrás de la calle</span>
        </div>
        <span className={`live-chip ${status?.mode === 'error' ? 'bad' : ''}`}>● {freshness(asOf, now)}</span>
      </div>
      <div className="seg" role="group" aria-label="Color de los autobuses">
        <button className={mode === 'movement' ? 'active' : ''} onClick={() => onMode('movement')}>Movimiento</button>
        <button className={mode === 'speed' ? 'active' : ''} onClick={() => onMode('speed')}>Velocidad</button>
      </div>
      <div className="big-stat">
        <strong>{buses.length.toLocaleString('es-ES')}</strong>
        <span>autobuses de la EMT con posición en el Geoportal · {lines} líneas · {moving} en marcha</span>
      </div>
      {mode === 'speed' && (
        <div className="speed-legend" aria-label="Escala de velocidad">
          <span>0</span><i /><span>35+ km/h</span>
          <small className="muted">gris: aún sin velocidad (hace falta una segunda lectura)</small>
        </div>
      )}
      <p className="muted small">
        La EMT publica solo la posición, la línea y el trayecto. La velocidad y el rumbo se reconstruyen
        siguiendo cada autobús entre lecturas (cada 15 s). Toca un autobús para resaltar su línea.
      </p>
      <div className="toggles">
        {TOGGLES.map(([k, label]) => (
          <label key={k} className="switch">
            <span>{label}</span>
            <input type="checkbox" checked={layers[k]} onChange={() => onToggle(k)} />
            <i aria-hidden />
          </label>
        ))}
      </div>
      <p className="muted small">{routes} líneas trazadas · {stops.toLocaleString('es-ES')} paradas{status?.mode === 'error' && status.detail ? ` · ${status.detail}` : ''}</p>
    </div>
  );
}
