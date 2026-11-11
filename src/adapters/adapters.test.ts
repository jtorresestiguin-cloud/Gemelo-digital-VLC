import { describe, expect, it } from 'vitest';
import { decodeRaw } from './decoders';
import { parseAir, parseBikes, parseTraffic } from './opendata';
import { CitySimulator } from '../sim/simulator';
import type { RawMessage } from '../sim/protocols';

/** RNG determinista para tests */
const seeded = (seed = 42) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

describe('parsers de datos abiertos de València', () => {
  it('traduce los códigos de estado del tráfico (incluidos pasos inferiores) y multilíneas', () => {
    const segs = parseTraffic({
      features: [
        { geometry: { type: 'LineString', coordinates: [[-0.37, 39.47], [-0.371, 39.471]] }, properties: { gid: 1, denominacion: 'COLON', estado: 2 } },
        { geometry: { type: 'MultiLineString', coordinates: [[[-0.35, 39.46], [-0.351, 39.461]], [[-0.36, 39.46], [-0.361, 39.461]]] }, properties: { gid: 2, estado: 6 } },
        { geometry: null, properties: { gid: 3, estado: 0 } },
      ],
    });
    expect(segs.map((s) => s.state)).toEqual(['congested', 'dense', 'dense']);
    expect(segs[0].name).toBe('COLON');
  });

  it('lee Valenbisi y calidad del aire con geometría o geo_point_2d', () => {
    const bikes = parseBikes({ features: [{ geometry: null, properties: { number: 7, address: 'Plaza', available: 3, free: 12, total: 15, geo_point_2d: { lon: -0.37, lat: 39.47 } } }] });
    expect(bikes[0]).toMatchObject({ id: '7', available: 3, total: 15, lngLat: [-0.37, 39.47] });
    const air = parseAir({ features: [{ geometry: { type: 'Point', coordinates: [-0.34, 39.457] }, properties: { nombre: 'Av. Francia', no2: '45', pm10: null } }] });
    expect(air[0]).toMatchObject({ name: 'Av. Francia', no2: 45, pm10: undefined });
  });
});

describe('simulador + decodificadores de protocolo', () => {
  const run = (sim: CitySimulator, t: number) => sim.tick(t).flatMap((m: RawMessage) => decodeRaw(m, t));

  it('emite MQTT, GTFS-RT y OPC UA que se decodifican al bus común', () => {
    const msgs = run(new CitySimulator(seeded()), Date.UTC(2026, 0, 1, 8, 30));
    const topics = new Set(msgs.map((m) => `${m.protocol}:${m.topic}`));
    expect(topics).toContain('MQTT:noise');
    expect(topics).toContain('GTFS-RT:metro');
    expect(topics).toContain('OPC-UA:port');
  });

  it('activa el respaldo NGSI-LD de tráfico, aire y Valenbisi cuando se pide', () => {
    const sim = new CitySimulator(seeded());
    const now = Date.UTC(2026, 0, 1, 9);
    for (const source of ['traffic', 'air', 'bikes'] as const) sim.command({ type: 'enable', source }, now);
    const msgs = run(sim, now).filter((m) => m.protocol === 'NGSI-LD');
    expect(msgs.map((m) => m.topic).sort()).toEqual(['air', 'bikes', 'traffic']);
  });

  it('escenarios: accidente por MQTT, colapso del puerto por OPC UA y avería por GTFS-RT', () => {
    const sim = new CitySimulator(seeded());
    const now = Date.UTC(2026, 0, 1, 12);
    const inc = sim.command({ type: 'scenario', name: 'accidente-lluvia' }, now).flatMap((m) => decodeRaw(m, now));
    expect(inc[0]).toMatchObject({ topic: 'incident', protocol: 'MQTT' });
    expect(inc[0].topic === 'incident' && inc[0].data.zoneId).toBe('camins');

    sim.command({ type: 'scenario', name: 'colapso-puerto' }, now);
    sim.command({ type: 'scenario', name: 'averia-metro' }, now);
    let queue = 0;
    let l5 = '';
    for (let k = 0; k < 10; k++) {
      for (const m of run(sim, now + k * 3000)) {
        if (m.topic === 'port') queue = m.data.gateQueue;
        if (m.topic === 'metro') l5 = m.data.find((l) => l.id === 'L5')!.status;
      }
    }
    expect(queue).toBeGreaterThanOrEqual(40);
    expect(l5).toBe('interrupted');
  });
});
