/**
 * Decodificadores protocolo → bus común. Son los mismos que usaría un driver real.
 */
import type { BusMessage } from '../core/bus';
import { midpoint, zoneFor } from '../core/geo';
import type { IncidentType, LngLat, MetroLine, MetroStatus, NoiseSensor, PortState, TrafficState } from '../core/types';
import { METRO_LINES } from '../data/static';
import type { GtfsRtFeed, MqttMessage, NgsiEntity, NgsiLdNotification, OpcUaRead, RawMessage } from '../sim/protocols';

const prop = <T>(e: NgsiEntity, k: string): T | undefined => (e[k] as { value?: T } | undefined)?.value;
const shortId = (urn: string) => urn.split(':').pop() ?? urn;

export function decodeMqtt(m: MqttMessage, now: number): BusMessage[] {
  const parts = m.topic.split('/');
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(m.payload);
  } catch {
    return [];
  }
  const lngLat: LngLat = [Number(p.lon), Number(p.lat)];
  const base = { source: 'iot' as const, protocol: 'MQTT' as const, live: false, ts: now };
  if (parts[1] === 'iot' && parts[2] === 'noise') {
    const s: NoiseSensor = { id: parts[3], lngLat, zoneId: zoneFor(lngLat), laeq: Number(p.laeq) };
    return [{ ...base, topic: 'noise', data: [s] }];
  }
  if (parts[1] === 'incidents') {
    return [{
      ...base,
      topic: 'incident',
      closed: p.status === 'closed',
      data: {
        id: parts[2],
        type: p.type as IncidentType,
        lngLat,
        zoneId: zoneFor(lngLat),
        severity: Math.min(3, Math.max(1, Number(p.severity) || 1)) as 1 | 2 | 3,
        ts: Number(p.ts) || now,
      },
    }];
  }
  return [];
}

export function decodeGtfsRt(m: GtfsRtFeed, now: number): BusMessage[] {
  const delays = new Map<string, number>();
  const noService = new Set<string>();
  for (const e of m.feed.entity) {
    if (e.trip_update) delays.set(e.trip_update.trip.route_id, Math.max(delays.get(e.trip_update.trip.route_id) ?? 0, e.trip_update.delay));
    if (e.alert?.effect === 'NO_SERVICE') e.alert.informed_entity.forEach((ie) => noService.add(ie.route_id));
  }
  const lines: MetroLine[] = METRO_LINES.map((l) => {
    const delayMin = Math.round((delays.get(l.id) ?? 0) / 60);
    const status: MetroStatus = noService.has(l.id) ? 'interrupted' : delayMin >= 5 ? 'delayed' : 'ok';
    return { ...l, delayMin, status };
  });
  return [{ source: 'metro', protocol: 'GTFS-RT', live: false, ts: now, topic: 'metro', data: lines }];
}

export function decodeOpcUa(m: OpcUaRead, now: number): BusMessage[] {
  const port: PortState = { cranesActive: 0, cranesTotal: 0, gateQueue: 0, berthOccupancy: 0 };
  for (const n of m.nodes) {
    if (n.statusCode === 'Bad') continue;
    const v = Number(n.value.value);
    if (/\.QueueLength$/.test(n.nodeId)) port.gateQueue += v;
    else if (n.nodeId.endsWith('Cranes.Active')) port.cranesActive = v;
    else if (n.nodeId.endsWith('Cranes.Total')) port.cranesTotal = v;
    else if (n.nodeId.endsWith('Berths.Occupancy')) port.berthOccupancy = v;
  }
  return [{ source: 'port', protocol: 'OPC-UA', live: false, ts: now, topic: 'port', data: port }];
}

export function decodeNgsiLd(m: NgsiLdNotification, now: number): BusMessage[] {
  const byType = new Map<string, NgsiEntity[]>();
  for (const e of m.data) byType.set(e.type, [...(byType.get(e.type) ?? []), e]);
  const out: BusMessage[] = [];
  const base = { protocol: 'NGSI-LD' as const, live: false, ts: now };

  const traffic = byType.get('TrafficFlowObserved');
  if (traffic) {
    out.push({
      ...base, source: 'traffic', topic: 'traffic',
      data: traffic.map((e) => {
        const coords = (e.location?.value.coordinates ?? []) as LngLat[];
        return {
          id: shortId(e.id),
          name: prop<string>(e, 'name') ?? shortId(e.id),
          state: (prop<string>(e, 'serviceLevel') ?? 'unknown') as TrafficState,
          coords,
          zoneId: zoneFor(midpoint(coords)),
        };
      }),
    });
  }
  const air = byType.get('AirQualityObserved');
  if (air) {
    out.push({
      ...base, source: 'air', topic: 'air',
      data: air.map((e) => {
        const lngLat = e.location?.value.coordinates as LngLat;
        return {
          id: shortId(e.id), name: prop<string>(e, 'name') ?? shortId(e.id), lngLat, zoneId: zoneFor(lngLat),
          no2: prop<number>(e, 'no2'), pm10: prop<number>(e, 'pm10'), pm25: prop<number>(e, 'pm25'), o3: prop<number>(e, 'o3'),
        };
      }),
    });
  }
  const bikes = byType.get('BikeHireDockingStation');
  if (bikes) {
    out.push({
      ...base, source: 'bikes', topic: 'bikes',
      data: bikes.map((e) => {
        const lngLat = e.location?.value.coordinates as LngLat;
        return {
          id: shortId(e.id), name: prop<string>(e, 'name') ?? shortId(e.id), lngLat, zoneId: zoneFor(lngLat),
          available: prop<number>(e, 'availableBikeNumber') ?? 0,
          free: prop<number>(e, 'freeSlotNumber') ?? 0,
          total: prop<number>(e, 'totalSlotNumber') ?? 0,
        };
      }),
    });
  }
  return out;
}

export function decodeRaw(m: RawMessage, now: number): BusMessage[] {
  switch (m.protocol) {
    case 'MQTT': return decodeMqtt(m, now);
    case 'GTFS-RT': return decodeGtfsRt(m, now);
    case 'OPC-UA': return decodeOpcUa(m, now);
    case 'NGSI-LD': return decodeNgsiLd(m, now);
  }
}
