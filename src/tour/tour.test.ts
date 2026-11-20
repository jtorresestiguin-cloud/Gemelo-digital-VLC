import { describe, expect, it } from 'vitest';
import { buildTimeline, cameraAt, flightSeconds } from './camera';
import { LANDMARK_TOUR, parseTour, tourFromServices } from './tours';
import type { PublicService } from '../core/types';

describe('recorrido aéreo', () => {
  const tl = buildTimeline(LANDMARK_TOUR);

  it('el vuelo por València dura alrededor de un minuto', () => {
    expect(tl.duration).toBeGreaterThan(50);
    expect(tl.duration).toBeLessThan(90);
  });

  it('la cámara pasa exactamente por cada parada', () => {
    for (const seg of tl.segments.filter((s) => s.kind === 'hold')) {
      const f = cameraAt(LANDMARK_TOUR, tl, seg.start + 0.0001);
      expect(f.camera.center).toEqual(seg.from.center);
      expect(f.camera.zoom).toBeCloseTo(seg.from.zoom);
      expect(f.stopIndex).toBe(seg.index);
    }
  });

  it('la trayectoria es continua (sin saltos entre fotogramas a 30 fps)', () => {
    let prev = cameraAt(LANDMARK_TOUR, tl, 0).camera;
    for (let t = 1 / 30; t < tl.duration; t += 1 / 30) {
      const c = cameraAt(LANDMARK_TOUR, tl, t).camera;
      expect(Math.abs(c.center[0] - prev.center[0])).toBeLessThan(0.003);
      expect(Math.abs(c.center[1] - prev.center[1])).toBeLessThan(0.003);
      expect(Math.abs(c.zoom - prev.zoom)).toBeLessThan(0.15);
      const db = Math.abs(((c.bearing - prev.bearing + 540) % 360) - 180);
      expect(db).toBeLessThan(6);
      prev = c;
    }
  });

  it('se sube durante los vuelos largos y termina el recorrido', () => {
    const fly = tl.segments.find((s) => s.kind === 'fly' && s.from.name.startsWith('Ciutat'))!;
    const mid = cameraAt(LANDMARK_TOUR, tl, fly.start + fly.duration / 2).camera;
    expect(mid.zoom).toBeLessThan(Math.min(fly.from.zoom, fly.to.zoom));
    expect(cameraAt(LANDMARK_TOUR, tl, tl.duration + 1).done).toBe(true);
    expect(flightSeconds(fly.from, fly.to)).toBeGreaterThan(3);
  });

  it('valida guiones JSON escritos a mano', () => {
    const t = parseTour({ title: 'Prueba', stops: [{ name: 'A', center: [-0.37, 39.47], zoom: 99 }, { name: 'B', center: ['-0.36', 39.46] }] });
    expect(t.stops[0].zoom).toBe(20);
    expect(t.stops[1].center).toEqual([-0.36, 39.46]);
    expect(() => parseTour({ stops: [{ center: [1, 2] }] })).toThrow(/dos paradas/);
    expect(() => parseTour({ stops: [{ center: [1] }, { center: [1, 2] }] })).toThrow(/parada 1/);
  });

  it('genera recorridos a partir de los datos (p. ej. hospitales públicos)', () => {
    const h = (name: string, lng: number, lat: number, pub = true): PublicService => ({ id: name, name, category: 'health', kind: 'Hospital', lngLat: [lng, lat], zoneId: 'x', publicFunded: pub || undefined });
    const tour = tourFromServices([h('A', -0.40, 39.47), h('B', -0.34, 39.48), h('C', -0.37, 39.47), h('Privado', -0.36, 39.46, false)], {
      title: 'Hospitales públicos', filter: (s) => s.kind === 'Hospital' && !!s.publicFunded,
    })!;
    expect(tour.stops.map((s) => s.name)).toEqual(['Hospitales públicos', 'A', 'C', 'B', 'València']);
    expect(tourFromServices([], { title: 'x', filter: () => true })).toBeUndefined();
  });
});

import { pickMimeType } from './player';
import { PROGRESSION } from './music';

describe('grabación y música', () => {
  it('prefiere MP4 y si no WebM', () => {
    expect(pickMimeType((t) => t.startsWith('video/webm'))?.extension).toBe('webm');
    expect(pickMimeType(() => true)?.extension).toBe('mp4');
    expect(pickMimeType((t) => t === 'video/mp4' || t.startsWith('video/webm'))?.extension).toBe('webm');
    expect(pickMimeType(() => false)).toBeNull();
  });
  it('la progresión tiene acordes de tres notas', () => {
    expect(PROGRESSION.every((c) => c.length === 3)).toBe(true);
  });
});
