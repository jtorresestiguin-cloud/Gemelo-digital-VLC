/**
 * Visita guiada interactiva: la cámara vuela a cada parada y gira despacio, pero en cuanto
 * el usuario toca el mapa o el teclado, toma el control y puede explorar libremente.
 */
import type { Map as MlMap } from 'maplibre-gl';
import { flightSeconds } from './camera';
import type { Tour } from './tours';

export interface GuidedState {
  index: number;
  /** la cámara está volando hacia la parada */
  flying: boolean;
  /** el usuario ha tomado el control (se detienen el giro y el avance automático) */
  userControl: boolean;
  autoplay: boolean;
}

export class GuidedTour {
  private index = 0;
  private orbitRaf = 0;
  private autoTimer: ReturnType<typeof setTimeout> | undefined;
  private flying = false;
  private userControl = false;
  private target: HTMLElement;

  constructor(
    private map: MlMap,
    readonly tour: Tour,
    private onChange: (s: GuidedState) => void,
    private autoplay = false,
  ) {
    this.target = map.getCanvasContainer();
    for (const ev of ['mousedown', 'touchstart', 'wheel'] as const) this.target.addEventListener(ev, this.takeControl, { passive: true });
    window.addEventListener('keydown', this.onKey);
  }

  private onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.closest('input, textarea, select, button')) return;
    if (/^(Key[WASDQE]|Arrow)/.test(e.code)) this.takeControl();
  };

  private emit() {
    this.onChange({ index: this.index, flying: this.flying, userControl: this.userControl, autoplay: this.autoplay });
  }

  /** El usuario toca el mapa: se paran el giro y el avance automático. */
  takeControl = () => {
    if (this.userControl && !this.flying) return;
    this.map.stop();
    this.flying = false;
    this.userControl = true;
    this.stopOrbit();
    clearTimeout(this.autoTimer);
    this.emit();
  };

  goTo(i: number) {
    const stops = this.tour.stops;
    this.index = Math.max(0, Math.min(stops.length - 1, i));
    const s = stops[this.index];
    const from = this.map.getCenter().toArray() as [number, number];
    const dur = flightSeconds({ ...s, center: from, zoom: this.map.getZoom() }, s) * 1000;
    this.stopOrbit();
    clearTimeout(this.autoTimer);
    this.userControl = false;
    this.flying = true;
    this.emit();
    this.map.flyTo({ center: s.center, zoom: s.zoom, pitch: s.pitch, bearing: s.bearing, duration: dur, curve: 1.5, essential: true });
    this.map.once('moveend', () => {
      if (!this.flying) return; // interrumpido por el usuario
      this.flying = false;
      this.emit();
      this.startOrbit();
      if (this.autoplay && this.index < stops.length - 1) {
        this.autoTimer = setTimeout(() => this.next(), Math.max(2, s.hold ?? 3) * 1000 + 2500);
      }
    });
  }

  next() { this.goTo(this.index + 1); }
  prev() { this.goTo(this.index - 1); }
  resume() { this.goTo(this.index); }

  setAutoplay(on: boolean) {
    this.autoplay = on;
    if (on && !this.flying && !this.userControl) this.next();
    if (!on) clearTimeout(this.autoTimer);
    this.emit();
  }

  private startOrbit() {
    let last = performance.now();
    const step = (t: number) => {
      if (!this.map.isMoving()) this.map.setBearing(this.map.getBearing() + ((t - last) / 1000) * 5);
      last = t;
      this.orbitRaf = requestAnimationFrame(step);
    };
    this.orbitRaf = requestAnimationFrame(step);
  }

  private stopOrbit() {
    cancelAnimationFrame(this.orbitRaf);
    this.orbitRaf = 0;
  }

  dispose() {
    this.stopOrbit();
    clearTimeout(this.autoTimer);
    this.map.stop();
    for (const ev of ['mousedown', 'touchstart', 'wheel'] as const) this.target.removeEventListener(ev, this.takeControl);
    window.removeEventListener('keydown', this.onKey);
  }
}
