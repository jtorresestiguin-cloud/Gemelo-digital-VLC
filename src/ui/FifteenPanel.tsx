import { useSyncExternalStore } from 'react';
import { ESSENTIALS, LIMIT_MIN } from '../analysis/fifteen';
import { fifteen, type FifteenMode } from '../analysis/fifteenData';

interface Props {
  on: boolean;
  onToggle: () => void;
  /** acercar el mapa a un barrio */
  onBarrio: (name: string) => void;
}

const pct = (x: number) => `${Math.round(x)} %`;
const tone = (x: number) => (x >= 90 ? 'good' : x >= 70 ? 'mid' : 'bad');

/** Análisis «ciudad de los 15 minutos»: cifra clave, cobertura por función y barrios con menos acceso. */
export function FifteenPanel({ on, onToggle, onBarrio }: Props) {
  const s = useSyncExternalStore(fifteen.subscribe, fifteen.get);
  const d = s.data;
  const worst = d ? [...d.result.barrios.values()].filter((b) => b.pop > 500).sort((a, b) => a.avgScore - b.avgScore).slice(0, 5) : [];

  return (
    <section className="live fifteen">
      <div className="live-group">Análisis</div>
      <div className={`live-row ${on ? 'on' : ''}`}>
        <label className="switch">
          <span><span className="live-ico" aria-hidden>🚶</span>Ciudad de los 15 minutos</span>
          <input type="checkbox" checked={on} onChange={onToggle} />
          <i aria-hidden />
        </label>
        {on && (
          <div className="live-detail">
            {s.status === 'loading' && <div className="muted small">Calculando para las 593 secciones censales…</div>}
            {s.status === 'error' && <div className="muted small">No se pudo calcular: {s.error}</div>}
            {d && (
              <>
                <div className="f15-head">
                  <b className={tone(d.result.city.full)}>{pct(d.result.city.full)}</b>
                  <span>de los vecinos tiene los 7 servicios esenciales a menos de {LIMIT_MIN} min a pie</span>
                </div>
                <div className="f15-bars">
                  {ESSENTIALS.map((e) => {
                    const v = d.result.city.byEssential[e.id];
                    return (
                      <button key={e.id} className={`f15-bar ${s.mode === e.id ? 'on' : ''}`} onClick={() => fifteen.setMode(s.mode === e.id ? 'score' : (e.id as FifteenMode))} title={`Ver en el mapa el tiempo hasta: ${e.label}`}>
                        <span>{e.icon} {e.label}</span>
                        <i><i className={tone(v)} style={{ width: `${v}%` }} /></i>
                        <em>{pct(v)}</em>
                      </button>
                    );
                  })}
                </div>
                <div className="legend scale"><i style={{ background: '#f43f5e' }} /><i style={{ background: '#fbbf24' }} /><i style={{ background: '#34d399' }} /></div>
                <div className="legend-ends muted small">
                  {s.mode === 'score' ? <><span>Pocos servicios cerca</span><span>Los 7</span></> : <><span>+25 min</span><span>Menos de 10 min</span></>}
                </div>
                <div className="muted small">
                  {s.mode === 'score' ? 'Mapa: servicios esenciales a menos de 15 min. Toca una barra para ver uno solo.' : `Mapa: minutos a pie hasta ${ESSENTIALS.find((e) => e.id === s.mode)!.label.toLowerCase()}. Toca otra vez para volver.`}
                </div>
                {worst.length > 0 && (
                  <div className="f15-worst">
                    <div className="muted small">Barrios con menos acceso</div>
                    {worst.map((b) => (
                      <button key={b.name} onClick={() => onBarrio(b.name)}>
                        <span>{b.name}</span>
                        <em>{b.avgScore.toFixed(1)}/7 · falta {ESSENTIALS.find((e) => e.id === b.weakest)!.label.toLowerCase()}</em>
                      </button>
                    ))}
                  </div>
                )}
                <div className="muted small live-note">
                  Toca cualquier punto del mapa para ver qué tienes cerca. Tiempo a pie estimado: distancia en línea recta × 1,3 a 4,8 km/h.
                  Población: Padrón municipal 1/1/2024 por sección censal.
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
