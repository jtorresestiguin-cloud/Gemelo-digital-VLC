import type { BusMessage } from './bus';
import { evaluateRules } from './rules';
import { setDistrictPolygons, zoneFor, midpoint } from './geo';
import { KpiHistory, kpisOf, type KpiSample } from './history';
import type { District } from '../adapters/districts';
import type { Alert, CityState, SourceId, SourceStatus, Weather } from './types';

export interface Overrides {
  rain?: { mm: number; until: number };
  no2?: { add: number; until: number };
  congest: { zoneId: string; until: number }[];
}

export interface Snapshot {
  state: CityState;
  sources: SourceStatus[];
  alerts: Alert[];
  overridesActive: boolean;
  districts: District[];
  districtsOfficial: boolean;
  history: KpiSample[];
  updatedAt: number;
}

const INITIAL_SOURCES: SourceStatus[] = [
  { id: 'traffic', name: 'Tráfico en tiempo real', provider: 'Geoportal Ajuntament de València', protocol: 'REST', mode: 'connecting', messages: 0 },
  { id: 'bikes', name: 'Valenbisi', provider: 'Geoportal Ajuntament de València', protocol: 'REST', mode: 'connecting', messages: 0 },
  { id: 'air', name: 'Calidad del aire', provider: 'Geoportal · red de vigilancia atmosférica', protocol: 'REST', mode: 'connecting', messages: 0 },
  { id: 'weather', name: 'Meteorología', provider: 'Open-Meteo', protocol: 'REST', mode: 'connecting', messages: 0 },
  { id: 'iot', name: 'Sensores IoT (ruido, incidencias)', provider: 'Broker MQTT', protocol: 'MQTT', mode: 'connecting', messages: 0 },
  { id: 'metro', name: 'Metrovalencia', provider: 'Feed GTFS-Realtime', protocol: 'GTFS-RT', mode: 'connecting', messages: 0 },
  { id: 'port', name: 'Port de València (PLCs)', provider: 'Servidor OPC UA', protocol: 'OPC-UA', mode: 'connecting', messages: 0 },
  { id: 'emt', name: 'Autobuses EMT en tiempo real', provider: 'Geoportal · EMT València', protocol: 'REST', mode: 'connecting', messages: 0 },
  { id: 'services', name: 'Servicios públicos', provider: 'Ajuntament de València (Geoportal y datos abiertos)', protocol: 'REST', mode: 'connecting', messages: 0 },
];

const DEFAULT_WEATHER: Weather = { temperature: 20, precipitation: 0, windSpeed: 8, weatherCode: 0 };

/** Estado de la ciudad alimentado por el bus. Notifica a React con un throttle para no saturar el render. */
export class CityStore {
  private raw: CityState = { traffic: [], bikes: [], air: [], incidents: [], noise: [], metro: [], services: [], buses: [], busStops: [], busRoutes: [] };
  private sources = new Map<SourceId, SourceStatus>(INITIAL_SOURCES.map((s) => [s.id, { ...s }]));
  private overrides: Overrides = { congest: [] };
  private alerts: Alert[] = [];
  private snapshot: Snapshot;
  private listeners = new Set<() => void>();
  private pending: ReturnType<typeof setTimeout> | null = null;
  private districts: District[] = [];
  private districtsOfficial = false;
  readonly history: KpiHistory;

