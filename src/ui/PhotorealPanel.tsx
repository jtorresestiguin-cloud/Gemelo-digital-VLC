import { useState } from 'react';
import type { PhotorealCredential, PhotorealState } from '../map/google3d';

interface Props {
  enabled: boolean;
  state: PhotorealState;
  /** credencial inyectada al compilar (secreto del repositorio) */
  buildCred?: PhotorealCredential;
  savedCred?: PhotorealCredential;
  onSaveCred: (c: PhotorealCredential | undefined) => void;
  onToggle: (on: boolean) => void;
}

type Provider = PhotorealCredential['provider'];

export function PhotorealPanel({ enabled, state, buildCred, savedCred, onSaveCred, onToggle }: Props) {
  const [provider, setProvider] = useState<Provider>('ion');
  const [draft, setDraft] = useState('');
  const cred = buildCred ?? savedCred;
  const save = () => {
    onSaveCred(provider === 'ion' ? { provider: 'ion', token: draft } : { provider: 'google', key: draft });
    setDraft('');
    onToggle(true);
  };
  return (
    <div className="photoreal">
      <h4>Ciudad fotorrealista 3D</h4>
      <p className="muted small">
        Los modelos 3D fotorrealistas de Google (fotogrametría aérea: fachadas, árboles, barcos…), los mismos del vídeo
        de Palma. Encima se mantienen los datos del gemelo y se puede volar con el dron o la visita guiada.
      </p>
      {!cred && (
        <>
          <div className="seg" role="group" aria-label="Proveedor">
            <button className={provider === 'ion' ? 'active' : ''} onClick={() => setProvider('ion')}>Cesium ion (gratis)</button>
            <button className={provider === 'google' ? 'active' : ''} onClick={() => setProvider('google')}>Clave de Google</button>
          </div>
          {provider === 'ion' ? (
            <ol className="steps small">
              <li>Crea una cuenta gratuita en <a href="https://ion.cesium.com/signup" target="_blank" rel="noopener">ion.cesium.com</a> (no pide tarjeta).</li>
              <li>En <em>Asset Depot</em>, busca «Google Photorealistic 3D Tiles» y pulsa <em>Add to my assets</em>.</li>
              <li>En <em>Access Tokens</em>, copia el <em>Default Token</em> (o crea uno) y pégalo aquí.</li>
            </ol>
          ) : (
            <ol className="steps small">
              <li>En Google Cloud, activa la facturación y la <em>Map Tiles API</em>.</li>
              <li>Crea una clave de API restringida a este dominio y a la Map Tiles API.</li>
              <li>Pégala aquí (detalles en el README).</li>
            </ol>
          )}
          <input
            className="search"
            type="password"
            autoComplete="off"
            placeholder={provider === 'ion' ? 'Token de acceso de Cesium ion' : 'Clave de Google Maps Platform'}
            value={draft}
            onChange={(e) => setDraft(e.target.value.trim())}
          />
          <button className="file-btn big-action" disabled={draft.length < 20} onClick={save}>Guardar y ver la ciudad fotorrealista</button>
          <p className="muted small">Se guarda solo en este navegador. Para que la vean todos los visitantes, guárdalo como secreto del repositorio (ver README).</p>
        </>
      )}
      {cred && (
        <>
          <label className="switch">
            <span>Ciudad fotorrealista ({cred.provider === 'ion' ? 'Cesium ion' : 'Google'})</span>
            <input type="checkbox" checked={enabled} onChange={() => onToggle(!enabled)} />
            <i aria-hidden />
          </label>
          {!buildCred && (
            <button className="link" onClick={() => { onToggle(false); onSaveCred(undefined); }}>Olvidar la credencial de este navegador</button>
          )}
        </>
      )}
      {enabled && state.state === 'loading' && <p className="muted small">Cargando los modelos 3D…</p>}
      {state.state === 'error' && <p className="error small">{state.message}</p>}
    </div>
  );
}
