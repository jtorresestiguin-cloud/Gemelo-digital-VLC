import { describe, expect, it } from 'vitest';
import { buildCercanias, parseCsv, thin } from './cercaniasGtfs';
import { noticesFor, trainsGeo } from './cercanias';
// @ts-expect-error módulo JS del intermediario (Cloudflare Worker), sin tipos
import { buildPayload, lineOf } from '../../cloudflare/cercanias-worker.js';

const csv = (s: string) => parseCsv(s.trim().replace(/^ +/gm, ''));

describe('GTFS de Cercanías', () => {
  const routes = csv(`route_id,route_short_name,route_long_name,route_type,route_color,route_text_color   
    40T0001C1  ,C1  ,Valencia Nord                           -Platja i Grau de Gandia  ,2,7AB3DE,FFFFFF
    40T0025C3  ,C3  ,Buñol                                   -Valencia - Sant Isidre   ,2,7A2780,FFFFFF
    40T0049C2  ,C2  ,Moixent                                 -Xativa                   ,3,F79529,FFFFFF
    10T0001C1  ,C1  ,Principe Pio                            -Aeropuerto-T4            ,2,75B6E0,FFFFFF`);
  const trips = csv(`route_id,service_id,trip_id,trip_headsign,wheelchair_accessible,block_id,shape_id   
    40T0001C1,4027M,4027M1C1,  ,1,x,40_C1
    40T0001C1,4027M,4027M2C1,  ,1,x,40_C1
    40T0025C3,4027M,4027M3C3,  ,1,x,40_C3
    40T0049C2,4027M,4027M4C2,  ,1,x,40_C2B
    10T0001C1,1027M,1027M5C1,  ,1,x,10_C1`);
  const stops = csv(`stop_id,stop_name,stop_lat,stop_lon,wheelchair_boarding
    65000,València-Estació del Nord,39.4667,-0.3772,1
    69110,Gandia,38.9701,-0.1793,1
    66212,València-Sant Isidre,39.4563,-0.3934,1
    64004,Vallada,38.89,-0.69,1
    18000,Madrid-Atocha,40.40,-3.69,1`);
  const shapes = csv(`shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence
    40_C1,38.9701,-0.1793,2
    40_C1,39.4667,-0.3772,1
    40_C1,39.46671,-0.37721,3
    40_C3,39.4563,-0.3934,1
    40_C3,39.50,-0.50,2
    10_C1,40.4,-3.69,1`);
  const stopTimes = [
    { trip_id: '4027M1C1', stop_id: '65000' }, { trip_id: '4027M1C1', stop_id: '69110' },
    { trip_id: '4027M3C3', stop_id: '66212' }, { trip_id: '4027M3C3', stop_id: '65000' },
    { trip_id: '4027M4C2', stop_id: '64004' }, { trip_id: '1027M5C1', stop_id: '18000' },
  ];
  const d = buildCercanias({ routes, trips, stops, shapes, stopTimes, built: '2026-11-24' });

  it('solo trenes del núcleo de València, con su color y nombre', () => {
    expect(d.lines.map((l) => l.line)).toEqual(['C1', 'C3']);
    expect(d.lines[0]).toMatchObject({ color: '#7AB3DE', name: 'Valencia Nord – Platja i Grau de Gandia' });
    expect(d.lines[1].name).toBe('Buñol – Valencia - Sant Isidre');
  });
  it('estaciones con las líneas que paran (sin autobuses ni otros núcleos)', () => {
    expect(d.stations.map((s) => s.id)).toEqual(['65000', '66212', '69110']);
    expect(d.stations[0]).toMatchObject({ name: 'València-Estació del Nord', lines: ['C1', 'C3'], at: [-0.3772, 39.4667] });
  });
  it('trazado ordenado y aligerado', () => {
    expect(d.lines[0].coords).toHaveLength(1);
    expect(d.lines[0].coords[0][0]).toEqual([-0.3772, 39.4667]);
    expect(d.lines[0].coords[0].at(-1)).toEqual([-0.37721, 39.46671]);
    expect(thin([[0, 0], [0.00001, 0], [0.00002, 0], [0.01, 0]])).toEqual([[0, 0], [0.01, 0]]);
  });
});