  constructor(private throttleMs = 400, persistHistory = typeof localStorage !== 'undefined') {
    this.history = new KpiHistory(30_000, 24 * 3600_000, persistHistory);
    this.snapshot = this.build(Date.now());
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snapshot;

  apply(msg: BusMessage): void {
    const r = this.raw;
    switch (msg.topic) {
      case 'traffic': r.traffic = msg.data; break;
      case 'bikes': r.bikes = msg.data; break;
      case 'air': r.air = msg.data; break;
      case 'weather': r.weather = msg.data; break;
      case 'metro': r.metro = msg.data; break;
      case 'port': r.port = msg.data; break;
      case 'services': r.services = msg.data; break;
      case 'buses': r.buses = msg.data; r.busesAsOf = msg.asOf; break;
      case 'busStops': r.busStops = msg.data; break;
      case 'busRoutes': r.busRoutes = msg.data; break;
      case 'noise': {
        const byId = new Map(r.noise.map((n) => [n.id, n]));
        msg.data.forEach((n) => byId.set(n.id, n));
        r.noise = [...byId.values()];
        break;
      }
      case 'incident': {
        const rest = r.incidents.filter((i) => i.id !== msg.data.id);
        r.incidents = msg.closed ? rest : [...rest, msg.data];
        break;
      }
    }
    const s = this.sources.get(msg.source)!;
    this.sources.set(msg.source, {
      ...s,
      protocol: msg.protocol,
      mode: msg.live ? 'live' : 'simulated',
      messages: s.messages + 1,
      lastUpdate: msg.ts,
      detail: msg.live ? undefined : s.detail,
    });
    this.schedule();
  }

  setSourceStatus(id: SourceId, patch: Partial<SourceStatus>): void {
    this.sources.set(id, { ...this.sources.get(id)!, ...patch });
    this.schedule();
  }

  /** Cambia los límites de distrito y reasigna todos los elementos ya recibidos. */
  setDistricts(districts: District[], official: boolean): void {
    this.districts = districts;
    this.districtsOfficial = official;
    setDistrictPolygons(official ? districts : null);
    const r = this.raw;
    r.traffic = r.traffic.map((s) => ({ ...s, zoneId: zoneFor(midpoint(s.coords)) }));
    r.bikes = r.bikes.map((b) => ({ ...b, zoneId: zoneFor(b.lngLat) }));
    r.air = r.air.map((a) => ({ ...a, zoneId: zoneFor(a.lngLat) }));
    r.noise = r.noise.map((n) => ({ ...n, zoneId: zoneFor(n.lngLat) }));
    r.incidents = r.incidents.map((i) => ({ ...i, zoneId: zoneFor(i.lngLat) }));
    r.services = r.services.map((s) => ({ ...s, zoneId: zoneFor(s.lngLat) }));
    this.flush();
  }

  setOverrides(fn: (o: Overrides) => Overrides): void {
    this.overrides = fn(this.overrides);
    this.flush();
  }

  /** Estado efectivo = datos recibidos + escenarios activos. */
  private effective(now: number): CityState {
    const o = this.overrides;
    const congested = new Set(o.congest.filter((c) => c.until > now).map((c) => c.zoneId));
    const rain = o.rain && o.rain.until > now ? o.rain : undefined;
    const no2 = o.no2 && o.no2.until > now ? o.no2 : undefined;
    const r = this.raw;
    return {
      ...r,
      traffic: congested.size ? r.traffic.map((s) => (congested.has(s.zoneId) && s.state !== 'closed' ? { ...s, state: 'congested' } : s)) : r.traffic,
      weather: rain ? { ...(r.weather ?? DEFAULT_WEATHER), precipitation: rain.mm, weatherCode: 65 } : r.weather,
      air: no2 ? r.air.map((a) => ({ ...a, no2: (a.no2 ?? 40) + no2.add, pm10: (a.pm10 ?? 20) + no2.add / 4 })) : r.air,
    };
  }

  private build(now: number): Snapshot {
    const state = this.effective(now);
    this.alerts = evaluateRules(state, now, this.alerts);
    const o = this.overrides;
    // solo se registran muestras cuando hay datos de tráfico (evita ceros al arrancar)
    if (state.traffic.length) this.history.add(kpisOf(state, this.alerts, now));
    return {
      state,
      sources: [...this.sources.values()],
      alerts: this.alerts,
      overridesActive: (o.rain?.until ?? 0) > now || (o.no2?.until ?? 0) > now || o.congest.some((c) => c.until > now),
      districts: this.districts,
      districtsOfficial: this.districtsOfficial,
      history: this.history.samples,
      updatedAt: now,
    };
  }

  private schedule(): void {
    if (this.pending) return;
    this.pending = setTimeout(() => this.flush(), this.throttleMs);
  }

  flush(): void {
    if (this.pending) clearTimeout(this.pending);
    this.pending = null;
    this.snapshot = this.build(Date.now());
    this.listeners.forEach((l) => l());
  }
}
