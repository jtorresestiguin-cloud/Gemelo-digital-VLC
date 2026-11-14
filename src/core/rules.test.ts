import { describe, expect, it } from 'vitest';
import { evaluateRules, summarizeZones } from './rules';
import type { CityState, TrafficSegment } from './types';
import { METRO_LINES } from '../data/static';

const seg = (id: string, zoneId: string, state: TrafficSegment['state']): TrafficSegment => ({
  id, name: id, zoneId, state, coords: [[-0.35, 39.465], [-0.349, 39.465]],
});

const base = (): CityState => ({
  traffic: [], bikes: [], air: [], incidents: [], noise: [], services: [], buses: [], busStops: [], busRoutes: [],
  metro: METRO_LINES.map((l) => ({ ...l, delayMin: 0, status: 'ok' as const })),
  weather: { temperature: 20, precipitation: 0, windSpeed: 5, weatherCode: 0 },
});

describe('motor de reglas', () => {
  it('sin datos no genera alertas', () => {
    expect(evaluateRules(base(), 0)).toEqual([]);
  });

  it('R1: choque + atasco sin lluvia es aviso; con lluvia es crítica y recomienda metro', () => {
    const s = base();
    s.traffic = [seg('a', 'camins', 'congested'), seg('b', 'camins', 'dense'), seg('c', 'camins', 'fluid')];
    s.incidents = [{ id: 'i1', type: 'accident', lngLat: [-0.345, 39.462], zoneId: 'camins', severity: 3, ts: 0 }];

    const dry = evaluateRules(s, 0).find((a) => a.ruleId === 'R1')!;
    expect(dry.severity).toBe('warning');

    s.weather!.precipitation = 6;
    const wet = evaluateRules(s, 0).find((a) => a.ruleId === 'R1')!;
    expect(wet.severity).toBe('critical');
    expect(wet.sources).toContain('weather');
    expect(wet.recommendation?.targetName).toBe('Ayora');
  });

  it('R1: la ruta recomendada evita estaciones cuyas líneas están todas interrumpidas', () => {
    const s = base();
    s.traffic = [seg('a', 'camins', 'congested'), seg('b', 'camins', 'congested')];
    s.incidents = [{ id: 'i1', type: 'accident', lngLat: [-0.345, 39.462], zoneId: 'camins', severity: 3, ts: 0 }];
    s.metro = s.metro.map((l) => (l.id === 'L5' || l.id === 'L7' ? { ...l, status: 'interrupted' } : l));
    const a = evaluateRules(s, 0).find((x) => x.ruleId === 'R1')!;
    expect(['Ayora', 'Amistat', 'Aragó']).not.toContain(a.recommendation?.targetName);
  });

  it('R2: contaminación solo alerta si coincide con congestión', () => {
    const s = base();
    s.air = [{ id: 'x', name: 'X', lngLat: [-0.37, 39.464], zoneId: 'eixample', no2: 210 }];
    expect(evaluateRules(s, 0).some((a) => a.ruleId === 'R2')).toBe(false);
    s.traffic = [seg('a', 'eixample', 'congested'), seg('b', 'eixample', 'congested')];
    const a = evaluateRules(s, 0).find((x) => x.ruleId === 'R2')!;
    expect(a.severity).toBe('critical');
  });

  it('R3: lluvia fuerte avisa en distritos inundables y escala con metro interrumpido', () => {
    const s = base();
    s.weather!.precipitation = 18;
    const r3 = evaluateRules(s, 0).filter((a) => a.ruleId === 'R3');
    expect(r3.map((a) => a.zoneId).sort()).toEqual(['camins', 'poblats-maritims', 'pobles-sud', 'quatre-carreres']);
    expect(r3.every((a) => a.severity === 'warning')).toBe(true);
    s.metro[0] = { ...s.metro[0], status: 'interrupted' };
    expect(evaluateRules(s, 0).filter((a) => a.ruleId === 'R3').every((a) => a.severity === 'critical')).toBe(true);
  });

  it('R4: cola en el puerto + congestión marítima', () => {
    const s = base();
    s.port = { cranesActive: 8, cranesTotal: 18, gateQueue: 55, berthOccupancy: 90 };
    expect(evaluateRules(s, 0).some((a) => a.ruleId === 'R4')).toBe(false);
    s.traffic = [seg('p', 'poblats-maritims', 'congested')];
    expect(evaluateRules(s, 0).find((a) => a.ruleId === 'R4')?.zoneId).toBe('poblats-maritims');
  });

  it('R1 y R3 usan los servicios públicos: hospital más cercano y equipamientos sensibles', () => {
    const s = base();
    s.services = [
      { id: 'h1', name: 'Hospital Lejano', category: 'health', kind: 'Hospital', lngLat: [-0.40, 39.49], zoneId: 'campanar', emergency: true },
      { id: 'h2', name: 'Hospital Cercano', category: 'health', kind: 'Hospital', lngLat: [-0.346, 39.463], zoneId: 'camins', emergency: true },
      { id: 'h3', name: 'Clínica sin urgencias', category: 'health', kind: 'Hospital', lngLat: [-0.3451, 39.4621], zoneId: 'camins' },
      { id: 'c1', name: 'CEIP A', category: 'education', kind: 'Colegio / instituto', lngLat: [-0.35, 39.465], zoneId: 'camins' },
      { id: 'c2', name: 'EI B', category: 'education', kind: 'Escuela infantil', lngLat: [-0.35, 39.466], zoneId: 'camins' },
      { id: 'f1', name: 'Farmacia', category: 'health', kind: 'Farmacia', lngLat: [-0.35, 39.466], zoneId: 'camins' },
      { id: 'r1', name: 'Residencia', category: 'social', kind: 'Servicio social / residencia', lngLat: [-0.35, 39.467], zoneId: 'camins' },
    ];
    s.traffic = [seg('a', 'camins', 'congested'), seg('b', 'camins', 'congested')];
    s.incidents = [{ id: 'i1', type: 'accident', lngLat: [-0.345, 39.462], zoneId: 'camins', severity: 3, ts: 0 }];
    s.weather!.precipitation = 18;
    const alerts = evaluateRules(s, 0);
    const r1 = alerts.find((a) => a.ruleId === 'R1')!;
    expect(r1.description).toContain('Hospital Cercano');
    expect(r1.sources).toContain('services');
    const r3 = alerts.find((a) => a.ruleId === 'R3' && a.zoneId === 'camins')!;
    expect(r3.description).toContain('2 colegios o escuelas infantiles');
    expect(r3.description).toContain('2 centros sanitarios');
    expect(r3.description).toContain('1 servicios sociales');
    expect(r3.recommendation?.text).toContain('colegios');
  });

  it('conserva la fecha de inicio de alertas que siguen activas', () => {
    const s = base();
    s.weather!.precipitation = 18;
    const first = evaluateRules(s, 1000);
    const second = evaluateRules(s, 5000, first);
    expect(second[0].since).toBe(1000);
  });

  it('summarizeZones calcula el ratio de congestión ignorando tramos sin datos', () => {
    const s = base();
    s.traffic = [seg('a', 'jesus', 'congested'), seg('b', 'jesus', 'fluid'), seg('c', 'jesus', 'unknown')];
    expect(summarizeZones(s).get('jesus')!.congestionRatio).toBe(0.5);
  });
});
