import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
import { PORT_ASSETS, type CameraPreset } from './data/static';
import { MapToolbar } from './ui/MapToolbar';
import { TransitPanel } from './ui/TransitPanel';
import type { BusColorMode } from './map/transit';
import { PhotorealPanel } from './ui/PhotorealPanel';
import type { PhotorealCredential, PhotorealState } from './map/google3d';
import { TourPanel } from './ui/TourPanel';
import { DroneHelp, GuidedCard } from './ui/FlightOverlays';
import { DroneController } from './map/drone';
import { GuidedTour, type GuidedState } from './tour/guided';
import { playTour, type TourHandle } from './tour/player';
import type { Tour } from './tour/tours';
import type { TourFrame } from './tour/camera';

const BUILD_CRED: PhotorealCredential | undefined = import.meta.env.VITE_CESIUM_ION_TOKEN
  ? { provider: 'ion', token: import.meta.env.VITE_CESIUM_ION_TOKEN }
  : import.meta.env.VITE_GOOGLE_MAPS_KEY
    ? { provider: 'google', key: import.meta.env.VITE_GOOGLE_MAPS_KEY }
    : undefined;

/** Credencial guardada en este navegador (con compatibilidad con la clave de Google anterior). */
function readSavedCred(): PhotorealCredential | undefined {
  const c = readPref<PhotorealCredential | undefined>('vlc-photoreal-cred', undefined);
  if (c) return c;
  const legacy = readPref<string | undefined>('vlc-google-key', undefined);
  return legacy ? { provider: 'google', key: legacy } : undefined;
}
import type { MapTheme } from './map/theme';

const readPref = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
};
const writePref = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* sin almacenamiento */
  }
};

const runtime = new CityRuntime();
type Tab = 'alerts' | 'sources' | 'layers' | 'analysis' | 'scenarios';

const ALL_LAYERS: Record<LayerKey, boolean> = {
  emtBuses: true, emtBuses3d: true, emtLabels: true, emtTrails: true, emtRoutes: true, emtStops: true,
  services: true, districts: true, ortho: false, terrain: false, bim: true,
  buildings: true, traffic: true, bikes: true, air: true, noise: false, metro: true, port: true, incidents: true, alerts: true, landmarks: true,
};

