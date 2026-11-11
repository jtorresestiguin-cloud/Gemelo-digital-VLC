import { describe, expect, it } from 'vitest';
import { analyzeRain, parseAccidentCsv, parseDateHour, syntheticStudyData } from './accidents';

describe('análisis accidentes × lluvia', () => {
  it('interpreta formatos de fecha y hora habituales', () => {
    expect(parseDateHour('2024-03-15', '08:30')).toBe('2024-03-15T08');
    expect(parseDateHour('15/03/2024 17:05')).toBe('2024-03-15T17');
    expect(parseDateHour('2024-03-15T23:59:00')).toBe('2024-03-15T23');
    expect(parseDateHour('15-03-2024', '7')).toBe('2024-03-15T07');
    expect(parseDateHour('2024-13-01', '10')).toBeUndefined();
    expect(parseDateHour('2024-03-15')).toBeUndefined();
  });

  it('detecta separador y columnas en el CSV', () => {
    const csv = '﻿Id;Fecha;Hora;Distrito\n1;01/02/2024;08:15;Extramurs\n2;"02/02/2024";18:40;Jesús\n3;sin fecha;;X\n';
    const p = parseAccidentCsv(csv);
    expect(p.keys).toEqual(['2024-02-01T08', '2024-02-02T18']);
    expect(p.skipped).toBe(1);
    expect(p.hourColumn).toBe('hora');
  });

  it('calcula a mano un caso sencillo', () => {
    // 1 estrato (08 h laborable): 2 h lluvia con 2 accidentes, 2 h secas con 1 accidente → RR = 2
    const rain = new Map([['2024-01-02T08', 3], ['2024-01-03T08', 1], ['2024-01-04T08', 0], ['2024-01-05T08', 0]]);
    const r = analyzeRain(['2024-01-02T08', '2024-01-03T08', '2024-01-04T08', '2023-12-31T08'], rain);
    expect(r.crudeRR).toBeCloseTo(2);
    expect(r.adjustedRR).toBeCloseTo(2);
    expect(r.unmatched).toBe(1);
  });

  it('recupera el efecto conocido de los datos sintéticos', () => {
    const { accidents, rain } = syntheticStudyData(2024, 1.5);
    const r = analyzeRain(accidents, rain);
    expect(r.accidents).toBeGreaterThan(5000);
    expect(r.ci95[0]).toBeLessThan(1.5);
    expect(r.ci95[1]).toBeGreaterThan(1.5);
    expect(r.adjustedRR).toBeGreaterThan(1.3);
    expect(r.adjustedRR).toBeLessThan(1.7);
  });
});
