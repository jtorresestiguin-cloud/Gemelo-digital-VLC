import { useMemo } from 'react';
import type { RealisticOptions, RealisticStatus } from '../realistic/RealisticLayer';
import { sunTimes } from '../realistic/geo';
import { VALENCIA_CENTER } from '../data/static';

interface Props {
  options: RealisticOptions | null;
  status: RealisticStatus | null;
  onChange: (o: RealisticOptions | null) => void;
  defaultShadows: boolean;
}


const fmtHour = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

export function RealisticPanel({ options, status, onChange, defaultShadows }: Props) {
  const on = options !== null;
  const opts = options ?? { hour: null, shadows: defaultShadows };
  // momentos del día calculados con la salida y la puesta de sol reales de hoy en València
  const t = useMemo(() => sunTimes(new Date(), VALENCIA_CENTER[1], VALENCIA_CENTER[0]), []);
  const round = (h: number) => Math.round(h * 4) / 4;
  const MOMENTS: [string, number | null][] = [
    ['Ahora', null], ['Mañana', round(t.sunrise + 2)], ['Mediodía', round(t.noon)],
    ['Atardecer', round(t.sunset - 0.5)], ['Noche', round(t.sunset + 1.5)],
  ];
  return (
    <div className="photoreal realistic">
      <h4>Ciudad realista 3D</h4>
      <p className="muted small">
        Sin cuentas ni registros: foto aérea real del IGN sobre el suelo y los tejados, edificios con su altura,
        los 158.000 árboles del inventario municipal y el sol en su posición real.
      </p>
      <label className="switch">
        <span>Activar ciudad realista</span>
        <input type="checkbox" checked={on} onChange={() => onChange(on ? null : opts)} />
        <i aria-hidden />
      </label>
      {on && (
        <>
          <div className="seg moments" role="group" aria-label="Hora del sol">
            {MOMENTS.map(([label, h]) => (
              <button key={label} className={opts.hour === h ? 'active' : ''} onClick={() => onChange({ ...opts, hour: h })}>{label}</button>
            ))}
          </div>
          <label className="slider">
            Hora del sol: {opts.hour === null ? 'la actual' : fmtHour(opts.hour)} · hoy sale a las {fmtHour(t.sunrise)} y se pone a las {fmtHour(t.sunset)}
            <input type="range" min={5} max={23.5} step={0.25} value={opts.hour ?? new Date().getHours() + new Date().getMinutes() / 60}
              onChange={(e) => onChange({ ...opts, hour: +e.target.value })} />
          </label>
          <label className="switch small-switch">
            <span>Sombras (más exigente para el equipo)</span>
            <input type="checkbox" checked={opts.shadows} onChange={() => onChange({ ...opts, shadows: !opts.shadows })} />
            <i aria-hidden />
          </label>
          <p className="muted small">
            {status?.error ? <span className="error">{status.error}</span>
              : status ? `${status.buildings.toLocaleString('es-ES')} edificios · ${status.trees.toLocaleString('es-ES')} árboles${status.loading ? ' · cargando…' : ''}`
              : 'Cargando la ciudad…'}
          </p>
          <p className="muted small">Consejo: acércate (zoom 16–18) e inclina la vista; con el dron (W A S D) puedes volar entre los edificios.</p>
        </>
      )}
    </div>
  );
}
