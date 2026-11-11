import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { CityRuntime } from './core/runtime';
import { detectPerformance } from './core/device';
import type { LngLat } from './core/types';
import { CityMap, type LayerKey } from './map/CityMap';
import { AlertsPanel, KpiBar, LayersPanel, ScenariosPanel, SourcesPanel } from './ui/Panels';

const runtime = new CityRuntime();
type Tab = 'alerts' | 'sources' | 'layers' | 'scenarios';

const ALL_LAYERS: Record<LayerKey, boolean> = {
  buildings: true, traffic: true, bikes: true, air: true, noise: false, metro: true, port: true, incidents: true, alerts: true, landmarks: true,
};

export default function App() {
  const perf = useMemo(detectPerformance, []);
  const snapshot = useSyncExternalStore(runtime.store.subscribe, runtime.store.getSnapshot);
  const [tab, setTab] = useState<Tab>('alerts');
  const [layers, setLayers] = useState(ALL_LAYERS);
  const [focus, setFocus] = useState<{ lngLat: LngLat; seq: number }>();
  const [baseMapOnline, setBaseMapOnline] = useState<boolean>();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    runtime.start();
    return () => runtime.stop();
  }, []);

  const critical = snapshot.alerts.filter((a) => a.severity === 'critical').length;
  const tabs: [Tab, string][] = [
    ['alerts', `Alertas${snapshot.alerts.length ? ` (${snapshot.alerts.length})` : ''}`],
    ['sources', 'Fuentes'],
    ['layers', 'Capas'],
    ['scenarios', 'Escenarios'],
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>▮▮▮</span>
          <div>
            <h1>Gemelo Digital València</h1>
            <span className="muted">Movilidad, medio ambiente y puerto en tiempo real</span>
          </div>
        </div>
        <KpiBar snapshot={snapshot} />
      </header>

      <CityMap
        snapshot={snapshot}
        layers={layers}
        perf={perf}
        focus={focus}
        onBaseMap={setBaseMapOnline}
      />

      {baseMapOnline === false && <div className="toast">Cartografía base no disponible: se muestran solo las capas de datos.</div>}
      {critical > 0 && collapsed && <div className="toast danger">{critical} alerta(s) crítica(s)</div>}

      <aside className={`panel ${collapsed ? 'collapsed' : ''}`}>
        <div className="panel-handle" onClick={() => setCollapsed((c) => !c)} role="button" aria-label="Mostrar u ocultar panel">
          <span />
        </div>
        <nav className="tabs">
          {tabs.map(([id, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); setCollapsed(false); }}>{label}</button>
          ))}
        </nav>
        <div className="panel-body">
          {tab === 'alerts' && <AlertsPanel alerts={snapshot.alerts} onFocus={(p) => { setFocus({ lngLat: p, seq: Date.now() }); if (window.innerWidth < 760) setCollapsed(true); }} />}
          {tab === 'sources' && <SourcesPanel sources={snapshot.sources} perf={perf} baseMapOnline={baseMapOnline} />}
          {tab === 'layers' && <LayersPanel layers={layers} onToggle={(k) => setLayers((l) => ({ ...l, [k]: !l[k] }))} />}
          {tab === 'scenarios' && <ScenariosPanel active={snapshot.overridesActive} onRun={(s) => { runtime.triggerScenario(s); if (s !== 'reset') setTab('alerts'); }} />}
        </div>
      </aside>
    </div>
  );
}
