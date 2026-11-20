/**
 * Modo dron: vuelo libre por la ciudad 3D con teclado (o botones táctiles).
 * W/S avanzar/retroceder · A/D desplazarse · Q/E bajar/subir · ←/→ girar · ↑/↓ mirar
 * arriba/abajo · Mayús para ir más rápido. La física es una función pura (stepDrone).
 */
import type { Map as MlMap } from 'maplibre-gl';
import type { LngLat } from '../core/types';

export interface DroneInput {
  forward: number; // -1..1
  strafe: number; // -1..1 (derecha positiva)
  climb: number; // -1..1 (subir positivo)
  yaw: number; // -1..1 (derecha positiva)
  tilt: number; // -1..1 (mirar al horizonte positivo)
  boost: boolean;
}

export interface DroneCamera {
  center: LngLat;
  zoom: number;
  bearing: number;
  pitch: number;
}

export interface DroneVelocity {
  east: number; // m/s
  north: number; // m/s
  zoom: number; // niveles/s
  bearing: number; // grados/s
  pitch: number; // grados/s
}

export const ZERO_VELOCITY: DroneVelocity = { east: 0, north: 0, zoom: 0, bearing: 0, pitch: 0 };

export const DRONE_LIMITS = { minZoom: 11, maxZoom: 19.5, minPitch: 0, maxPitch: 85 };

/** Velocidad de crucero en m/s según la altura (más rápido cuanto más alto). */
export const cruiseSpeed = (zoom: number) => 60 * 2 ** (16 - zoom);

/** Avanza la simulación `dt` segundos con aceleración y frenado suaves. */
export function stepDrone(cam: DroneCamera, vel: DroneVelocity, input: DroneInput, dt: number): { camera: DroneCamera; velocity: DroneVelocity } {
  const boost = input.boost ? 3 : 1;
  const speed = cruiseSpeed(cam.zoom) * boost;
  const r = (cam.bearing * Math.PI) / 180;
  // dirección de avance según el rumbo de la cámara
  const targetEast = (input.forward * Math.sin(r) + input.strafe * Math.cos(r)) * speed;
  const targetNorth = (input.forward * Math.cos(r) - input.strafe * Math.sin(r)) * speed;
  const target: DroneVelocity = {
    east: targetEast,
    north: targetNorth,
    zoom: input.climb * -0.9 * boost,
    bearing: input.yaw * 70,
    pitch: input.tilt * 40,
  };
  // inercia: la velocidad se acerca al objetivo de forma exponencial
  const k = 1 - Math.exp(-dt * 4);
  const v: DroneVelocity = {
    east: vel.east + (target.east - vel.east) * k,
    north: vel.north + (target.north - vel.north) * k,
    zoom: vel.zoom + (target.zoom - vel.zoom) * k,
    bearing: vel.bearing + (target.bearing - vel.bearing) * k,
    pitch: vel.pitch + (target.pitch - vel.pitch) * k,
  };
  const mLat = 1 / 111_320;
  const mLng = 1 / (111_320 * Math.cos((cam.center[1] * Math.PI) / 180));
  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
  return {
    velocity: v,
    camera: {
      center: [cam.center[0] + v.east * dt * mLng, cam.center[1] + v.north * dt * mLat],
      zoom: clamp(cam.zoom + v.zoom * dt, DRONE_LIMITS.minZoom, DRONE_LIMITS.maxZoom),
      bearing: (((cam.bearing + v.bearing * dt) % 360) + 360) % 360,
      pitch: clamp(cam.pitch + v.pitch * dt, DRONE_LIMITS.minPitch, DRONE_LIMITS.maxPitch),
    },
  };
}

export const isIdle = (v: DroneVelocity) =>
  Math.abs(v.east) + Math.abs(v.north) < 0.05 && Math.abs(v.zoom) < 0.001 && Math.abs(v.bearing) < 0.05 && Math.abs(v.pitch) < 0.05;

const KEYS: Record<string, [keyof DroneInput, number]> = {
  KeyW: ['forward', 1], KeyS: ['forward', -1],
  KeyD: ['strafe', 1], KeyA: ['strafe', -1],
  KeyE: ['climb', 1], KeyQ: ['climb', -1],
  ArrowRight: ['yaw', 1], ArrowLeft: ['yaw', -1],
  ArrowUp: ['tilt', 1], ArrowDown: ['tilt', -1],
};

/** Controlador del modo dron sobre un mapa de MapLibre. */
export class DroneController {
  private pressed = new Set<string>();
  private touch: Partial<DroneInput> = {};
  private velocity: DroneVelocity = { ...ZERO_VELOCITY };
  private raf = 0;
  private last = 0;
  private boost = false;
  private prevMaxPitch: number;

  constructor(private map: MlMap) {
    this.prevMaxPitch = map.getMaxPitch();
  }

  /** Entrada desde botones táctiles (se suma a la del teclado). */
  setTouch(input: Partial<DroneInput>) {
    this.touch = input;
    this.wake();
  }

  start() {
    this.map.keyboard.disable(); // las flechas pasan a ser del dron
    this.map.setMaxPitch(DRONE_LIMITS.maxPitch);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.map.keyboard.enable();
    this.map.setMaxPitch(this.prevMaxPitch);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
    if (e.key === 'Shift') this.boost = true;
    if (KEYS[e.code]) {
      e.preventDefault();
      this.pressed.add(e.code);
      this.wake();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Shift') this.boost = false;
    this.pressed.delete(e.code);
  };

  private onBlur = () => {
    this.pressed.clear();
    this.boost = false;
  };

  private input(): DroneInput {
    const i: DroneInput = { forward: 0, strafe: 0, climb: 0, yaw: 0, tilt: 0, boost: this.boost || !!this.touch.boost };
    for (const code of this.pressed) {
      const [axis, v] = KEYS[code];
      (i[axis] as number) += v;
    }
    for (const axis of ['forward', 'strafe', 'climb', 'yaw', 'tilt'] as const) {
      i[axis] = Math.max(-1, Math.min(1, i[axis] + (this.touch[axis] ?? 0)));
    }
    return i;
  }

  private wake() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const m = this.map;
    const cam: DroneCamera = { center: m.getCenter().toArray() as LngLat, zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch() };
    const input = this.input();
    const { camera, velocity } = stepDrone(cam, this.velocity, input, dt);
    this.velocity = velocity;
    const active = Object.values(input).some((v) => v !== 0 && v !== false);
    if (!active && isIdle(velocity)) {
      this.velocity = { ...ZERO_VELOCITY };
      this.raf = 0;
      return;
    }
    m.jumpTo(camera);
    this.raf = requestAnimationFrame(this.frame);
  };
}
