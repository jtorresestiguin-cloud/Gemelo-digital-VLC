import { CAMERA_PRESETS, type CameraPreset } from '../data/static';
import type { MapTheme } from '../map/theme';

interface Props {
  theme: MapTheme;
  orbit: boolean;
  onTheme: (t: MapTheme) => void;
  onOrbit: (on: boolean) => void;
  onGo: (p: CameraPreset) => void;
  onRecord: () => void;
}

/** Barra inferior del mapa: atajos de cámara, tema, giro y modo grabación. */
export function MapToolbar({ theme, orbit, onTheme, onOrbit, onGo, onRecord }: Props) {
  return (
    <div className="map-toolbar">
      <div className="goto" role="group" aria-label="Ir a">
        <span className="muted">Ir a</span>
        {CAMERA_PRESETS.map((p) => (
          <button key={p.id} onClick={() => onGo(p)}>{p.label}</button>
        ))}
      </div>
      <div className="toolbar-actions">
        <button className={theme === 'night' ? 'on' : ''} onClick={() => onTheme(theme === 'night' ? 'day' : 'night')} title="Cambiar entre mapa de noche y de día">
          {theme === 'night' ? '☾ Noche' : '☀ Día'}
        </button>
        <button className={orbit ? 'on' : ''} onClick={() => onOrbit(!orbit)} title="La cámara gira lentamente alrededor de la ciudad">
          ⟳ Girar
        </button>
        <button onClick={onRecord} title="Oculta los paneles y deja solo el mapa (tecla R)">● Grabar</button>
      </div>
    </div>
  );
}
