/** Histórico de indicadores (últimas 24 h) guardado en el navegador. */
import type { Alert, CityState } from './types';

export interface KpiSample {
  t: number;
  /** % de tramos densos/congestionados/cortados */
  congestion: number;
  no2: number | null;
  alerts: number;
  critical: number;
  rain: number;
  portQueue: number | null;
  bikes: number;
}

export function kpisOf(state: CityState, alerts: Alert[], t: number): KpiSample {
  const known = state.traffic.filter((s) => s.state !== 'unknown');
  const jam = known.filter((s) => s.state !== 'fluid').length;
  const no2 = state.air.map((a) => a.no2).filter((v): v is number => v !== undefined);
  return {
    t,
    congestion: known.length ? Math.round((jam / known.length) * 100) : 0,
    no2: no2.length ? Math.round(Math.max(...no2)) : null,
    alerts: alerts.length,
    critical: alerts.filter((a) => a.severity === 'critical').length,
    rain: state.weather?.precipitation ?? 0,
    portQueue: state.port?.gateQueue ?? null,
    bikes: state.bikes.reduce((n, b) => n + b.available, 0),
  };
}

const KEY = 'vlc-twin-history-v1';

export class KpiHistory {
  samples: KpiSample[] = [];

  constructor(private intervalMs = 30_000, private maxAgeMs = 24 * 3600_000, private persist = true) {
    if (!persist) return;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.samples = (JSON.parse(raw) as KpiSample[]).filter((s) => Date.now() - s.t < maxAgeMs);
    } catch {
      /* almacenamiento no disponible: el histórico vive solo en memoria */
    }
  }

  /** Añade la muestra si ha pasado el intervalo; devuelve true si cambió. */
  add(sample: KpiSample): boolean {
    const last = this.samples[this.samples.length - 1];
    if (last && sample.t - last.t < this.intervalMs) return false;
    this.samples = [...this.samples.filter((s) => sample.t - s.t < this.maxAgeMs), sample];
    if (this.persist) {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.samples));
      } catch {
        /* ignorar */
      }
    }
    return true;
  }
}
