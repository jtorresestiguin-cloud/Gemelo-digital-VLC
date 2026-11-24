/**
 * Cercanías València en el mapa:
 *  - Líneas y estaciones: fichero estático generado desde el GTFS oficial de Renfe (public/data/cercanias-vlc.json).
 *  - Trenes en vivo, retrasos y avisos: a través del intermediario de cloudflare/cercanias-worker.js,
 *    porque Renfe no permite leer sus datos en tiempo real directamente desde una web.
 *    Mientras no haya intermediario configurado, la capa muestra solo líneas y estaciones.
 */
import type { FeatureCollection } from 'geojson';
import { nextDepartures, type CerTimetable, type CercaniasData, type Departure } from './cercaniasGtfs';

/** Dirección del intermediario (no es secreta). Vacía = sin trenes en vivo. */
export const CERCANIAS_LIVE_URL: string = (import.meta.env.VITE_CERCANIAS_URL as string | undefined) ?? '';

export interface CerTrain { id: string; trip: string; line: string; lng: number; lat: number; status: string; stop: string; platform: string; delay: number | null; at: number }
export interface CerNotice { lines: string[]; text: string }
export interface CerLive { updated: number; trains: CerTrain[]; cancelled: number; notices: CerNotice[]; delays?: Record<string, number> }

export interface CercaniasState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data?: CercaniasData;
  live?: CerLive;
  error?: string;
  liveError?: string;
  /** hora local de la última lectura en vivo */
  fetched?: number;
  geo: { lines: FeatureCollection; stations: FeatureCollection; trains: FeatureCollection };
}

const fc = (features: FeatureCollection['features'] = []): FeatureCollection => ({ type: 'FeatureCollection', features });
const POLL_MS = 30_000;

export function linesGeo(d: CercaniasData): FeatureCollection {
  return fc(d.lines.map((l) => ({ type: 'Feature', geometry: { type: 'MultiLineString', coordinates: l.coords }, properties: { kind: 'cer-line', line: l.line, color: l.color, name: `${l.line} · ${l.name}` } })));
}

export function stationsGeo(d: CercaniasData): FeatureCollection {
  return fc(d.stations.map((s) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: s.at }, properties: { kind: 'cer-station', id: s.id, name: s.name, lines: s.lines.join(', ') } })));
}

export function trainsGeo(live: CerLive, d?: CercaniasData): FeatureCollection {
  const color = new Map(d?.lines.map((l) => [l.line, l.color]));
  const station = new Map(d?.stations.map((s) => [s.id, s.name]));
  return fc(live.trains.map((t) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [t.lng, t.lat] },
    properties: {
      kind: 'cer-train', id: t.id, line: t.line || '?', color: color.get(t.line) ?? '#64748b',
      name: `Cercanías ${t.line} · tren ${t.id}`, delay: t.delay ?? -1,
      tag: t.delay && t.delay > 0 ? `${t.line} +${t.delay}′` : t.line,
      stop: station.get(t.stop) ?? '', status: t.status, platform: t.platform,
    },
  })));
}

/** Fecha (AAAA-MM-DD) y minuto del día en hora de Madrid. */
export function madridNow(at = new Date()): { date: string; min: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(at).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, min: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** «C3, C5» → avisos que afectan a esas líneas */
export const noticesFor = (notices: CerNotice[], lines: string[]) => notices.filter((n) => n.lines.some((l) => lines.includes(l)));

class Cercanias {
  private state: CercaniasState = { status: 'idle', geo: { lines: fc(), stations: fc(), trains: fc() } };
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setInterval>;
  private timetable?: Promise<CerTimetable | undefined>;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  get = () => this.state;
  private set(patch: Partial<CercaniasState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private async loadStatic() {
    if (this.state.data || this.state.status === 'loading') return;
    this.set({ status: 'loading' });
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}data/cercanias-vlc.json`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as CercaniasData;
      this.set({
        status: 'ready', data,
        geo: { lines: linesGeo(data), stations: stationsGeo(data), trains: this.state.live ? trainsGeo(this.state.live, data) : fc() },
      });
    } catch (e) {
      this.set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  }

  private async loadLive() {
    if (!CERCANIAS_LIVE_URL) return;
    try {
      const r = await fetch(CERCANIAS_LIVE_URL, { signal: AbortSignal.timeout(15_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const live = (await r.json()) as CerLive;
      if (!Array.isArray(live.trains)) throw new Error('respuesta inesperada');
      this.set({ live, liveError: undefined, fetched: Date.now(), geo: { ...this.state.geo, trains: trainsGeo(live, this.state.data) } });
    } catch (e) {
      this.set({ liveError: e instanceof Error ? e.message : String(e) });
    }
  }

  /** Próximas salidas de una estación (horario oficial, corregido con el retraso en vivo si lo hay). */
  async departures(stop: string, n = 6): Promise<Departure[] | undefined> {
    this.timetable ??= fetch(`${import.meta.env.BASE_URL}data/cercanias-horarios.json`)
      .then((r) => (r.ok ? (r.json() as Promise<CerTimetable>) : undefined))
      .catch(() => undefined);
    const tt = await this.timetable;
    if (!tt) {
      this.timetable = undefined; // se reintentará en el siguiente clic
      return undefined;
    }
    const { date, min } = madridNow();
    const live = this.state.live;
    const fresh = live && this.state.fetched && Date.now() - this.state.fetched < 3 * 60_000;
    return nextDepartures(tt, stop, date, min, n, fresh && live.delays ? new Map(Object.entries(live.delays)) : undefined);
  }

  enable(on: boolean) {
    if (!on) {
      clearInterval(this.timer);
      this.timer = undefined;
      return;
    }
    void this.loadStatic();
    if (!CERCANIAS_LIVE_URL || this.timer) return;
    void this.loadLive();
    this.timer = setInterval(() => { if (!document.hidden) void this.loadLive(); }, POLL_MS);
  }
}

export const cercanias = new Cercanias();
