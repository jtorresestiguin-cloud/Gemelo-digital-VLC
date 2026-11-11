import { useState } from 'react';
import type { IfcGeometry } from '../bim/ifc';

export interface BimModel {
  name: string;
  geometry: IfcGeometry;
}

interface Props {
  model?: BimModel;
  rotation: number;
  onLoaded: (m: BimModel) => void;
  onRotate: (deg: number) => void;
  onPlaceAtCenter: () => void;
  onRemove: () => void;
}

export function BimPanel({ model, rotation, onLoaded, onRotate, onPlaceAtCenter, onRemove }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const load = async (name: string, getBytes: () => Promise<ArrayBuffer>) => {
    setBusy(true);
    setError(undefined);
    try {
      const { loadIfc } = await import('../bim/BimLayer');
      const geometry = await loadIfc(new Uint8Array(await getBytes()));
      if (!geometry.indices.length) throw new Error('El IFC no contiene geometría 3D');
      onLoaded({ name, geometry });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const size = model && model.geometry.bbox.max.map((v, i) => v - model.geometry.bbox.min[i]);

  return (
    <div className="bim">
      <h4>Modelos BIM (IFC)</h4>
      <p className="muted small">Se abren en el navegador con web-ifc (WebAssembly) y se colocan sobre la ciudad. El archivo no sale de tu dispositivo.</p>
      <div className="row">
        <label className="file-btn">
          {busy ? 'Procesando…' : 'Abrir IFC…'}
          <input type="file" accept=".ifc" disabled={busy} onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void load(f.name, () => f.arrayBuffer());
          }} />
        </label>
        <button className="secondary" disabled={busy} onClick={() => load('Terminal de ejemplo', async () => (await fetch(`${import.meta.env.BASE_URL}bim/ejemplo-terminal.ifc`)).arrayBuffer())}>
          Modelo de ejemplo
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {model && size && (
        <div className="bim-info">
          <p><strong>{model.name}</strong> · {model.geometry.elements} elementos · {Math.round(size[0])} × {Math.round(size[2])} m, {Math.round(size[1])} m de alto</p>
          <label className="slider">
            Orientación {rotation}°
            <input type="range" min={0} max={359} value={rotation} onChange={(e) => onRotate(+e.target.value)} />
          </label>
          <div className="row">
            <button className="secondary" onClick={onPlaceAtCenter}>Colocar en el centro del mapa</button>
            <button className="secondary" onClick={onRemove}>Quitar</button>
          </div>
        </div>
      )}
    </div>
  );
}
