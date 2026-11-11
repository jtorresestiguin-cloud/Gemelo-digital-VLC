/** Gráficas SVG ligeras: líneas finas, ejes discretos, tooltip con cruceta al pasar el puntero. */
import { useState, type PointerEvent } from 'react';

export const SERIES = { dry: '#3987e5', wet: '#d95926' };

interface SparkProps {
  label: string;
  unit: string;
  points: { t: number; v: number | null }[];
  format?: (v: number) => string;
}

const hhmm = (t: number) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

/** Pequeño múltiplo de una sola serie (el título nombra la serie: sin leyenda). */
export function Sparkline({ label, unit, points, format = (v) => String(Math.round(v)) }: SparkProps) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 300, H = 56, P = 4;
  const valid = points.filter((p): p is { t: number; v: number } => p.v !== null);
  const last = valid[valid.length - 1];
  if (valid.length < 2) {
    return (
      <div className="spark">
        <div className="spark-head"><span>{label}</span><strong>{last ? `${format(last.v)} ${unit}` : '—'}</strong></div>
        <div className="spark-empty">Recogiendo datos… (una muestra cada 30 s)</div>
      </div>
    );
  }
  const t0 = valid[0].t, t1 = last.t;
  const vMax = Math.max(...valid.map((p) => p.v), 1);
  const x = (t: number) => P + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * P);
  const y = (v: number) => H - P - (v / vMax) * (H - 2 * P);
  const d = valid.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const tx = t0 + ((e.clientX - r.left) / r.width) * (t1 - t0);
    let best = 0;
    valid.forEach((p, i) => { if (Math.abs(p.t - tx) < Math.abs(valid[best].t - tx)) best = i; });
    setHover(best);
  };
  const h = hover !== null ? valid[hover] : null;
  return (
    <div className="spark">
      <div className="spark-head">
        <span>{label}</span>
        <strong>{h ? `${format(h.v)} ${unit} · ${hhmm(h.t)}` : `${format(last.v)} ${unit}`}</strong>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`${label}: último valor ${format(last.v)} ${unit}`}>
        <line x1={P} x2={W - P} y1={H - P} y2={H - P} className="axis" />
        <path d={d} fill="none" stroke={SERIES.dry} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {h && <line x1={x(h.t)} x2={x(h.t)} y1={P} y2={H - P} className="crosshair" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="spark-axis"><span>{hhmm(t0)}</span><span>máx. {format(vMax)}</span><span>{hhmm(t1)}</span></div>
    </div>
  );
}

interface HourRates { hour: number; dry: number; wet: number; wetHours: number }

/** Tasa de accidentes por hora del día, en seco frente a con lluvia (2 series, eje único). */
export function RateByHourChart({ data }: { data: HourRates[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const W = 340, H = 170, L = 30, R = 44, T = 10, B = 22;
  const max = Math.max(...data.flatMap((d) => [d.dry, d.wet]), 0.1);
  const x = (h: number) => L + (h / 23) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const path = (k: 'dry' | 'wet') => data.map((d, i) => `${i ? 'L' : 'M'}${x(d.hour).toFixed(1)},${y(d[k]).toFixed(1)}`).join('');
  const ticks = [0, max / 2, max];
  // etiquetas directas al final de cada línea, separadas si quedan demasiado juntas
  let yDry = y(data[23].dry) + 3, yWet = y(data[23].wet) + 3;
  if (Math.abs(yDry - yWet) < 11) {
    const mid = (yDry + yWet) / 2, up = yWet <= yDry;
    yWet = mid + (up ? -6 : 6);
    yDry = mid + (up ? 6 : -6);
  }
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(23, Math.round(((px - L) / (W - L - R)) * 23))));
  };
  const h = hover !== null ? data[hover] : null;
  const fmt = (v: number) => v.toFixed(2);
  return (
    <div className="chart">
      <div className="chart-head">
        <div className="legend-inline">
          <span><i style={{ background: SERIES.dry }} />Seco</span>
          <span><i style={{ background: SERIES.wet }} />Con lluvia</span>
        </div>
        <button className="link" onClick={() => setTable((t) => !t)}>{table ? 'Ver gráfica' : 'Ver tabla'}</button>
      </div>
      {table ? (
        <table className="data-table">
          <thead><tr><th>Hora</th><th>Seco</th><th>Lluvia</th><th>Horas con lluvia</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.hour}><td>{d.hour}:00</td><td>{fmt(d.dry)}</td><td>{fmt(d.wet)}</td><td>{d.wetHours}</td></tr>)}</tbody>
        </table>
      ) : (
        <div className="chart-plot">
          <svg viewBox={`0 0 ${W} ${H}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label="Accidentes por hora según la hora del día, en seco y con lluvia">
            {ticks.map((v) => (
              <g key={v}>
                <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" />
                <text x={L - 4} y={y(v) + 3} textAnchor="end" className="tick">{v.toFixed(1)}</text>
              </g>
            ))}
            {[0, 6, 12, 18, 23].map((hh) => <text key={hh} x={x(hh)} y={H - 6} textAnchor="middle" className="tick">{hh}h</text>)}
            <path d={path('dry')} fill="none" stroke={SERIES.dry} strokeWidth={2} strokeLinejoin="round" />
            <path d={path('wet')} fill="none" stroke={SERIES.wet} strokeWidth={2} strokeLinejoin="round" />
            <text x={W - R + 4} y={yDry} className="direct">Seco</text>
            <text x={W - R + 4} y={yWet} className="direct">Lluvia</text>
            {h && (
              <g>
                <line x1={x(h.hour)} x2={x(h.hour)} y1={T} y2={H - B} className="crosshair" />
                <circle cx={x(h.hour)} cy={y(h.dry)} r={4} fill={SERIES.dry} className="ring" />
                <circle cx={x(h.hour)} cy={y(h.wet)} r={4} fill={SERIES.wet} className="ring" />
              </g>
            )}
          </svg>
          {h && (
            <div className="tooltip" style={{ left: `${(x(h.hour) / W) * 100}%` }}>
              <strong>{h.hour}:00–{h.hour}:59</strong>
              <span><i style={{ background: SERIES.dry }} />Seco {fmt(h.dry)} acc./h</span>
              <span><i style={{ background: SERIES.wet }} />Lluvia {fmt(h.wet)} acc./h</span>
              <span className="muted">{h.wetHours} h con lluvia</span>
            </div>
          )}
          <div className="muted small">Accidentes por hora (eje vertical) según la hora del día.</div>
        </div>
      )}
    </div>
  );
}
