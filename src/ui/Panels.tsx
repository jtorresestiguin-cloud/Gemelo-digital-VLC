import type React from 'react';
import type { Snapshot } from '../core/store';
import type { Alert, LngLat, SourceStatus } from '../core/types';
import type { LayerKey } from '../map/CityMap';
import type { ScenarioName } from '../sim/protocols';
import { RULES } from '../core/rules';
import { ZONE_BY_ID } from '../data/static';
import type { PerfSettings } from '../core/device';

const MODE_LABEL: Record<SourceStatus['mode'], string> = {
  connecting: 'Conectando…', live: 'Datos reales', simulated: 'Simulado', error: 'Error',
};
const SEVERITY_LABEL = { critical: 'Crítica', warning: 'Aviso', info: 'Info' };
const SOURCE_SHORT: Record<string, string> = {
  traffic: 'Tráfico', bikes: 'Valenbisi', air: 'Aire', weather: 'Meteo', iot: 'IoT', metro: 'Metro', port: 'Puerto', services: 'Servicios', emt: 'EMT',
};

const ago = (ts?: number) => {
  if (!ts) return '—';
  const s = Math.round((Date.now() - ts) / 1000);
  return s < 60 ? `hace ${s} s` : `hace ${Math.round(s / 60)} min`;
};

export function KpiBar({ snapshot }: { snapshot: Snapshot }) {
  const s = snapshot.state;
  const known = s.traffic.filter((t) => t.state !== 'unknown');
  const jam = known.length ? known.filter((t) => t.state === 'congested' || t.state === 'dense' || t.state === 'closed').length / known.length : 0;
  const no2 = s.air.map((a) => a.no2).filter((v): v is number => v !== undefined);
  const bikes = s.bikes.reduce((n, b) => n + b.available, 0);
  const metroBad = s.metro.filter((l) => l.status !== 'ok').length;
  const critical = snapshot.alerts.filter((a) => a.severity === 'critical').length;
  const w = s.weather;
  const kpis: [string, string, string?][] = [
    ['Alertas', `${snapshot.alerts.length}`, critical ? 'bad' : snapshot.alerts.length ? 'warn' : 'ok'],
    ['Congestión', `${Math.round(jam * 100)}%`, jam > 0.5 ? 'bad' : jam > 0.3 ? 'warn' : 'ok'],
    ['NO₂ máx.', no2.length ? `${Math.round(Math.max(...no2))} µg/m³` : '—', no2.length && Math.max(...no2) >= 150 ? 'bad' : undefined],
    ['Tiempo', w ? `${Math.round(w.temperature)}° · ${w.precipitation.toFixed(1)} mm/h` : '—', w && w.precipitation >= 15 ? 'bad' : w && w.precipitation >= 2 ? 'warn' : undefined],
    ['EMT', `${s.buses.length} buses`, s.buses.length ? 'ok' : undefined],
    ['Valenbisi', `${bikes} bicis`],
    ['Metro', metroBad ? `${metroBad} líneas afectadas` : 'Normal', metroBad ? 'warn' : 'ok'],
    ['Puerto', s.port ? `${s.port.gateQueue} camiones` : '—', s.port && s.port.gateQueue >= 40 ? 'warn' : undefined],
  ];
  return (
    <div className="kpis">
      {kpis.map(([k, v, tone]) => (
        <div key={k} className={`kpi ${tone ?? ''}`}>
          <span>{k}</span>
          <strong>{v}</strong>
        </div>
      ))}
    </div>
  );
}

