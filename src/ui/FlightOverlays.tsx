import { useEffect, useRef } from 'react';
import type { DroneController, DroneInput } from '../map/drone';
import type { GuidedState } from '../tour/guided';
import type { Tour } from '../tour/tours';

/** Tarjeta de la visita guiada: parada actual, anterior/siguiente y avance automático. */
export function GuidedCard({ tour, state, onPrev, onNext, onResume, onAutoplay, onExit }: {
  tour: Tour; state: GuidedState;
  onPrev: () => void; onNext: () => void; onResume: () => void; onAutoplay: (on: boolean) => void; onExit: () => void;
}) {
  const stop = tour.stops[state.index];
  const last = state.index === tour.stops.length - 1;
  return (
    <div className="guided-card" role="region" aria-label="Visita guiada">
      <div className="guided-top">
        <span className="muted small">{tour.title} · parada {state.index + 1} de {tour.stops.length}</span>
        <button className="link" onClick={onExit} aria-label="Salir de la visita">Salir ✕</button>
      </div>
      <i className="guided-accent" />
      <strong>{stop.name}</strong>
      {stop.subtitle && <span className="guided-sub">{stop.subtitle}</span>}
      <p className="muted small guided-hint">
        {state.flying ? 'Volando a la parada… toca el mapa para tomar el control.'
          : state.userControl ? 'Estás explorando libremente: arrastra, gira, haz zoom o usa el dron.'
          : 'Toca el mapa o el teclado para explorar por tu cuenta.'}
      </p>
      <div className="guided-actions">
        <button className="secondary" onClick={onPrev} disabled={state.index === 0}>← Anterior</button>
        {state.userControl && <button className="secondary" onClick={onResume}>↺ Volver a la parada</button>}
        <button className="file-btn" onClick={onNext} disabled={last}>Siguiente →</button>
      </div>
      <label className="switch small-switch">
        <span>Avance automático</span>
        <input type="checkbox" checked={state.autoplay} onChange={() => onAutoplay(!state.autoplay)} />
        <i aria-hidden />
      </label>
    </div>
  );
}

const PAD: [string, Partial<DroneInput>, string][] = [
  ['▲', { forward: 1 }, 'Avanzar'], ['▼', { forward: -1 }, 'Retroceder'],
  ['◀', { strafe: -1 }, 'Izquierda'], ['▶', { strafe: 1 }, 'Derecha'],
  ['↥', { climb: 1 }, 'Subir'], ['↧', { climb: -1 }, 'Bajar'],
  ['⟲', { yaw: -1 }, 'Girar a la izquierda'], ['⟳', { yaw: 1 }, 'Girar a la derecha'],
  ['⤒', { tilt: 1 }, 'Mirar al horizonte'], ['⤓', { tilt: -1 }, 'Mirar hacia abajo'],
];

/** Ayuda del modo dron y mandos táctiles (mantener pulsado). */
export function DroneHelp({ controller, onExit }: { controller: DroneController | undefined; onExit: () => void }) {
  const held = useRef(new Map<number, Partial<DroneInput>>());
  const sync = () => {
    const sum: Partial<DroneInput> = {};
    for (const v of held.current.values()) for (const [k, n] of Object.entries(v)) (sum as Record<string, number>)[k] = ((sum as Record<string, number>)[k] ?? 0) + (n as number);
    controller?.setTouch(sum);
  };
  useEffect(() => () => controller?.setTouch({}), [controller]);
  return (
    <div className="drone-help" role="region" aria-label="Controles del modo dron">
      <div className="guided-top">
        <strong>Modo dron</strong>
        <button className="link" onClick={onExit}>Salir ✕</button>
      </div>
      <p className="muted small keys">
        <kbd>W</kbd><kbd>S</kbd> avanzar · <kbd>A</kbd><kbd>D</kbd> lateral · <kbd>Q</kbd><kbd>E</kbd> bajar/subir ·
        <kbd>←</kbd><kbd>→</kbd> girar · <kbd>↑</kbd><kbd>↓</kbd> mirar · <kbd>Mayús</kbd> rápido. El ratón también funciona.
      </p>
      <div className="drone-pad">
        {PAD.map(([label, input, title], i) => (
          <button
            key={i}
            title={title}
            aria-label={title}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); held.current.set(e.pointerId, input); sync(); }}
            onPointerUp={(e) => { held.current.delete(e.pointerId); sync(); }}
            onPointerCancel={(e) => { held.current.delete(e.pointerId); sync(); }}
          >{label}</button>
        ))}
      </div>
    </div>
  );
}
