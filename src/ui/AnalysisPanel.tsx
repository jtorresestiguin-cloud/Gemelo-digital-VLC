import { useState } from 'react';
import type { KpiSample } from '../core/history';
import {
  analyzeRain, dateRange, fetchHourlyRain, parseAccidentCsv, syntheticStudyData, type RainStudy,
} from '../analysis/accidents';
import { RateByHourChart, Sparkline } from './charts';

interface Result { study: RainStudy; label: string; synthetic: boolean; skipped?: number }

const fmtN = (n: number) => n.toLocaleString('es-ES');
const fmtRR = (v: number) => (Number.isFinite(v) ? v.toFixed(2).replace('.', ',') : '—');

export function AnalysisPanel({ history }: { history: KpiSample[] }) {
  const [result, setResult] = useState<Result>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const series = (k: keyof KpiSample) => history.map((s) => ({ t: s.t, v: s[k] as number | null }));

  const onFile = async (file: File) => {
    setBusy(true);
    setError(undefined);
    try {
      const parsed = parseAccidentCsv(await file.text());
      if (!parsed.keys.length) throw new Error('No se pudo leer ninguna fecha y hora del CSV');
      const [start, end] = dateRange(parsed.keys);
      const rain = await fetchHourlyRain(start, end);
      setResult({ study: analyzeRain(parsed.keys, rain), label: `${file.name} (${start} → ${end})`, synthetic: false, skipped: parsed.skipped });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runDemo = () => {
    const { accidents, rain } = syntheticStudyData(2024, 1.5);
    setResult({ study: analyzeRain(accidents, rain), label: 'Datos sintéticos 2024 (efecto real simulado ×1,5)', synthetic: true });
    setError(undefined);
  };

  const s = result?.study;
  const significant = s && s.ci95[0] > 1;

  return (
    <div className="analysis">
      <h4>Evolución (últimas 24 h, en este navegador)</h4>
      <div className="sparks">
        <Sparkline label="Congestión" unit="%" points={series('congestion')} />
        <Sparkline label="NO₂ máximo" unit="µg/m³" points={series('no2')} />
        <Sparkline label="Alertas activas" unit="" points={series('alerts')} />
        <Sparkline label="Cola en accesos al puerto" unit="camiones" points={series('portQueue')} />
      </div>

      <h4>Accidentes y lluvia</h4>
      <p className="muted">
        ¿Cuánto aumenta el riesgo de accidente cuando llueve? Sube un CSV de accidentes con fecha y hora
        (por ejemplo, el de accidentalidad del portal de datos abiertos del Ajuntament). La lluvia
        horaria se descarga de Open-Meteo (reanálisis ERA5) y se compara la tasa de accidentes por hora
        con lluvia frente a en seco, ajustada por hora del día y laborable/festivo (Mantel-Haenszel).
      </p>
      <div className="row">
        <label className="file-btn">
          {busy ? 'Analizando…' : 'Subir CSV de accidentes'}
          <input type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        <button className="secondary" onClick={runDemo} disabled={busy}>Demo con datos sintéticos</button>
      </div>
      {error && <p className="error">{error}</p>}

      {s && result && (
        <div className="study">
          {result.synthetic && <p className="warn-note">Datos sintéticos: sirven para ver el método, no son accidentes reales.</p>}
          <p className="muted small">{result.label}</p>
          <div className="hero">
            <span className="muted">Razón de tasas ajustada</span>
            <strong>×{fmtRR(s.adjustedRR)}</strong>
            <span className="muted">IC 95 %: {fmtRR(s.ci95[0])} – {fmtRR(s.ci95[1])} · bruta ×{fmtRR(s.crudeRR)}</span>
          </div>
          <p className="small">
            {significant
              ? `Con lluvia hay ${Math.round((s.adjustedRR - 1) * 100)} % más accidentes por hora que en seco a la misma hora del día, y el intervalo de confianza excluye el 1.`
              : 'No hay evidencia suficiente de que la lluvia cambie la tasa de accidentes (el intervalo de confianza incluye el 1).'}
          </p>
          <table className="data-table compact">
            <tbody>
              <tr><th>Accidentes analizados</th><td>{fmtN(s.accidents)}</td></tr>
              <tr><th>Horas con lluvia / secas</th><td>{fmtN(s.wetHours)} / {fmtN(s.dryHours)}</td></tr>
              <tr><th>Accidentes con lluvia / en seco</th><td>{fmtN(s.wetAccidents)} / {fmtN(s.dryAccidents)}</td></tr>
              {s.unmatched > 0 && <tr><th>Sin dato meteorológico</th><td>{fmtN(s.unmatched)}</td></tr>}
              {!!result.skipped && <tr><th>Filas descartadas</th><td>{fmtN(result.skipped)}</td></tr>}
            </tbody>
          </table>
          <RateByHourChart data={s.byHour} />
        </div>
      )}
    </div>
  );
}