export function AlertsPanel({ alerts, onFocus }: { alerts: Alert[]; onFocus: (p: LngLat) => void }) {
  if (!alerts.length) {
    return <p className="empty">Sin alertas activas. Prueba un escenario en la pestaña «Escenarios» para ver el motor de reglas en acción.</p>;
  }
  return (
    <ul className="alerts">
      {alerts.map((a) => (
        <li key={a.id} className={`alert ${a.severity}`}>
          <div className="alert-head">
            <span className={`badge ${a.severity}`}>{SEVERITY_LABEL[a.severity]}</span>
            <span className="muted">{a.ruleId} · {ZONE_BY_ID[a.zoneId]?.name ?? 'Toda la ciudad'} · {ago(a.since)}</span>
          </div>
          <h3>{a.title}</h3>
          <p>{a.description}</p>
          {a.recommendation && <p className="reco">➜ {a.recommendation.text}</p>}
          <div className="alert-foot">
            <span className="chips">{a.sources.map((s) => <span key={s} className="chip">{SOURCE_SHORT[s]}</span>)}</span>
            {a.lngLat && <button onClick={() => onFocus(a.lngLat!)}>Ver en mapa</button>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SourcesPanel({ sources, perf, baseMapOnline, districtsOfficial }: { sources: SourceStatus[]; perf: PerfSettings; baseMapOnline?: boolean; districtsOfficial: boolean }) {
  return (
    <>
      <ul className="sources">
        {sources.map((s) => (
          <li key={s.id}>
            <span className={`dot ${s.mode}`} />
            <div>
              <div className="src-name">{s.name} <span className="proto">{s.protocol}</span></div>
              <div className="muted">{s.provider} · {MODE_LABEL[s.mode]} · {s.messages} msg · {ago(s.lastUpdate)}</div>
              {s.detail && <div className="muted small">{s.detail}</div>}
            </div>
          </li>
        ))}
      </ul>
      <div className="note">
        <p><strong>Cartografía:</strong> {baseMapOnline === false ? 'no disponible (modo sin conexión)' : 'OpenStreetMap vía OpenFreeMap, edificios con altura real'}.</p>
        <p><strong>Límites de distrito:</strong> {districtsOfficial ? 'oficiales (datos abiertos del Ajuntament)' : 'aproximados a partir de los centroides (el servicio oficial no responde)'}.</p>
        <p><strong>Perfil de rendimiento:</strong> {perf.profile} (pixel ratio {perf.pixelRatio}, edificios desde zoom {perf.buildingsMinZoom}).</p>
        <p className="muted small">Los datos públicos (tráfico, Valenbisi, calidad del aire, meteorología) son reales cuando la API responde. Los sistemas cerrados (sensores IoT, Metrovalencia, PLCs del puerto) están simulados con el formato exacto de cada protocolo, listos para conectar drivers reales.</p>
      </div>
    </>
  );
}

/** Las capas de la EMT tienen su propio panel («València en vivo»). */
const LAYER_LABELS: Partial<Record<LayerKey, string>> = {
  services: 'Servicios públicos',
  districts: 'Distritos (coloreados por alertas)', ortho: 'Ortofoto PNOA (IGN)', terrain: 'Relieve 3D',
  bim: 'Modelo BIM', buildings: 'Edificios 3D', traffic: 'Tráfico', bikes: 'Valenbisi', air: 'Calidad del aire', noise: 'Ruido (IoT)',
  metro: 'Metro', port: 'Puerto', incidents: 'Incidencias', alerts: 'Alertas y rutas', landmarks: 'Puntos de interés',
};

export function LayersPanel({ layers, onToggle, children, header }: { layers: Record<LayerKey, boolean>; onToggle: (k: LayerKey) => void; children?: React.ReactNode; header?: React.ReactNode }) {
  return (
    <div className="layers">
      {header}
      <h4 className="layers-title">Capas</h4>
      {(Object.keys(LAYER_LABELS) as LayerKey[]).map((k) => (
        <label key={k}>
          <input type="checkbox" checked={layers[k]} onChange={() => onToggle(k)} /> {LAYER_LABELS[k]}
        </label>
      ))}
      <div className="legend">
        <h4>Tráfico</h4>
        <span><i style={{ background: '#22c55e' }} />Fluido</span>
        <span><i style={{ background: '#f59e0b' }} />Denso</span>
        <span><i style={{ background: '#ef4444' }} />Congestionado</span>
        <span><i style={{ background: '#111827' }} />Cortado</span>
        <h4>NO₂ (µg/m³)</h4>
        <span><i style={{ background: '#22c55e' }} />&lt;40</span>
        <span><i style={{ background: '#84cc16' }} />40–90</span>
        <span><i style={{ background: '#f59e0b' }} />90–150</span>
        <span><i style={{ background: '#ef4444' }} />150–200</span>
        <span><i style={{ background: '#7f1d1d' }} />&gt;200</span>
      </div>
      {children}
    </div>
  );
}

const SCENARIOS: { id: ScenarioName; title: string; text: string }[] = [
  { id: 'accidente-lluvia', title: 'Choque + atasco + lluvia', text: 'Accidente en la Av. del Port con lluvia fuerte (22 mm/h). Dispara R1 (crítica, ruta en metro) y R3 (riesgo de inundación).' },
  { id: 'episodio-no2', title: 'Episodio de NO₂', text: 'Subida de NO₂ con congestión en L’Eixample y Extramurs. Dispara R2.' },
  { id: 'colapso-puerto', title: 'Colapso en accesos al puerto', text: 'Cola de camiones (OPC UA) y atasco en Poblats Marítims. Dispara R4.' },
  { id: 'averia-metro', title: 'Avería en metro', text: 'Interrupción en L5 y retrasos en L3 (GTFS-RT) con congestión en el centro. Dispara R6.' },
];

export function ScenariosPanel({ onRun, active }: { onRun: (s: ScenarioName) => void; active: boolean }) {
  return (
    <div className="scenarios">
      <p className="muted">Inyecta situaciones durante 5 minutos para ver cómo el motor de reglas cruza fuentes.</p>
      {SCENARIOS.map((s) => (
        <button key={s.id} className="scenario" onClick={() => onRun(s.id)}>
          <strong>{s.title}</strong>
          <span>{s.text}</span>
        </button>
      ))}
      <button className="reset" disabled={!active} onClick={() => onRun('reset')}>Restablecer</button>
      <h4>Reglas activas</h4>
      <ul className="rules">
        {RULES.map((r) => <li key={r.id}><strong>{r.id} · {r.name}.</strong> {r.description}</li>)}
      </ul>
    </div>
  );
}
