import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { CityRuntime } from './core/runtime';
import { detectPerformance } from './core/device';
import type { LngLat } from './core/types';
import { CityMap, type LayerKey } from './map/CityMap';
import { AlertsPanel, KpiBar, LayersPanel, ScenariosPanel, SourcesPanel } from './ui/Panels';
import { AnalysisPanel } from './ui/AnalysisPanel';
import { BimPanel, type BimModel } from './ui/BimPanel';
import { ServicesPanel } from './ui/ServicesPanel';
import { SERVICE_CATEGORIES } from './adapters/services';
import type { ServiceCategory } from './core/types';
import type { Map as MlMap } from 'maplibre-gl';
import { PORT_ASSETS } from './data/static';

const runtime = new CityRuntime();
type Tab = 'alerts' | 'sources' | 'layers' | 'analysis' | 'scenarios';

const ALL_LAYERS: Record<LayerKey, boolean> = {
  services: true, districts: true, ortho: false, terrain: false, bim: true,
  buildings: true, traffic: true, bikes: true, air: true, noise: false, metro: true, port: true, incidents: true, alerts: true, landmarks: true,
};

export default function App() {
  const perf = useMemo(detectPerformance, []);
  const snapshot = useSyncExternalStore(runtime.store.subscribe, runtime.store.getSnapshot);
  const [tab, setTab] = useState<Tab>('alerts');
  const [layers, setLayers] = useState(ALL_LAYERS);
  const [focus, setFocus] = useState<{ lngLat: LngLat; seq: number; zoom?: number }>();
  const [baseMapOnline, setBaseMapOnline] = useState<boolean>();
  const [collapsed, setCollapsed] = useState(false);
  const [showBaseMapToast, setShowBaseMapToast] = useState(true);
  const [map, setMap] = useState<MlMap>();
  const [serviceCats, setServiceCats] = useState<ServiceCategory[]>(SERVICE_CATEGORIES.map((c) => c.id));
  const [bimModel, setBimModel] = useState<BimModel>();
  const [bimAnchor, setBimAnchor] = useState<LngLat>(PORT_ASSETS[0].lngLat);
  const [bimRotation, setBimRotation] = useState(32);
  const bim = useMemo(
    () => (bimModel ? { geometry: bimModel.geometry, placement: { anchor: bimAnchor, rotationDeg: bimRotation }, seq: 0 } : undefined),
    [bimModel, bimAnchor, bimRotation],
  );

  useEffect(() => {
    if (baseMapOnline !== false) return;
    const t = setTimeout(() => setShowBaseMapToast(false), 6000);
    return () => clearTimeout(t);
  }, [baseMapOnline]);

  useEffect(() => {
    runtime.start();
    return () => runtime.stop();
  }, []);

  const critical = snapshot.alerts.filter((a) => a.severity === 'critical').length;
  const tabs: [Tab, string][] = [
    ['alerts', `Alertas${snapshot.alerts.length ? ` (${snapshot.alerts.length})` : ''}`],
    ['sources', 'Fuentes'],
    ['layers', 'Capas'],
    ['analysis', 'Análisis'],
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
        onMapReady={(m) => {
          setMap(m);
          if (import.meta.env.DEV) (window as unknown as { __map: MlMap }).__map = m;
        }}
        bim={bim}
        serviceCategories={serviceCats}
      />

      {baseMapOnline === false && showBaseMapToast && (
        <button className="toast" onClick={() => setShowBaseMapToast(false)}>Cartografía base no disponible: se muestran solo las capas de datos. ✕</button>
      )}
      {critical > 0 && collapsed && (
        <button className="toast danger" onClick={() => { setTab('alerts'); setCollapsed(false); }}>{critical} alerta(s) crítica(s) · ver</button>
      )}

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
          {tab === 'sources' && <SourcesPanel sources={snapshot.sources} perf={perf} baseMapOnline={baseMapOnline} districtsOfficial={snapshot.districtsOfficial} />}
          {tab === 'layers' && (
            <LayersPanel
              layers={layers}
              onToggle={(k) => setLayers((l) => ({ ...l, [k]: !l[k] }))}
              header={
                <ServicesPanel
                  services={snapshot.state.services}
                  status={snapshot.sources.find((s) => s.id === 'services')}
                  enabled={serviceCats}
                  onChange={(c) => {
                    setServiceCats(c);
                    if (c.length) setLayers((l) => ({ ...l, services: true }));
                  }}
                  onFocus={(p) => {
                    setFocus({ lngLat: p, seq: Date.now(), zoom: 17 });
                    if (window.innerWidth < 760) setCollapsed(true);
                  }}
                />
              }
            >
              <BimPanel
                model={bimModel}
                rotation={bimRotation}
                onLoaded={(m) => {
                  setBimModel(m);
                  setLayers((l) => ({ ...l, bim: true }));
                  setFocus({ lngLat: bimAnchor, seq: Date.now(), zoom: 16.5 });
                }}
                onRotate={setBimRotation}
                onPlaceAtCenter={() => map && setBimAnchor(map.getCenter().toArray() as LngLat)}
                onRemove={() => setBimModel(undefined)}
              />
            </LayersPanel>
          )}
          {tab === 'analysis' && <AnalysisPanel history={snapshot.history} />}
          {tab === 'scenarios' && <ScenariosPanel active={snapshot.overridesActive} onRun={(s) => { runtime.triggerScenario(s); if (s !== 'reset') setTab('alerts'); }} />}
        </div>
      </aside>
    </div>
  );
}
