import { CAMERA_PRESETS, type CameraPreset } from '../data/static';
import type { MapTheme } from '../map/theme';

interface Props {
  minimized: boolean;
  onMinimize: (m: boolean) => void;
  theme: MapTheme;
  orbit: boolean;
  onTheme: (t: MapTheme) => void;
  onOrbit: (on: boolean) => void;
  onGo: (p: CameraPreset) => void;
  onRecord: () => void;
  onTour: () => void;
  drone: boolean;
  onDrone: (on: boolean) => void;
  photoreal: boolean;
  onPhotoreal: () => void;
}

/** Barra inferior del mapa: atajos de cámara, tema, giro y modo grabación. */
export function MapToolbar({ minimized, onMinimize, theme, orbit, onTheme, onOrbit, onGo, onRecord, onTour, drone, onDrone, photoreal, onPhotoreal }: Props) {
  if (minimized) {
    return (
      <div className="map-toolbar">
        <div className="toolbar-actions">
          <button onClick={() => onMinimize(false)} title="Mostrar el menú" aria-label="Mostrar el menú">☰ Menú</button>
        </div>
      </div>
    );
  }
  return (
    <div className="map-toolbar">
      <div className="goto" role="group" aria-label="Ir a">
        <span className="muted">Ir a</span>
        {CAMERA_PRESETS.map((p) => (
          <button key={p.id} onClick={() => onGo(p)}>{p.label}</button>
        ))}
      </div>
      <div className="toolbar-actions">
        <button onClick={() => onMinimize(true)} title="Minimizar el menú" aria-label="Minimizar el menú">‹</button>
        <button className={theme === 'night' ? 'on' : ''} onClick={() => onTheme(theme === 'night' ? 'day' : 'night')} title="Cambiar entre mapa de noche y de día">
          {theme === 'night' ? '☾ Noche' : '☀ Día'}
        </button>
        <button className={orbit ? 'on' : ''} onClick={() => onOrbit(!orbit)} title="La cámara gira lentamente alrededor de la ciudad">
          ⟳ Girar
        </button>
        <button className={photoreal ? 'on' : ''} onClick={onPhotoreal} title="Ciudad fotorrealista 3D (modelos de Google)">🌍 Realista</button>
        <button className={drone ? 'on' : ''} onClick={() => onDrone(!drone)} title="Vuela libremente: W A S D, Q/E, flechas, Mayús">🛩 Dron</button>
        <button onClick={onTour} title="Vuelo cinematográfico por la ciudad, en directo o grabado a vídeo">✈ Recorrido</button>
        <button onClick={onRecord} title="Oculta los paneles y deja solo el mapa (tecla R)">◻ Solo mapa</button>
      </div>
    </div>
  );
}
