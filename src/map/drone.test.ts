import { describe, expect, it } from 'vitest';
import { ZERO_VELOCITY, cruiseSpeed, isIdle, stepDrone, type DroneCamera, type DroneInput } from './drone';

const none: DroneInput = { forward: 0, strafe: 0, climb: 0, yaw: 0, tilt: 0, boost: false };
const cam: DroneCamera = { center: [-0.3763, 39.4699], zoom: 16, bearing: 0, pitch: 60 };

function fly(input: Partial<DroneInput>, seconds: number, start = cam) {
  let c = start, v = { ...ZERO_VELOCITY };
  for (let t = 0; t < seconds; t += 1 / 60) ({ camera: c, velocity: v } = stepDrone(c, v, { ...none, ...input }, 1 / 60));
  return { c, v };
}

describe('modo dron', () => {
  it('W avanza en la dirección de la cámara (norte con rumbo 0, este con rumbo 90)', () => {
    const north = fly({ forward: 1 }, 2).c;
    expect(north.center[1]).toBeGreaterThan(cam.center[1]);
    expect(north.center[0]).toBeCloseTo(cam.center[0], 6);
    const east = fly({ forward: 1 }, 2, { ...cam, bearing: 90 }).c;
    expect(east.center[0]).toBeGreaterThan(cam.center[0]);
    expect(east.center[1]).toBeCloseTo(cam.center[1], 6);
  });

  it('acelera con suavidad hasta la velocidad de crucero y Mayús la triplica', () => {
    const { v } = fly({ forward: 1 }, 3);
    expect(Math.hypot(v.east, v.north)).toBeCloseTo(cruiseSpeed(16), 0);
    const fast = fly({ forward: 1, boost: true }, 3).v;
    expect(Math.hypot(fast.east, fast.north)).toBeCloseTo(3 * cruiseSpeed(16), 0);
    const first = stepDrone(cam, ZERO_VELOCITY, { ...none, forward: 1 }, 1 / 60).velocity;
    expect(Math.hypot(first.east, first.north)).toBeLessThan(cruiseSpeed(16) * 0.1);
  });

  it('sube, gira y mira al horizonte dentro de los límites', () => {
    expect(fly({ climb: 1 }, 2).c.zoom).toBeLessThan(cam.zoom);
    expect(fly({ yaw: 1 }, 1).c.bearing).toBeGreaterThan(30);
    expect(fly({ tilt: 1 }, 5).c.pitch).toBe(85);
    expect(fly({ climb: -1 }, 60).c.zoom).toBe(19.5);
  });

  it('se detiene solo al soltar los controles', () => {
    const moving = fly({ forward: 1 }, 2);
    const stopped = fly({}, 4, moving.c);
    let v = moving.v, c = moving.c;
    for (let t = 0; t < 4; t += 1 / 60) ({ camera: c, velocity: v } = stepDrone(c, v, none, 1 / 60));
    expect(isIdle(v)).toBe(true);
    expect(stopped.c.center[1]).toBeGreaterThan(cam.center[1]);
  });
});
