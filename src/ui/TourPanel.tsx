import { useMemo, useState } from 'react';
import type { PublicService } from '../core/types';
import { buildTimeline } from '../tour/camera';
import { LANDMARK_TOUR, parseTour, tourFromServices, type Tour } from '../tour/tours';
import type { VideoQuality } from '../tour/player';

interface Props {
  services: PublicService[];
  photoreal: boolean;
  onPlay: (tour: Tour, opts: { record: boolean; music: boolean; quality: VideoQuality }) => void;
  onGuided: (tour: Tour) => void;
  onClose: () => void;
}

const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function downloadJson(tour: Tour) {
  const blob = new Blob([JSON.stringify(tour, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${tour.id}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function TourPanel({ services, photoreal, onPlay, onGuided, onClose }: Props) {
  const [custom, setCustom] = useState<Tour>();
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState(LANDMARK_TOUR.id);
  const [music, setMusic] = useState(true);
  const [quality, setQuality] = useState<VideoQuality>('1080p');

  const tours = useMemo(() => {
    const list: Tour[] = [LANDMARK_TOUR];
    const fromData = [
      tourFromServices(services, { title: 'Hospitales públicos', filter: (s) => s.kind === 'Hospital' && !!s.publicFunded, max: 8 }),
      tourFromServices(services, { title: 'Mercados municipales', filter: (s) => s.category === 'market', max: 8 }),
      tourFromServices(services, { title: 'Museos de la ciudad', filter: (s) => s.kind === 'Museos', max: 8 }),
    ];
    fromData.forEach((t) => t && list.push(t));
    if (custom) list.push(custom);
    return list;
  }, [services, custom]);

  const tour = tours.find((t) => t.id === selected) ?? tours[0];
  const duration = buildTimeline(tour).duration;

  const onFile = async (f: File) => {
    try {
      const t = parseTour(JSON.parse(await f.text()));
      setCustom({ ...t, id: `propio-${t.id}` });
      setSelected(`propio-${t.id}`);
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="tour-panel" role="dialog" aria-label="Recorrido aéreo">
      <div className="tour-head">
        <strong>Recorrido aéreo</strong>
        <button className="link" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      <p className="muted small">
        Visita interactiva por la ciudad{photoreal ? ' fotorrealista' : ''}: la cámara te lleva a cada parada y, en cuanto
        tocas el mapa o el teclado, tomas el control y exploras libremente. También se puede grabar como vídeo.
      </p>
      <div className="tour-list">
        {tours.map((t) => (
          <label key={t.id} className={`tour-option ${t.id === tour.id ? 'on' : ''}`}>
            <input type="radio" name="tour" checked={t.id === tour.id} onChange={() => setSelected(t.id)} />
            <span>
              <strong>{t.title}</strong>
              <span className="muted small">{t.stops.length} paradas · {fmtDur(buildTimeline(t).duration)}{t.description ? ` · ${t.description}` : ''}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="row">
        <label className="file-btn secondary-file">
          Cargar guion (JSON)
          <input type="file" accept=".json,application/json" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        <button className="link" onClick={() => downloadJson(tour)}>Descargar este guion</button>
      </div>
      {error && <p className="error small">{error}</p>}
      <button className="file-btn big-action" onClick={() => onGuided(tour)}>▶ Empezar visita interactiva</button>
      <details className="video-options">
        <summary>Grabar como vídeo</summary>
      <div className="tour-options">
        <label className="switch"><span>Música generada</span><input type="checkbox" checked={music} onChange={() => setMusic(!music)} /><i aria-hidden /></label>
        <div className="seg" role="group" aria-label="Calidad del vídeo">
          <button className={quality === '720p' ? 'active' : ''} onClick={() => setQuality('720p')}>720p</button>
          <button className={quality === '1080p' ? 'active' : ''} onClick={() => setQuality('1080p')}>1080p</button>
        </div>
      </div>
      <div className="row tour-actions">
        <button className="secondary" onClick={() => onPlay(tour, { record: false, music, quality })}>▶ Ver como película ({fmtDur(duration)})</button>
        <button className="file-btn" onClick={() => onPlay(tour, { record: true, music, quality })}>● Grabar vídeo</button>
      </div>
      <p className="muted small">Al grabar, primero se carga la ciudad parada a parada y luego se graba en tiempo real. No cambies de pestaña mientras tanto.</p>
      </details>
    </div>
  );
}