describe('Intermediario de Cercanías en vivo', () => {
  const now = Date.UTC(2026, 10, 24, 9);
  const vehicles = { header: { timestamp: String(now / 1000) }, entity: [
    { id: 'VP_C2-24026', vehicle: { trip: { tripId: '4027M24026C2' }, position: { latitude: 39.36203, longitude: -0.41514477 }, currentStatus: 'INCOMING_AT', timestamp: '1795511317', stopId: '64200', vehicle: { id: '24026', label: 'C2-24026-PLATF.(2)' } } },
    { id: 'VP_C6-24315', vehicle: { trip: { tripId: '4027M24315C6' }, position: { latitude: 39.55572, longitude: -0.3181359 }, currentStatus: 'STOPPED_AT', stopId: '65006', vehicle: { id: '24315', label: 'C6-24315' } } },
    { id: 'VP_C1-1', vehicle: { trip: { tripId: '1027M19799C1' }, position: { latitude: 40.4, longitude: -3.7 }, vehicle: { id: '1' } } },
  ] };
  const trips = { entity: [
    { tripUpdate: { trip: { tripId: '4027M24026C2' }, delay: 240 } },
    { tripUpdate: { trip: { tripId: '4027M99999C1', scheduleRelationship: 'CANCELED' } } },
    { tripUpdate: { trip: { tripId: '3027M35713C5' }, delay: 600 } },
  ] };
  const alerts = { entity: [
    { alert: { informedEntity: [{ routeId: '40T0054C3' }, { routeId: '40T0026C3' }], activePeriod: [{ start: '1789039200' }], descriptionText: { translation: [
      { text: '#LÍNEA C3. SERVICIO ALTERNATIVO POR AUTOBÚS entre Font de Sant Lluís y Sant Isidre. Consulte los horarios en: https://renfe.com/x', language: 'es' },
      { text: '#LÍNIA C3. SERVEI ALTERNATIU', language: 'es' },
    ] } } },
    { alert: { informedEntity: [{ routeId: '10T0001C1' }], descriptionText: { translation: [{ text: 'Madrid' }] } } },
    { alert: { informedEntity: [{ routeId: '40T0011C5' }], activePeriod: [{ start: '1', end: '2' }], descriptionText: { translation: [{ text: 'caducado' }] } } },
  ] };
  const p = buildPayload(vehicles, trips, alerts, now);

  it('línea a partir del identificador', () => {
    expect(lineOf('4027M24026C2')).toBe('C2');
    expect(lineOf('40T0054C3')).toBe('C3');
    expect(lineOf('1027M17098C8a')).toBe('C8');
    expect(lineOf('3127M36129T1')).toBe('T1');
  });
  it('solo trenes de València, con retraso en minutos y vía', () => {
    expect(p.trains).toHaveLength(2);
    expect(p.trains[0]).toMatchObject({ id: '24026', line: 'C2', delay: 4, platform: '2', stop: '64200', status: 'INCOMING_AT', lat: 39.36203, lng: -0.41514 });
    expect(p.trains[1]).toMatchObject({ line: 'C6', delay: null, platform: '' });
    expect(p.cancelled).toBe(1);
  });
  it('avisos vigentes de València, en castellano y sin enlaces', () => {
    expect(p.notices).toEqual([{ lines: ['C3'], text: 'LÍNEA C3. SERVICIO ALTERNATIVO POR AUTOBÚS entre Font de Sant Lluís y Sant Isidre.' }]);
    expect(noticesFor(p.notices, ['C1', 'C3'])).toHaveLength(1);
    expect(noticesFor(p.notices, ['C1'])).toHaveLength(0);
  });
  it('trenes en el mapa con el color de su línea y etiqueta de retraso', () => {
    const g = trainsGeo(p, { built: '', lines: [{ line: 'C2', color: '#F79529', name: '', coords: [] }], stations: [{ id: '64200', name: 'Silla', at: [0, 0], lines: ['C2'] }] });
    expect(g.features[0].properties).toMatchObject({ color: '#F79529', tag: 'C2 +4′', stop: 'Silla', delay: 4 });
    expect(g.features[1].properties).toMatchObject({ color: '#64748b', tag: 'C6', delay: -1 });
  });
});
