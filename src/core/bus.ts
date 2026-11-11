import type {
  AirStation, BikeStation, Incident, MetroLine, NoiseSensor, PortState, Protocol, SourceId,
  TrafficSegment, Weather,
} from './types';

/** Mensajes normalizados que circulan por el bus común, independientemente del protocolo de origen. */
export type BusPayload =
  | { topic: 'traffic'; data: TrafficSegment[] }
  | { topic: 'bikes'; data: BikeStation[] }
  | { topic: 'air'; data: AirStation[] }
  | { topic: 'weather'; data: Weather }
  | { topic: 'incident'; data: Incident; closed?: boolean }
  | { topic: 'noise'; data: NoiseSensor[] }
  | { topic: 'metro'; data: MetroLine[] }
  | { topic: 'port'; data: PortState };

export type BusTopic = BusPayload['topic'];

export type BusMessage = BusPayload & {
  source: SourceId;
  protocol: Protocol;
  /** true = dato real de una API pública; false = simulado */
  live: boolean;
  ts: number;
};

type Handler = (msg: BusMessage) => void;

export class EventBus {
  private handlers = new Map<BusTopic | '*', Set<Handler>>();

  subscribe(topic: BusTopic | '*', handler: Handler): () => void {
    let set = this.handlers.get(topic);
    if (!set) this.handlers.set(topic, (set = new Set()));
    set.add(handler);
    return () => set!.delete(handler);
  }

  publish(msg: BusMessage): void {
    this.handlers.get(msg.topic)?.forEach((h) => h(msg));
    this.handlers.get('*')?.forEach((h) => h(msg));
  }
}
