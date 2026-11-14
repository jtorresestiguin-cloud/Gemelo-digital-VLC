import { useState } from 'react';
import type { PhotorealState } from '../map/google3d';

interface Props {
  enabled: boolean;
  state: PhotorealState;
  /** clave inyectada al compilar (secreto del repositorio) */
  buildKey?: string;
  savedKey?: string;
  onSaveKey: (k: string | undefined) => void;
  onToggle: (on: boolean) => void;
}

export function PhotorealPanel({ enabled, state, buildKey, savedKey, onSaveKey, onToggle }: Props) {
  const [draft, setDraft] = useState('');
  const key = buildKey || savedKey;
  return (
    <div className="photoreal">
      <h4>Vista fotorrealista 3D (Google)</h4>
      <p className="muted small">
        Ciudad en 3D fotorrealista (fotogrametría aérea de Google) con los datos del gemelo encima.
        Mientras está activa se oculta el mapa base de OpenStreetMap, como exigen las condiciones de Google.
      </p>
      {!key && (
        <>
          <div className="row">
            <input
              className="search"
              type="password"
              autoComplete="off"
              placeholder="Clave de Google Maps Platform (Map Tiles API)"
              value={draft}
              onChange={(e) => setDraft(e.target.value.trim())}
            />
          </div>
          <div className="row">
            <button className="file-btn" disabled={draft.length < 20} onClick={() => { onSaveKey(draft); setDraft(''); onToggle(true); }}>
              Guardar y activar
            </button>
          </div>
          <p className="muted small">
            La clave se guarda solo en este navegador. Para que funcione para todos, guárdala como secreto
            <code> GOOGLE_MAPS_KEY</code> del repositorio (ver README).
          </p>
        </>
      )}
      {key && (
        <label className="switch">
          <span>Activar vista fotorrealista</span>
          <input type="checkbox" checked={enabled} onChange={() => onToggle(!enabled)} />
          <i aria-hidden />
        </label>
      )}
      {enabled && state.state === 'loading' && <p className="muted small">Comprobando la clave y cargando los modelos 3D…</p>}
      {state.state === 'error' && <p className="error small">{state.message}</p>}
      {key && !buildKey && (
        <button className="link" onClick={() => { onToggle(false); onSaveKey(undefined); }}>Olvidar la clave de este navegador</button>
      )}
    </div>
  );
}