export default function App() {
  const perf = useMemo(detectPerformance, []);
  const snapshot = useSyncExternalStore(runtime.store.subscribe, runtime.store.getSnapshot);
  const [tab, setTab] = useState<Tab>('layers');
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
  const [theme, setTheme] = useState<MapTheme>(() => readPref('vlc-theme', 'night'));
  const [orbit, setOrbit] = useState(false);
  const [camera, setCamera] = useState<{ preset: CameraPreset; seq: number }>();
  const [recording, setRecording] = useState(false);
  const [busMode, setBusMode] = useState<BusColorMode>('movement');
  const [savedCred, setSavedCred] = useState<PhotorealCredential | undefined>(readSavedCred);
  const [photoreal, setPhotoreal] = useState(false);
  const [photorealState, setPhotorealState] = useState<PhotorealState>({ state: 'off' });
  const activeCred = BUILD_CRED ?? savedCred;
  // la ciudad fotorrealista se ve de día (como una foto); al salir se recupera el tema anterior
  const themeBeforePhotoreal = useRef<MapTheme | null>(null);
  useEffect(() => {
    if (photoreal && themeBeforePhotoreal.current === null) {
      themeBeforePhotoreal.current = theme;
      setTheme('day');
    } else if (!photoreal && themeBeforePhotoreal.current !== null) {
      setTheme(themeBeforePhotoreal.current);
      themeBeforePhotoreal.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoreal]);
  const [tourOpen, setTourOpen] = useState(false);
  const [drone, setDrone] = useState(false);
  const [droneCtl, setDroneCtl] = useState<DroneController>();
  const [guided, setGuided] = useState<{ ctl: GuidedTour; state: GuidedState }>();

  // Modo dron: el controlador vive mientras el modo está activo
  useEffect(() => {
    if (!map || !drone) return;
    const ctl = new DroneController(map);
    ctl.start();
    setDroneCtl(ctl);
    setOrbit(false);
    return () => {
      ctl.stop();
      setDroneCtl(undefined);
    };
  }, [map, drone]);

  const startGuided = (tour: Tour) => {
    if (!map) return;
    setTourOpen(false);
    setOrbit(false);
    guided?.ctl.dispose();
    const ctl = new GuidedTour(map, tour, (state) => setGuided((g) => (g ? { ...g, state } : g)));
    setGuided({ ctl, state: { index: 0, flying: true, userControl: false, autoplay: false } });
    ctl.goTo(0);
  };
  const exitGuided = () => {
    guided?.ctl.dispose();
    setGuided(undefined);
  };
  const [tourRun, setTourRun] = useState<{ tour: Tour; handle: TourHandle; record: boolean; frame?: TourFrame; t: number; total: number; status?: string }>();
  const [videoUrl, setVideoUrl] = useState<{ url: string; name: string }>();
  const photorealRef = useRef(photorealState);
  photorealRef.current = photorealState;

  const startTour = (tour: Tour, o: { record: boolean; music: boolean; quality: '720p' | '1080p' }) => {
    if (!map) return;
    exitGuided();
    setDrone(false);
    setTourOpen(false);
    setOrbit(false);
    setVideoUrl(undefined);
    const handle = playTour(map, tour, {
      ...o,
      attribution: () => {
        const p = photorealRef.current;
        return p.state === 'on' ? `Google${p.credits ? ` · ${p.credits}` : ''}` : '© OpenStreetMap · OpenFreeMap · Ajuntament de València';
      },
      onFrame: (frame, t, total) => setTourRun((r) => (r ? { ...r, frame, t, total } : r)),
      onStatus: (status) => setTourRun((r) => (r ? { ...r, status } : r)),
    });
    setTourRun({ tour, handle, record: o.record, t: 0, total: 0 });
    handle.done.then((video) => {
      setTourRun(undefined);
      if (video) {
        const date = new Date().toISOString().slice(0, 10);
        setVideoUrl({ url: URL.createObjectURL(video.blob), name: `gemelo-valencia-${tour.id}-${date}.${video.extension}` });
      }
    });
  };

  useEffect(() => writePref('vlc-theme', theme), [theme]);

  // Modo grabación: R para entrar/salir, Esc para salir
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea')) return;
      if (e.key === 'r' || e.key === 'R') setRecording((r) => !r);
      if (e.key === 'Escape') setRecording(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
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
    ['layers', 'En vivo y capas'],
    ['analysis', 'Análisis'],
    ['scenarios', 'Escenarios'],
  ];

  return (
    <div className={`app ${recording || tourRun ? 'recording' : ''} ${guided || drone ? 'flying' : ''}`} data-theme={theme}>
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
        theme={theme}
        orbit={orbit}
        camera={camera}
        busColorMode={busMode}
        photorealCred={photoreal && activeCred ? activeCred : null}
        onPhotoreal={(st) => {
          setPhotorealState(st);
          if (st.state === 'error') setPhotoreal(false);
        }}
      />
      {photoreal && photorealState.state === 'on' && (
        <div className="google-attrib" aria-label="Atribución de Google">
          <strong>Google</strong>
          {photorealState.credits && <span>{photorealState.credits}</span>}
        </div>
      )}

      <MapToolbar
        theme={theme}
        orbit={orbit}
        onTheme={setTheme}
        onOrbit={setOrbit}
        onGo={(preset) => setCamera({ preset, seq: Date.now() })}
        onRecord={() => setRecording(true)}
        onTour={() => setTourOpen((v) => !v)}
        drone={drone}
        onDrone={setDrone}
        photoreal={photoreal}
        onPhotoreal={() => {
          if (activeCred) {
            setPhotoreal((v) => !v);
            setPhotorealState({ state: photoreal ? 'off' : 'loading' });
          } else {
            setTab('layers');
            setCollapsed(false);
          }
        }}
      />
      {guided && !tourRun && (
        <GuidedCard
          tour={guided.ctl.tour}
          state={guided.state}
          onPrev={() => guided.ctl.prev()}
          onNext={() => guided.ctl.next()}
          onResume={() => guided.ctl.resume()}
          onAutoplay={(on) => guided.ctl.setAutoplay(on)}
          onExit={exitGuided}
        />
      )}
      {drone && !tourRun && <DroneHelp controller={droneCtl} onExit={() => setDrone(false)} />}
      {tourOpen && !tourRun && (
        <TourPanel
          services={snapshot.state.services}
          photoreal={photorealState.state === 'on'}
          onPlay={startTour}
          onGuided={startGuided}
          onClose={() => setTourOpen(false)}
        />
      )}
      {tourRun && (() => {
        const f = tourRun.frame;
        const stop = f ? tourRun.tour.stops[f.stopIndex] : undefined;
        const p = f?.holdProgress ?? 0;
        const last = f?.stopIndex === tourRun.tour.stops.length - 1;
        const alpha = Math.min(1, p * 4, (1 - p) * 4 + (last ? 1 : 0));
        return (
          <>
            {stop && !tourRun.status && (
              <div className="tour-title" style={{ opacity: alpha }}>
                <i />
                <strong>{stop.name}</strong>
                {stop.subtitle && <span>{stop.subtitle}</span>}
              </div>
            )}
            <div className="tour-bar">
              {tourRun.record && <span className="rec">● REC</span>}
              <span>{tourRun.status || `${tourRun.tour.title} · ${Math.floor(tourRun.t)} / ${Math.round(tourRun.total)} s`}</span>
              <progress max={tourRun.total || 1} value={tourRun.t} />
              <button onClick={() => tourRun.handle.stop()}>■ Detener</button>
            </div>
          </>
        );
      })()}
      {videoUrl && (
        <div className="toast video-ready">
          Vídeo listo · <a href={videoUrl.url} download={videoUrl.name}>Descargar {videoUrl.name.split('.').pop()?.toUpperCase()}</a>
          <button className="link" onClick={() => setVideoUrl(undefined)}>✕</button>
        </div>
      )}
      {recording && (
        <button className="record-exit" onClick={() => setRecording(false)}>Modo grabación · pulsa R o Esc para salir</button>
      )}

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
                <>
                <PhotorealPanel
                  enabled={photoreal}
                  state={photorealState}
                  buildCred={BUILD_CRED}
                  savedCred={savedCred}
                  onSaveCred={(c) => {
                    setSavedCred(c);
                    if (c) writePref('vlc-photoreal-cred', c);
                    else try { localStorage.removeItem('vlc-photoreal-cred'); localStorage.removeItem('vlc-google-key'); } catch { /* sin almacenamiento */ }
                  }}
                  onToggle={(on) => {
                    setPhotoreal(on);
                    if (on) setPhotorealState({ state: 'loading' });
                  }}
                />
                <TransitPanel
                  buses={snapshot.state.buses}
                  routes={snapshot.state.busRoutes.length}
                  stops={snapshot.state.busStops.length}
                  asOf={snapshot.state.busesAsOf}
                  status={snapshot.sources.find((s) => s.id === 'emt')}
                  mode={busMode}
                  onMode={setBusMode}
                  layers={layers}
                  onToggle={(k) => setLayers((l) => ({ ...l, [k]: !l[k] }))}
                />
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
                </>
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
