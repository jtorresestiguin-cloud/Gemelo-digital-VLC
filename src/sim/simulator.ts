/**
 * Simulador de los sistemas cerrados de la ciudad. Es puro (sin acceso al DOM)
 * para poder ejecutarlo en un Web Worker y en los tests.
 */
import {
  AIR_STATIONS_FALLBACK, FALLBACK_SEGMENTS, METRO_LINES, NOISE_SENSORS, PORT_ASSETS, ZONES,
} from '../data/static';
import type { LngLat } from '../core/types';
import type { MqttMessage, NgsiEntity, RawMessage, ScenarioName, SimSource, WorkerCommand } from './protocols';

type Rng = () => number;

/** Factor de demanda de tráfico 0..1 según la hora (puntas 8:30, 14:00 y 18:30). */
export function rushFactor(date: Date): number {
  const h = date.getHours() + date.getMinutes() / 60;
  const peak = (c: number, w: number) => Math.exp(-((h - c) ** 2) / (2 * w * w));
  return Math.min(1, 0.15 + 0.85 * Math.max(peak(8.5, 1.2), peak(18.5, 1.5), 0.6 * peak(14, 1)));
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const iso = (t: number) => new Date(t).toISOString();

interface SimIncident { id: string; type: string; lngLat: LngLat; severity: 1 | 2 | 3; until: number }

/** Estaciones Valenbisi sintéticas repartidas por los distritos (solo si la API real no responde). */
function syntheticBikeStations(rng: Rng) {
  const out: { id: string; name: string; lngLat: LngLat; total: number }[] = [];
  let n = 1;
  for (const z of ZONES) {
    for (let k = 0; k < 3; k++) {
      out.push({
        id: `vb-${n}`,
        name: `Estación ${n} (${z.name})`,
        lngLat: [z.center[0] + (rng() - 0.5) * 0.012, z.center[1] + (rng() - 0.5) * 0.009],
        total: 15 + Math.floor(rng() * 20),
      });
      n++;
    }
  }
  return out;
}

export class CitySimulator {
  private enabled = new Set<SimSource>();
  private last: Record<string, number> = {};
  private incidents = new Map<string, SimIncident>();
  private incidentSeq = 0;
  private trafficLevel = new Map<string, number>();
  private bikeLevel = new Map<string, number>();
  private bikes: ReturnType<typeof syntheticBikeStations>;
  private scenarios = { no2Until: 0, portUntil: 0, metroUntil: 0 };
  private metroDelay = new Map<string, number>();
  private gateQueue = 12;

  constructor(private rng: Rng = Math.random) {
    this.bikes = syntheticBikeStations(rng);
    for (const s of FALLBACK_SEGMENTS) this.trafficLevel.set(s.id, rng() * 0.5);
    for (const b of this.bikes) this.bikeLevel.set(b.id, rng());
    for (const l of METRO_LINES) this.metroDelay.set(l.id, 0);
  }

  command(cmd: WorkerCommand, now: number): RawMessage[] {
    if (cmd.type === 'enable') {
      this.enabled.add(cmd.source);
      delete this.last[cmd.source];
      return [];
    }
    if (cmd.type === 'disable') {
      this.enabled.delete(cmd.source);
      return [];
    }
    return this.scenario(cmd.name, now);
  }

  private scenario(name: ScenarioName, now: number): RawMessage[] {
    const FIVE_MIN = 5 * 60_000;
    switch (name) {
      case 'accidente-lluvia': {
        const inc = this.newIncident(now, [-0.3450, 39.4620], 'accident', 3, FIVE_MIN);
        return [this.incidentMessage(inc, now)];
      }
      case 'episodio-no2':
        this.scenarios.no2Until = now + FIVE_MIN;
        delete this.last.air;
        return [];
      case 'colapso-puerto':
        this.scenarios.portUntil = now + FIVE_MIN;
        delete this.last.port;
        return [];
      case 'averia-metro':
        this.scenarios.metroUntil = now + FIVE_MIN;
        delete this.last.metro;
        return [];
      case 'reset': {
        this.scenarios = { no2Until: 0, portUntil: 0, metroUntil: 0 };
        const closed = [...this.incidents.values()].map((i) => this.incidentMessage(i, now, true));
        this.incidents.clear();
        this.last = {};
        return closed;
      }
    }
  }

  /** Avanza la simulación y devuelve los mensajes que tocan en este instante. */
  tick(now: number): RawMessage[] {
    const out: RawMessage[] = [];
    const due = (key: string, every: number) => {
      if (this.last[key] !== undefined && now - this.last[key] < every) return false;
      this.last[key] = now;
      return true;
    };
    if (due('noise', 4000)) out.push(...this.noise(now));
    if (due('incidents', 5000)) out.push(...this.incidentsTick(now));
    if (due('metro', 10_000)) out.push(this.metro(now));
    if (due('port', 3000)) out.push(this.port(now));
    if (this.enabled.has('traffic') && due('traffic', 15_000)) out.push(this.traffic(now));
    if (this.enabled.has('air') && due('air', 30_000)) out.push(this.air(now));
    if (this.enabled.has('bikes') && due('bikes', 20_000)) out.push(this.bikesTick(now));
    return out;
  }

  // --- MQTT: sensores de ruido e incidencias -------------------------------------------------

  private noise(now: number): MqttMessage[] {
    const rush = rushFactor(new Date(now));
    return NOISE_SENSORS.map((s) => ({
      protocol: 'MQTT',
      topic: `vlc/iot/noise/${s.id}`,
      qos: 0,
      payload: JSON.stringify({ laeq: +(48 + rush * 20 + (this.rng() - 0.5) * 8).toFixed(1), ts: now, lat: s.lngLat[1], lon: s.lngLat[0] }),
    }));
  }

  private newIncident(now: number, at: LngLat, type: string, severity: 1 | 2 | 3, ttl: number): SimIncident {
    const inc: SimIncident = { id: `INC-${++this.incidentSeq}`, type, lngLat: at, severity, until: now + ttl };
    this.incidents.set(inc.id, inc);
    return inc;
  }

  private incidentMessage(i: SimIncident, now: number, closed = false): MqttMessage {
    return {
      protocol: 'MQTT',
      topic: `vlc/incidents/${i.id}`,
      qos: 1,
      payload: JSON.stringify({ type: i.type, lat: i.lngLat[1], lon: i.lngLat[0], severity: i.severity, status: closed ? 'closed' : 'open', ts: now }),
    };
  }

  private incidentsTick(now: number): MqttMessage[] {
    const out: MqttMessage[] = [];
    for (const i of [...this.incidents.values()]) {
      if (i.until <= now) {
        this.incidents.delete(i.id);
        out.push(this.incidentMessage(i, now, true));
      }
    }
    // ~1 incidente nuevo cada ~minuto, más probable en hora punta
    if (this.incidents.size < 4 && this.rng() < 0.04 + 0.06 * rushFactor(new Date(now))) {
      const seg = FALLBACK_SEGMENTS[Math.floor(this.rng() * FALLBACK_SEGMENTS.length)];
      const p = seg.coords[Math.floor(this.rng() * seg.coords.length)];
      const types = ['accident', 'breakdown', 'roadworks'];
      const inc = this.newIncident(now, p, types[Math.floor(this.rng() * 3)], (1 + Math.floor(this.rng() * 3)) as 1 | 2 | 3, (2 + this.rng() * 4) * 60_000);
      out.push(this.incidentMessage(inc, now));
    }
    // re-publica los abiertos (mensajes retenidos en un broker real)
    for (const i of this.incidents.values()) out.push(this.incidentMessage(i, now));
    return out;
  }

  // --- GTFS-RT: Metrovalencia ---------------------------------------------------------------

  private metro(now: number): RawMessage {
    const breakdown = this.scenarios.metroUntil > now;
    const entity: GtfsEntity[] = [];
    for (const l of METRO_LINES) {
      let d = this.metroDelay.get(l.id) ?? 0;
      d = clamp(d + (this.rng() - 0.6) * 2, 0, 12);
      if (breakdown && (l.id === 'L3' || l.id === 'L5')) d = 15 + this.rng() * 5;
      this.metroDelay.set(l.id, d);
      entity.push({ id: `tu-${l.id}`, trip_update: { trip: { route_id: l.id }, delay: Math.round(d * 60) } });
    }
    if (breakdown) {
      entity.push({
        id: 'alert-L5',
        alert: {
          informed_entity: [{ route_id: 'L5' }],
          effect: 'NO_SERVICE',
          header_text: { translation: [{ language: 'es', text: 'Incidencia técnica: servicio interrumpido en L5' }] },
        },
      });
    }
    return {
      protocol: 'GTFS-RT',
      feed: { header: { gtfs_realtime_version: '2.0', incrementality: 'FULL_DATASET', timestamp: Math.floor(now / 1000) }, entity },
    };
  }

  // --- OPC UA: PLCs del puerto --------------------------------------------------------------

  private port(now: number): RawMessage {
    const surge = this.scenarios.portUntil > now;
    const target = surge ? 65 : 10 + 20 * rushFactor(new Date(now));
    this.gateQueue = clamp(this.gateQueue + (target - this.gateQueue) * 0.3 + (this.rng() - 0.5) * 4, 0, 120);
    const cranesTotal = 18;
    const cranesActive = surge ? 6 + Math.floor(this.rng() * 3) : 12 + Math.floor(this.rng() * 6);
    const ts = iso(now);
    const gates = PORT_ASSETS.filter((a) => a.kind === 'gate');
    return {
      protocol: 'OPC-UA',
      endpoint: 'opc.tcp://terminal.port.sim:4840',
      nodes: [
        ...gates.map((g, i) => ({
          nodeId: `ns=2;s=Port.Gate.${g.id}.QueueLength`,
          value: { dataType: 'Int32' as const, value: Math.round(this.gateQueue * (i === 0 ? 0.6 : 0.4)) },
          statusCode: 'Good' as const,
          sourceTimestamp: ts,
        })),
        { nodeId: 'ns=2;s=Port.Cranes.Active', value: { dataType: 'Int32', value: cranesActive }, statusCode: 'Good', sourceTimestamp: ts },
        { nodeId: 'ns=2;s=Port.Cranes.Total', value: { dataType: 'Int32', value: cranesTotal }, statusCode: 'Good', sourceTimestamp: ts },
        { nodeId: 'ns=2;s=Port.Berths.Occupancy', value: { dataType: 'Double', value: +(surge ? 95 : 60 + this.rng() * 25).toFixed(1) }, statusCode: 'Good', sourceTimestamp: ts },
      ],
    };
  }

  // --- NGSI-LD (FIWARE): respaldo de tráfico, aire y Valenbisi --------------------------------

  private ngsi(subscriptionId: string, now: number, data: NgsiEntity[]): RawMessage {
    return { protocol: 'NGSI-LD', type: 'Notification', subscriptionId, notifiedAt: iso(now), data };
  }

  private traffic(now: number): RawMessage {
    const rush = rushFactor(new Date(now));
    const data: NgsiEntity[] = FALLBACK_SEGMENTS.map((s) => {
      let lvl = this.trafficLevel.get(s.id) ?? 0.3;
      lvl = clamp(lvl + (rush - lvl) * 0.25 + (this.rng() - 0.5) * 0.35, 0, 1);
      this.trafficLevel.set(s.id, lvl);
      const state = lvl > 0.8 ? 'congested' : lvl > 0.55 ? 'dense' : 'fluid';
      return {
        id: `urn:ngsi-ld:TrafficFlowObserved:${s.id}`,
        type: 'TrafficFlowObserved',
        name: { type: 'Property', value: s.name },
        congested: { type: 'Property', value: state === 'congested' },
        serviceLevel: { type: 'Property', value: state },
        occupancy: { type: 'Property', value: +lvl.toFixed(2) },
        location: { type: 'GeoProperty', value: { type: 'LineString', coordinates: s.coords } },
      };
    });
    return this.ngsi('urn:ngsi-ld:Subscription:traffic', now, data);
  }

  private air(now: number): RawMessage {
    const rush = rushFactor(new Date(now));
    const boost = this.scenarios.no2Until > now ? 140 : 0;
    const data: NgsiEntity[] = AIR_STATIONS_FALLBACK.map((s) => ({
      id: `urn:ngsi-ld:AirQualityObserved:${s.id}`,
      type: 'AirQualityObserved',
      name: { type: 'Property', value: s.name },
      no2: { type: 'Property', value: Math.round(15 + rush * 55 + this.rng() * 15 + boost), unitCode: 'GQ' },
      pm10: { type: 'Property', value: Math.round(12 + rush * 18 + this.rng() * 8 + boost / 4), unitCode: 'GQ' },
      pm25: { type: 'Property', value: Math.round(6 + rush * 10 + this.rng() * 5 + boost / 8), unitCode: 'GQ' },
      o3: { type: 'Property', value: Math.round(40 + (1 - rush) * 40 + this.rng() * 10), unitCode: 'GQ' },
      location: { type: 'GeoProperty', value: { type: 'Point', coordinates: s.lngLat } },
    }));
    return this.ngsi('urn:ngsi-ld:Subscription:air', now, data);
  }

  private bikesTick(now: number): RawMessage {
    const data: NgsiEntity[] = this.bikes.map((b) => {
      let lvl = this.bikeLevel.get(b.id) ?? 0.5;
      lvl = clamp(lvl + (this.rng() - 0.5) * 0.3, 0, 1);
      this.bikeLevel.set(b.id, lvl);
      const available = Math.round(lvl * b.total);
      return {
        id: `urn:ngsi-ld:BikeHireDockingStation:${b.id}`,
        type: 'BikeHireDockingStation',
        name: { type: 'Property', value: b.name },
        availableBikeNumber: { type: 'Property', value: available },
        freeSlotNumber: { type: 'Property', value: b.total - available },
        totalSlotNumber: { type: 'Property', value: b.total },
        location: { type: 'GeoProperty', value: { type: 'Point', coordinates: b.lngLat } },
      };
    });
    return this.ngsi('urn:ngsi-ld:Subscription:bikes', now, data);
  }
}

type GtfsEntity = import('./protocols').GtfsRtFeed['feed']['entity'][number];
